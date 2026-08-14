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

export interface RawMarker {
  /** Marked boundaries, in seconds, before any buffer is applied. */
  start: number;
  end: number;
}

export interface MarkerBounds {
  start: number;
  end: number;
}

export interface Marker {
  raw: RawMarker;
  /** Marker positions after padding inward by the buffer. Null once the buffer collapses the marker. */
  displayed: MarkerBounds | null;
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
): RawMarker[] {
  if (durationSec <= 0) return [];

  const minSilenceSec = minSilenceMs / 1000;
  const sorted = [...speechSegments].sort((a, b) => a.start - b.start);

  const regions: RawMarker[] = [];
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

/** Frame size for the amplitude scan below — short enough to localize a quiet span's edges, long enough for RMS to be a stable loudness estimate. */
const AMPLITUDE_FRAME_MS = 20;
/** RMS-to-dB floor, so a frame of exact digital silence (`rms === 0`) yields a finite number instead of `-Infinity`. */
const DB_FLOOR = -100;

function rmsToDb(rms: number): number {
  return rms > 0 ? Math.max(DB_FLOOR, 20 * Math.log10(rms)) : DB_FLOOR;
}

/**
 * Second, non-ML way to find silence: flag any stretch quieter than
 * `thresholdDb`, regardless of whether a speech model would call it
 * speech. Catches what VAD misses when it mistakes mic bleed or room
 * tone for speech — a raw loudness floor doesn't care what the sound
 * *is*, only how loud it is. Unlike `silenceRegionsFromSpeechSegments`,
 * this finds silence directly rather than inverting speech into gaps,
 * since there's no separate "speech" pass to invert.
 */
export function silenceRegionsFromAmplitude(
  samples: Float32Array,
  sampleRate: number,
  thresholdDb: number,
  minSilenceMs: number,
): RawMarker[] {
  if (samples.length === 0 || sampleRate <= 0) return [];

  const frameSize = Math.max(1, Math.round((sampleRate * AMPLITUDE_FRAME_MS) / 1000));
  const minSilenceSec = minSilenceMs / 1000;
  const regions: RawMarker[] = [];

  let quietStartSec: number | null = null;
  for (let frameStart = 0; frameStart < samples.length; frameStart += frameSize) {
    const frameEnd = Math.min(samples.length, frameStart + frameSize);
    let sumSquares = 0;
    for (let i = frameStart; i < frameEnd; i++) sumSquares += samples[i] * samples[i];
    const rms = Math.sqrt(sumSquares / (frameEnd - frameStart));
    const isQuiet = rmsToDb(rms) <= thresholdDb;

    if (isQuiet && quietStartSec === null) {
      quietStartSec = frameStart / sampleRate;
    } else if (!isQuiet && quietStartSec !== null) {
      const endSec = frameStart / sampleRate;
      if (endSec - quietStartSec >= minSilenceSec) regions.push({ start: quietStartSec, end: endSec });
      quietStartSec = null;
    }
  }
  if (quietStartSec !== null) {
    const endSec = samples.length / sampleRate;
    if (endSec - quietStartSec >= minSilenceSec) regions.push({ start: quietStartSec, end: endSec });
  }

  return regions;
}

/**
 * Pad each raw marker inward by `bufferMs` on both sides. Markers the
 * buffer collapses entirely (start would land at or after end) get
 * `displayed: null` — callers should skip those rather than render a
 * degenerate marker pair.
 */
export function applySilenceBuffer(regions: RawMarker[], bufferMs: number): Marker[] {
  const bufferSec = bufferMs / 1000;
  return regions.map((raw) => {
    const start = raw.start + bufferSec;
    const end = raw.end - bufferSec;
    return { raw, displayed: start < end ? { start, end } : null };
  });
}

/**
 * Recompute a raw marker's boundary from a dragged displayed marker,
 * inverting the buffer pad so the marker keeps working with the buffer
 * slider afterwards.
 */
export function moveMarker(
  raw: RawMarker,
  bufferMs: number,
  edge: "start" | "end",
  newDisplayedSeconds: number,
): RawMarker {
  const bufferSec = bufferMs / 1000;
  if (edge === "start") {
    const start = Math.max(0, newDisplayedSeconds - bufferSec);
    return { start: Math.min(start, raw.end), end: raw.end };
  }
  const end = Math.max(raw.start, newDisplayedSeconds + bufferSec);
  return { start: raw.start, end };
}

/**
 * Add [start, end] to a set of raw regions, merging it with any region it
 * touches or overlaps so the set never holds redundant overlapping entries.
 * This is how a manual "Mark" drag joins up with Detect's output (or with
 * a previous manual mark) instead of stacking duplicate bands.
 */
export function unionInterval(
  regions: RawMarker[],
  start: number,
  end: number,
): RawMarker[] {
  if (end <= start) return [...regions];

  const merged: RawMarker[] = [];
  let pendingStart = start;
  let pendingEnd = end;

  for (const region of [...regions].sort((a, b) => a.start - b.start)) {
    if (region.end < pendingStart) {
      merged.push(region);
    } else if (region.start > pendingEnd) {
      merged.push({ start: pendingStart, end: pendingEnd });
      pendingStart = region.start;
      pendingEnd = region.end;
    } else {
      pendingStart = Math.min(pendingStart, region.start);
      pendingEnd = Math.max(pendingEnd, region.end);
    }
  }
  merged.push({ start: pendingStart, end: pendingEnd });

  return merged.sort((a, b) => a.start - b.start);
}

/**
 * Remove [start, end] from a set of raw regions. A range that carves out
 * the middle of a region splits it in two (e.g. marked 1-10, unmark 4-6
 * leaves 1-4 and 6-10); a range that only touches an edge trims that
 * region; a range that fully covers a region drops it.
 */
export function subtractInterval(
  regions: RawMarker[],
  start: number,
  end: number,
): RawMarker[] {
  if (end <= start) return [...regions];

  const result: RawMarker[] = [];
  for (const region of regions) {
    if (end <= region.start || start >= region.end) {
      result.push(region);
      continue;
    }
    if (start > region.start) {
      result.push({ start: region.start, end: start });
    }
    if (end < region.end) {
      result.push({ start: end, end: region.end });
    }
  }
  return result.sort((a, b) => a.start - b.start);
}
