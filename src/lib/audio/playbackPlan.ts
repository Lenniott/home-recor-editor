/**
 * Turns timeline spans (what the view filter is hiding) plus the mute
 * flag into what the player actually has to schedule: which slices of
 * the source buffer to play back-to-back, and a gain automation curve
 * layered on top of all of them. Pure math — the player just feeds this
 * into AudioBufferSourceNode.start() calls and a GainNode.
 */

import type { DisplayedInterval, TimelineSpan, ViewFilter } from "./timelineMap";

/** Fade duration for ducking marked audio or smoothing a skip splice. */
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

export interface PlaybackPlan {
  chunks: PlaybackChunk[];
  /** Empty means constant gain 1 — no automation needed. */
  gainEvents: GainEvent[];
  /** Total length of the plan's timeline; sum of all chunk lengths. */
  totalSec: number;
}

/**
 * Build a plan to play `[startSourceSec, endSourceSec)` of the source
 * buffer, skipping any `hidden` spans (the current view filter) and,
 * when `muteMarked` is on, silencing marked audio with a 100ms fade
 * (ducked in place for "all", faded across the splice for "hideMarked").
 * "hideUnmarked" ignores `muteMarked` — muting the only audio left to
 * hear would be pointless.
 */
export function buildPlaybackPlan(
  spans: TimelineSpan[],
  startSourceSec: number,
  endSourceSec: number,
  filter: ViewFilter,
  muteMarked: boolean,
  markedIntervals: DisplayedInterval[],
): PlaybackPlan {
  const chunks = buildChunks(spans, startSourceSec, endSourceSec);
  const last = chunks[chunks.length - 1];
  const totalSec = last ? last.playAt + (last.sourceEnd - last.sourceStart) : 0;

  if (!muteMarked || filter === "hideUnmarked") {
    return { chunks, gainEvents: [], totalSec };
  }

  const gainEvents =
    filter === "all" ? buildDuckEvents(chunks, markedIntervals) : buildSpliceFadeEvents(chunks);

  return { chunks, gainEvents: gainEvents.sort((a, b) => a.time - b.time), totalSec };
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

/** Duck gain to 0 wherever a marked interval overlaps a chunk, fading at each edge. */
function buildDuckEvents(chunks: PlaybackChunk[], markedIntervals: DisplayedInterval[]): GainEvent[] {
  const events: GainEvent[] = [];
  for (const chunk of chunks) {
    const chunkLength = chunk.sourceEnd - chunk.sourceStart;
    const offset = chunk.playAt - chunk.sourceStart;

    for (const region of markedIntervals) {
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
