/**
 * Bakes marked regions into PCM instead of previewing them (see
 * `playbackPlan.ts` for the reversible mute/hide preview this mirrors).
 * Deep module: `Float32Array[]` in, new `Float32Array[]` out — no
 * `AudioBuffer`, no Tauri. Reuses `visibleSpans`'s clamp/merge so a
 * "marked" span here is exactly what the mute/hide preview already shows.
 */

import { MUTE_FADE_SEC } from "./playbackPlan";
import { visibleSpans, type DisplayedInterval } from "./timelineMap";

/**
 * Render a track the way the edited preview sounds it: its own silenced
 * spans muted in place (duration unchanged), then the project's shared
 * cuts spliced out. Order matters — cuts are expressed in source time, so
 * they have to be taken after the mute, which never moves anything.
 * Returns fresh arrays; the input channels are never mutated.
 */
export function renderEdited(
  channels: Float32Array[],
  sampleRate: number,
  mutedIntervals: DisplayedInterval[],
  cuts: DisplayedInterval[],
): Float32Array[] {
  const muted = mutedIntervals.length > 0 ? silenceMarked(channels, sampleRate, mutedIntervals) : channels.map((c) => c.slice());
  return cuts.length > 0 ? removeMarked(muted, sampleRate, cuts) : muted;
}

/**
 * Zero every marked span, in place duration-wise: same length in and out.
 * Fades from the original signal down to silence over the first
 * `MUTE_FADE_SEC` of each marked span, and back up over the last, so the
 * splice doesn't click — the fade lands *inside* the marked span, never
 * touching a sample outside it. A region shorter than 2×`MUTE_FADE_SEC`
 * fades over half its length instead, meeting in the middle.
 */
export function silenceMarked(
  channels: Float32Array[],
  sampleRate: number,
  marked: DisplayedInterval[],
): Float32Array[] {
  const durationSec = channels[0] ? channels[0].length / sampleRate : 0;
  const spans = visibleSpans(durationSec, marked, "hideMarked");

  return channels.map((data) => {
    const out = data.slice();
    for (const span of spans) {
      if (span.kind === "hidden") fadeToSilence(out, span.sourceStart, span.sourceEnd, sampleRate);
    }
    return out;
  });
}

/**
 * Concatenate the kept (unmarked) spans, dropping the marked ones —
 * duration shortens by however much was marked. Each join fades the tail
 * of the outgoing span and the head of the incoming one over
 * `MUTE_FADE_SEC` (or half the shorter span, for a span under
 * 2×`MUTE_FADE_SEC`), the same crossfade `playbackPlan` uses when
 * previewing "Hide marked" — it slightly eats into the kept speech at the
 * join rather than clicking. Throws if every span is marked, since
 * writing an empty buffer isn't a useful "remove".
 */
export function removeMarked(
  channels: Float32Array[],
  sampleRate: number,
  marked: DisplayedInterval[],
): Float32Array[] {
  const durationSec = channels[0] ? channels[0].length / sampleRate : 0;
  const keepSpans = visibleSpans(durationSec, marked, "hideMarked").filter((span) => span.kind === "keep");
  if (keepSpans.length === 0) {
    throw new Error("Cannot remove: every region is marked, nothing would remain.");
  }

  return channels.map((data) => {
    const pieces = keepSpans.map((span, index) => {
      const startIdx = Math.round(span.sourceStart * sampleRate);
      const endIdx = Math.round(span.sourceEnd * sampleRate);
      const piece = data.slice(startIdx, endIdx);
      fadeJoin(piece, sampleRate, index > 0, index < keepSpans.length - 1);
      return piece;
    });
    return concat(pieces);
  });
}

/** Fade `data[startSec, endSec)` from its existing signal down to 0 and back up, both fades landing inside the span. */
function fadeToSilence(data: Float32Array, startSec: number, endSec: number, sampleRate: number): void {
  const startIdx = Math.round(startSec * sampleRate);
  const endIdx = Math.round(endSec * sampleRate);
  const length = endIdx - startIdx;
  if (length <= 0) return;

  const fadeSamples = fadeSampleCount(endSec - startSec, sampleRate);
  for (let i = startIdx; i < endIdx; i++) {
    const edgeDistance = Math.min(i - startIdx, endIdx - 1 - i);
    const gain = edgeDistance < fadeSamples ? 1 - edgeDistance / fadeSamples : 0;
    data[i] *= gain;
  }
}

/** Fade the head and/or tail of a kept piece before it's spliced against its neighbours. */
function fadeJoin(piece: Float32Array, sampleRate: number, fadeIn: boolean, fadeOut: boolean): void {
  const fadeSamples = fadeSampleCount(piece.length / sampleRate, sampleRate);
  if (fadeSamples <= 0) return;

  if (fadeIn) {
    for (let i = 0; i < fadeSamples; i++) piece[i] *= i / fadeSamples;
  }
  if (fadeOut) {
    for (let i = 0; i < fadeSamples; i++) piece[piece.length - 1 - i] *= i / fadeSamples;
  }
}

/** `MUTE_FADE_SEC`, or half the span if that would overlap the span's own midpoint. */
function fadeSampleCount(spanLengthSec: number, sampleRate: number): number {
  const fadeSec = Math.min(MUTE_FADE_SEC, spanLengthSec / 2);
  return Math.round(fadeSec * sampleRate);
}

function concat(pieces: Float32Array[]): Float32Array {
  const total = pieces.reduce((sum, piece) => sum + piece.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const piece of pieces) {
    out.set(piece, offset);
    offset += piece.length;
  }
  return out;
}
