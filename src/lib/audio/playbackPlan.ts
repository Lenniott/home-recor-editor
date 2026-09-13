/**
 * Turns the shared timeline (what cuts and the view filter remove) plus
 * each track's own silenced spans into what the player actually has to
 * schedule: which slices of the source buffers to play back-to-back, and
 * one gain automation curve per track layered on top of all of them.
 * Pure math — the player just feeds this into AudioBufferSourceNode.start()
 * calls and one GainNode per track.
 *
 * Every track is scheduled against the same chunk list, which is what
 * keeps two synced recordings in sync: a cut removes the same span of
 * time from both at once, while a track's own silence only ever ducks
 * its own gain and never moves anything.
 */

import type { DisplayedInterval, TimelineSpan } from "./timelineMap";

/** Fade duration for ducking silenced audio or smoothing a skip splice. */
export const MUTE_FADE_SEC = 0.1;

export interface PlaybackChunk {
  sourceStart: number;
  sourceEnd: number;
  /** Where this chunk starts on the plan's own timeline (0 = playback start). */
  playAt: number;
}

export interface GainEvent {
  /** Time on the plan's timeline, in seconds. */
  time: number;
  value: number;
}

export interface TrackPlaybackInput {
  /**
   * This track's own spans to silence in place (buffer-adjusted
   * `displayed` bounds). They never shorten playback — the gain is ducked
   * across them and the timeline keeps running.
   */
  mutedIntervals: DisplayedInterval[];
  /** Steady-state gain for this track — e.g. 0.5 each when two tracks play at once. Defaults to 1. */
  gain?: number;
}

export interface TrackPlayback {
  /** Constant gain to start the track's GainNode at, before any events. */
  gain: number;
  /** Empty means constant `gain` — no automation needed. */
  gainEvents: GainEvent[];
}

export interface PlaybackPlan {
  /** Shared by every track: one span of the timeline that survives the cuts. */
  chunks: PlaybackChunk[];
  /** Total length of the plan's timeline; sum of all chunk lengths. */
  totalSec: number;
  /** Parallel to the `tracks` argument. */
  tracks: TrackPlayback[];
}

/**
 * Build a plan to play `[startSourceSec, endSourceSec)` of the project's
 * shared timeline: `spans` says which stretches survive (see
 * `EditorState.timelineSpans` — cuts and the view filter both collapse to
 * `hidden` spans), and each entry in `tracks` contributes its own
 * in-place silences.
 *
 * Every join between two chunks is crossfaded over `MUTE_FADE_SEC` on
 * every track so a cut splice doesn't click, and each track's own muted
 * spans are ducked to zero with the same fade at their edges.
 */
export function buildPlaybackPlan(
  spans: TimelineSpan[],
  startSourceSec: number,
  endSourceSec: number,
  tracks: TrackPlaybackInput[],
): PlaybackPlan {
  const chunks = buildChunks(spans, startSourceSec, endSourceSec);
  const last = chunks[chunks.length - 1];
  const totalSec = last ? last.playAt + (last.sourceEnd - last.sourceStart) : 0;
  const spliceEvents = buildSpliceFadeEvents(chunks);

  return {
    chunks,
    totalSec,
    tracks: tracks.map((track) => {
      const gain = track.gain ?? 1;
      const events = [...spliceEvents, ...buildDuckEvents(chunks, track.mutedIntervals)]
        .map((event) => ({ time: event.time, value: event.value * gain }))
        .sort((a, b) => a.time - b.time);
      return { gain, gainEvents: events };
    }),
  };
}

function buildChunks(spans: TimelineSpan[], startSourceSec: number, endSourceSec: number): PlaybackChunk[] {
  const chunks: PlaybackChunk[] = [];
  let playAt = 0;
  for (const span of spans) {
    if (span.kind !== "keep") continue;
    const clippedStart = Math.max(span.sourceStart, startSourceSec);
    const clippedEnd = Math.min(span.sourceEnd, endSourceSec);
    if (clippedEnd <= clippedStart) continue;
    chunks.push({ sourceStart: clippedStart, sourceEnd: clippedEnd, playAt });
    playAt += clippedEnd - clippedStart;
  }
  return chunks;
}

/** Duck gain to 0 wherever a muted interval overlaps a chunk, fading at each edge. */
function buildDuckEvents(chunks: PlaybackChunk[], mutedIntervals: DisplayedInterval[]): GainEvent[] {
  const events: GainEvent[] = [];
  for (const chunk of chunks) {
    const chunkLength = chunk.sourceEnd - chunk.sourceStart;
    const offset = chunk.playAt - chunk.sourceStart;

    for (const region of mutedIntervals) {
      const start = Math.max(region.start, chunk.sourceStart);
      const end = Math.min(region.end, chunk.sourceEnd);
      if (end <= start) continue;

      const fade = Math.min(MUTE_FADE_SEC, (end - start) / 2);
      const clampToChunk = (t: number) => Math.min(Math.max(t, chunk.playAt), chunk.playAt + chunkLength);

      events.push({ time: clampToChunk(start + offset - fade), value: 1 });
      events.push({ time: clampToChunk(start + offset), value: 0 });
      events.push({ time: clampToChunk(end + offset), value: 0 });
      events.push({ time: clampToChunk(end + offset + fade), value: 1 });
    }
  }
  return events;
}

/** Fade out the tail of every chunk (except the last) and fade in the head of every chunk (except the first). */
function buildSpliceFadeEvents(chunks: PlaybackChunk[]): GainEvent[] {
  const events: GainEvent[] = [];
  chunks.forEach((chunk, index) => {
    const length = chunk.sourceEnd - chunk.sourceStart;

    if (index > 0) {
      const fadeIn = Math.min(MUTE_FADE_SEC, length / 2);
      events.push({ time: chunk.playAt, value: 0 });
      events.push({ time: chunk.playAt + fadeIn, value: 1 });
    }
    if (index < chunks.length - 1) {
      const fadeOut = Math.min(MUTE_FADE_SEC, length / 2);
      events.push({ time: chunk.playAt + length - fadeOut, value: 1 });
      events.push({ time: chunk.playAt + length, value: 0 });
    }
  });
  return events;
}
