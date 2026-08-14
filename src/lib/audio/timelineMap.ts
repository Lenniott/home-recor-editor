/**
 * Maps source (file) time to "kept" time and back, given a view filter
 * that hides either the marked or unmarked portions of the take. Hidden
 * spans occupy zero kept seconds — collapsing them is what lets the
 * waveform and playback skip straight from one kept span to the next.
 *
 * Pure math — no canvas, no Web Audio — so pixel gutters (drawn by the
 * waveform) and audio scheduling (built by playbackPlan) can each layer
 * their own concerns on top of the same span list.
 */

export type ViewFilter = "all" | "hideMarked" | "hideUnmarked";

export interface DisplayedInterval {
  start: number;
  end: number;
}

export interface TimelineSpan {
  kind: "keep" | "hidden";
  sourceStart: number;
  sourceEnd: number;
  /** Cumulative kept seconds at sourceStart. Equal to keptEnd for hidden spans (zero width). */
  keptStart: number;
  keptEnd: number;
}

/**
 * Partition [0, durationSec] into spans, alternating marked/unmarked, then
 * mark each span "keep" or "hidden" according to `filter`. "all" always
 * returns a single keep span covering the whole file.
 */
export function visibleSpans(
  durationSec: number,
  displayedRegions: DisplayedInterval[],
  filter: ViewFilter,
): TimelineSpan[] {
  if (durationSec <= 0) return [];

  if (filter === "all") {
    return [{ kind: "keep", sourceStart: 0, sourceEnd: durationSec, keptStart: 0, keptEnd: durationSec }];
  }

  const marked = normalizeIntervals(displayedRegions, durationSec);

  const partition: { start: number; end: number; marked: boolean }[] = [];
  let cursor = 0;
  for (const region of marked) {
    if (region.start > cursor) partition.push({ start: cursor, end: region.start, marked: false });
    partition.push({ start: Math.max(cursor, region.start), end: Math.max(region.start, region.end), marked: true });
    cursor = Math.max(cursor, region.end);
  }
  if (cursor < durationSec) partition.push({ start: cursor, end: durationSec, marked: false });

  const spans: TimelineSpan[] = [];
  let kept = 0;
  for (const piece of partition) {
    const length = piece.end - piece.start;
    if (length <= 0) continue;
    const isKeep = filter === "hideMarked" ? !piece.marked : piece.marked;
    const keptStart = kept;
    const keptEnd = isKeep ? kept + length : kept;
    spans.push({ kind: isKeep ? "keep" : "hidden", sourceStart: piece.start, sourceEnd: piece.end, keptStart, keptEnd });
    kept = keptEnd;
  }
  return spans;
}

/** Total kept seconds across all spans (the length of the collapsed timeline). */
export function keptDuration(spans: TimelineSpan[]): number {
  if (spans.length === 0) return 0;
  return spans[spans.length - 1].keptEnd;
}

/**
 * Where a source-time instant lands on the kept timeline. Times inside a
 * hidden span all collapse to the same point (the span's entry edge) since
 * hidden spans have zero kept width.
 */
export function sourceToKept(spans: TimelineSpan[], sourceSec: number): number {
  if (spans.length === 0) return 0;
  const last = spans[spans.length - 1];
  const clamped = clamp(sourceSec, spans[0].sourceStart, last.sourceEnd);

  for (const span of spans) {
    if (clamped <= span.sourceEnd || span === last) {
      if (span.kind === "hidden") return span.keptStart;
      const width = span.sourceEnd - span.sourceStart;
      const ratio = width > 0 ? (clamped - span.sourceStart) / width : 0;
      return span.keptStart + ratio * (span.keptEnd - span.keptStart);
    }
  }
  return last.keptEnd;
}

/**
 * Inverse of `sourceToKept`. Always lands inside a keep span (hidden spans
 * are invisible in kept time), so a kept-time instant exactly on a
 * collapse boundary resolves to the nearest keep span in timeline order.
 */
export function keptToSource(spans: TimelineSpan[], keptSec: number): number {
  const keepSpans = spans.filter((span) => span.kind === "keep");
  if (keepSpans.length === 0) return spans[0]?.sourceStart ?? 0;

  const last = keepSpans[keepSpans.length - 1];
  const clamped = clamp(keptSec, keepSpans[0].keptStart, last.keptEnd);

  for (const span of keepSpans) {
    if (clamped <= span.keptEnd || span === last) {
      const width = span.keptEnd - span.keptStart;
      const ratio = width > 0 ? (clamped - span.keptStart) / width : 0;
      return span.sourceStart + ratio * (span.sourceEnd - span.sourceStart);
    }
  }
  return last.sourceEnd;
}

function normalizeIntervals(intervals: DisplayedInterval[], durationSec: number): DisplayedInterval[] {
  const clamped = intervals
    .map((interval) => ({ start: clamp(interval.start, 0, durationSec), end: clamp(interval.end, 0, durationSec) }))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);

  const merged: DisplayedInterval[] = [];
  for (const interval of clamped) {
    const prev = merged[merged.length - 1];
    if (prev && interval.start <= prev.end) {
      prev.end = Math.max(prev.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
