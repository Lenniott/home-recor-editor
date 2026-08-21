/**
 * Pure math behind `SessionState` (`../session.svelte.ts`): shifting
 * regions between a track's own timeline and shared "session time", and
 * encoding N aligned mono channels as one multi-channel WAV. Kept separate
 * from `SessionState` itself (which is Svelte-rune stateful and not
 * exercised by plain vitest) so this logic is directly unit testable, same
 * split as `applyEdits.ts`/`encodeWav.ts` versus `editor.svelte.ts`.
 *
 * Deliberately track-count-agnostic — nothing here assumes exactly two
 * tracks ("host"/"guest"). Any number of independently-recorded tracks
 * (0, 1, 2, or more) goes through the same fold/intersect/align math.
 */

import { encodeWav } from "./encodeWav";
import { type RawMarker } from "./silence";
import type { DisplayedInterval } from "./timelineMap";

/** Shift a set of regions by a fixed offset — from a track's own timeline onto session time (positive `offsetSec`), or back (negative). */
export function shiftRegions(regions: RawMarker[], offsetSec: number): RawMarker[] {
  if (offsetSec === 0) return regions;
  return regions.map((r) => ({ start: r.start + offsetSec, end: r.end + offsetSec }));
}

/**
 * Convert session-time regions onto one track's own [0, durationSec)
 * timeline: undo that track's offset, then clip to what the track
 * actually spans. Regions that land entirely outside the track's audio
 * (e.g. it started recording later than the other tracks' covered span)
 * are dropped.
 */
export function toTrackTime(regions: RawMarker[], offsetSec: number, durationSec: number): DisplayedInterval[] {
  return shiftRegions(regions, -offsetSec)
    .map((r) => ({ start: Math.max(0, r.start), end: Math.min(durationSec, r.end) }))
    .filter((r) => r.end > r.start);
}

/** One track's raw channel data going into a joint multi-channel export. */
export interface JointExportInput {
  channel: Float32Array;
  sampleRate: number;
  /** Manual sync offset, in seconds — see `EditorState.offsetSec`. */
  offsetSec: number;
}

/**
 * Encode any number of tracks as one multi-channel WAV, in the order
 * given, padding whichever starts later with leading silence so all
 * tracks line up at shared session time, then truncating to the shortest
 * of the aligned lengths. Throws on a sample-rate mismatch rather than
 * resampling — see `SessionState.exportJoint`'s docstring for why.
 */
export function encodeJointTracks(tracks: JointExportInput[]): Uint8Array {
  if (tracks.length === 0) throw new Error("No tracks to export.");

  const sampleRate = tracks[0].sampleRate;
  const mismatched = tracks.find((t) => t.sampleRate !== sampleRate);
  if (mismatched) {
    throw new Error(
      `Sample rates differ (${sampleRate}Hz vs ${mismatched.sampleRate}Hz) — ` +
        "re-export the mismatched track to match the others' sample rate before exporting a joint file.",
    );
  }

  const minOffsetSec = Math.min(...tracks.map((t) => t.offsetSec));
  const aligned = tracks.map((t) => alignForExport(t.channel, sampleRate, t.offsetSec, minOffsetSec));
  const length = Math.min(...aligned.map((c) => c.length));

  return encodeWav(aligned.map((c) => c.subarray(0, length)), sampleRate);
}

/** Pad `channel` with leading silence so its start lands at shared session time, relative to whichever track starts earliest (`minOffsetSec`). */
function alignForExport(
  channel: Float32Array,
  sampleRate: number,
  offsetSec: number,
  minOffsetSec: number,
): Float32Array {
  const padSamples = Math.round((offsetSec - minOffsetSec) * sampleRate);
  if (padSamples <= 0) return channel;
  const out = new Float32Array(padSamples + channel.length);
  out.set(channel, padSamples);
  return out;
}
