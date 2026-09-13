/**
 * Multi-track export math: takes each track's edited render (see
 * `renderEdited`) and lines the tracks up with each other, either as
 * separate files of identical length or as one equal-gain stereo mix.
 *
 * Deep module in the same shape as `applyEdits.ts`: `Float32Array[]` in,
 * fresh `Float32Array[]` out — no `AudioBuffer`, no Tauri, no dialogs. The
 * picker/write side lives in `+page.svelte`. Nothing here re-implements
 * muting or splicing; that stays in `renderEdited`, which is exactly what
 * the edited preview sounds.
 */

import { renderEdited } from "./applyEdits";
import { averageChannels } from "./decode";
import { visibleSpans, type DisplayedInterval } from "./timelineMap";

/** Frames in a render — every channel of one render is the same length. */
export function frameCount(channels: Float32Array[]): number {
  return channels.reduce((longest, data) => Math.max(longest, data.length), 0);
}

/**
 * `renderEdited`, but tolerating a track the shared cuts remove entirely.
 * With two tracks of unequal length a cut can cover the whole of the
 * shorter one (its tail is silence, so a long cut there is legitimate),
 * and `removeMarked` refuses to render nothing at all. For a *project*
 * export that's not an error: the track simply contributes silence for
 * the whole exported duration, which is what padding it against the other
 * track produces. Returns one empty array per channel in that case, so
 * the channel layout still survives to `padToFrames`.
 */
export function renderForExport(
  channels: Float32Array[],
  sampleRate: number,
  mutedIntervals: DisplayedInterval[],
  cuts: DisplayedInterval[],
): Float32Array[] {
  const durationSec = sampleRate > 0 ? frameCount(channels) / sampleRate : 0;
  const survives = visibleSpans(durationSec, cuts, "hideMarked").some((span) => span.kind === "keep");
  if (!survives) return channels.map(() => new Float32Array(0));
  return renderEdited(channels, sampleRate, mutedIntervals, cuts);
}

/**
 * Pad every channel with trailing silence to exactly `frames`. A render
 * that's already that long is passed through untouched (`renderEdited`
 * already handed back fresh arrays, so there's nothing to defend). Longer
 * input is truncated, which only guards the caller against a nonsensical
 * target — `alignRenders` never asks for less than it was given.
 */
export function padToFrames(channels: Float32Array[], frames: number): Float32Array[] {
  return channels.map((data) => {
    if (data.length === frames) return data;
    if (data.length > frames) return data.slice(0, frames);
    const padded = new Float32Array(frames);
    padded.set(data);
    return padded;
  });
}

/**
 * Pad every render out to the longest one's frame count, so separate
 * exports of the same project are frame-for-frame the same length. Only
 * the *tail* ever differs: the shorter recording starts at the same
 * moment and simply stops earlier (and shared cuts leave both tracks at
 * the same instants), so trailing silence is the whole of the difference.
 */
export function alignRenders(renders: Float32Array[][]): Float32Array[][] {
  const frames = renders.reduce((longest, render) => Math.max(longest, frameCount(render)), 0);
  return renders.map((render) => padToFrames(render, frames));
}

/**
 * Average a render's channels down to one — `decode.ts`'s `averageChannels`
 * (the same math `mixToMono` applies to an `AudioBuffer`), applied to the
 * raw arrays `renderEdited` returns instead. Always a fresh array.
 */
export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0].slice();
  return averageChannels(channels);
}

/**
 * Stereo mix at equal track gains. Mono feeds both channels; stereo preserves
 * left/right balance, matching Web Audio's speaker interpretation in preview.
 */
export function combineRenders(renders: Float32Array[][]): Float32Array[] {
  if (renders.length === 0) return [new Float32Array(0), new Float32Array(0)];
  const aligned = alignRenders(renders);
  const frames = aligned.reduce((longest, render) => Math.max(longest, frameCount(render)), 0);
  const mix = [new Float32Array(frames), new Float32Array(frames)];
  const gain = 1 / aligned.length;
  for (const render of aligned) {
    for (let channel = 0; channel < 2; channel++) {
      const source = render[render.length === 1 ? 0 : channel];
      if (!source) continue;
      for (let i = 0; i < source.length; i++) mix[channel][i] += source[i] * gain;
    }
  }
  for (const channel of mix)
    for (let i = 0; i < channel.length; i++) channel[i] = Math.max(-1, Math.min(1, channel[i]));
  return mix;
}
