/**
 * Turns VAD speech segments into silence regions, with a configurable
 * buffer pad applied after the fact. Pure math — no ONNX, no Web Audio —
 * so it can be unit tested and re-run cheaply whenever a control changes.
 * (Actually running the VAD model lives in ./vad.ts, off the main thread.)
 */

export interface SpeechSegment {
  /** Speech boundaries in seconds, as returned by the VAD model. */
  start: number;
  end: number;
}

export interface RawSilenceRegion {
  /** Acoustic silence boundaries, in seconds, before any buffer is applied. */
  start: number;
  end: number;
}

export interface DisplayedMarkers {
  start: number;
  end: number;
}

export interface SilenceRegion {
  raw: RawSilenceRegion;
  /** Marker positions after padding inward by the buffer. Null once the buffer collapses the region. */
  displayed: DisplayedMarkers | null;
}

/**
 * Invert speech segments into silence regions: the gap before the first
 * segment, the gaps between segments, and the gap after the last one.
 * Gaps shorter than `minSilenceMs` are dropped — a brief pause between
 * words isn't a cut point.
 */
export function silenceRegionsFromSpeechSegments(
  speechSegments: SpeechSegment[],
  durationSec: number,
  minSilenceMs: number,
): RawSilenceRegion[] {
  if (durationSec <= 0) return [];

  const minSilenceSec = minSilenceMs / 1000;
  const sorted = [...speechSegments].sort((a, b) => a.start - b.start);

  const regions: RawSilenceRegion[] = [];
  let cursor = 0;
  for (const segment of sorted) {
    const start = cursor;
    const end = Math.min(Math.max(segment.start, cursor), durationSec);
    if (end - start >= minSilenceSec) {
      regions.push({ start, end });
    }
    cursor = Math.max(cursor, Math.min(segment.end, durationSec));
  }
  if (durationSec - cursor >= minSilenceSec) {
    regions.push({ start: cursor, end: durationSec });
  }
  return regions;
}

/**
 * Pad each raw region inward by `bufferMs` on both sides. Regions the
 * buffer collapses entirely (start would land at or after end) get
 * `displayed: null` — callers should skip those rather than render a
 * degenerate marker pair.
 */
export function applySilenceBuffer(regions: RawSilenceRegion[], bufferMs: number): SilenceRegion[] {
  const bufferSec = bufferMs / 1000;
  return regions.map((raw) => {
    const start = raw.start + bufferSec;
    const end = raw.end - bufferSec;
    return { raw, displayed: start < end ? { start, end } : null };
  });
}

/**
 * Recompute a raw region's boundary from a dragged displayed marker,
 * inverting the buffer pad so the region keeps working with the buffer
 * slider afterwards.
 */
export function moveSilenceMarker(
  raw: RawSilenceRegion,
  bufferMs: number,
  edge: "start" | "end",
  newDisplayedSeconds: number,
): RawSilenceRegion {
  const bufferSec = bufferMs / 1000;
  if (edge === "start") {
    const start = Math.max(0, newDisplayedSeconds - bufferSec);
    return { start: Math.min(start, raw.end), end: raw.end };
  }
  const end = Math.max(raw.start, newDisplayedSeconds + bufferSec);
  return { start: raw.start, end };
}
