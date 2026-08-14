import type { DisplayedInterval } from "./timelineMap";

export type NavDirection = "next" | "prev";

/** Padding around a fitted region, as a fraction of its own width, added to each side. */
const FIT_PADDING_FRACTION = 0.1;
/** Same floor as wheel-zoom in Waveform.svelte — fitting a very short region shouldn't zoom past what the waveform can usefully render. */
const MIN_VIEW_SECONDS = 0.2;

export interface ViewWindow {
  startSec: number;
  durationSec: number;
}

function sortedByStart(regions: DisplayedInterval[]): DisplayedInterval[] {
  return [...regions].sort((a, b) => a.start - b.start);
}

/** Index of the region the playhead currently sits inside, or -1 if it's in a gap (or on/after a region's end). */
function containingIndex(sorted: DisplayedInterval[], playheadSec: number): number {
  return sorted.findIndex((r) => playheadSec >= r.start && playheadSec < r.end);
}

/**
 * Next/prev marked region relative to wherever the playhead is right now
 * — not to a stored index, which would go stale across Detect/undo/manual
 * seeks. Containment is checked first: once the playhead is inside a
 * region, stepping is a plain ±1 through the sorted list, wrapping. That
 * matters for "prev" in particular — comparing only against `start` would
 * break the moment the playhead ticks even slightly past a region's exact
 * start (immediately on Play, or a mid-region click), matching the same
 * region again instead of the one before it.
 *
 * Outside any region (a gap), "next" is the first region ahead and "prev"
 * is the last region behind, both wrapping.
 */
export function adjacentMarkedRegion(
  regions: DisplayedInterval[],
  playheadSec: number,
  direction: NavDirection,
): DisplayedInterval | null {
  const sorted = sortedByStart(regions);
  if (sorted.length === 0) return null;

  const inside = containingIndex(sorted, playheadSec);
  if (inside !== -1) {
    const step = direction === "next" ? 1 : -1;
    return sorted[(inside + step + sorted.length) % sorted.length];
  }

  if (direction === "next") {
    return sorted.find((r) => r.start > playheadSec) ?? sorted[0];
  }
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].end <= playheadSec) return sorted[i];
  }
  return sorted[sorted.length - 1];
}

/**
 * 1-based position of the region the playhead is currently inside, for
 * the "3 / 12" readout next to the nav buttons — null when the playhead
 * is in a gap (nothing to highlight as "current" yet).
 */
export function currentRegionNumber(regions: DisplayedInterval[], playheadSec: number): number | null {
  const sorted = sortedByStart(regions);
  const index = containingIndex(sorted, playheadSec);
  return index === -1 ? null : index + 1;
}

/**
 * Zoom window (source seconds — caller must be in the "all" view filter,
 * where kept time equals source time) that fits `region` with ~10%
 * padding on each side, floored at `MIN_VIEW_SECONDS` and clamped to
 * `[0, totalDurationSec]`.
 */
export function fitWindow(region: DisplayedInterval, totalDurationSec: number): ViewWindow {
  const width = region.end - region.start;
  const padding = width * FIT_PADDING_FRACTION;
  const paddedStart = Math.max(0, region.start - padding);
  const paddedEnd = Math.min(totalDurationSec, region.end + padding);
  const durationSec = Math.min(Math.max(MIN_VIEW_SECONDS, paddedEnd - paddedStart), totalDurationSec || MIN_VIEW_SECONDS);
  const startSec = Math.min(paddedStart, Math.max(0, totalDurationSec - durationSec));
  return { startSec, durationSec };
}
