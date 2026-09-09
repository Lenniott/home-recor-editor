import { describe, expect, it } from "vitest";
import { buildPlaybackPlan, MUTE_FADE_SEC } from "./playbackPlan";
import { visibleSpans } from "./timelineMap";

/** The shared timeline the editor builds: every hidden span (a cut, or what the view filter collapses) is skipped. */
const timeline = (durationSec: number, hidden: { start: number; end: number }[] = []) =>
  visibleSpans(durationSec, hidden, hidden.length ? "hideMarked" : "all");

describe("buildPlaybackPlan", () => {
  it("plays the full range as one chunk with no gain events when nothing is cut or silenced", () => {
    const plan = buildPlaybackPlan(timeline(10), 0, 10, [{ mutedIntervals: [] }]);

    expect(plan.chunks).toEqual([{ sourceStart: 0, sourceEnd: 10, playAt: 0 }]);
    expect(plan.tracks[0].gainEvents).toEqual([]);
    expect(plan.tracks[0].gain).toBe(1);
    expect(plan.totalSec).toBe(10);
  });

  it("skips cut spans, shortening the timeline for every track at once", () => {
    const plan = buildPlaybackPlan(timeline(10, [{ start: 2, end: 4 }]), 0, 10, [
      { mutedIntervals: [] },
      { mutedIntervals: [] },
    ]);

    expect(plan.chunks).toEqual([
      { sourceStart: 0, sourceEnd: 2, playAt: 0 },
      { sourceStart: 4, sourceEnd: 10, playAt: 2 },
    ]);
    expect(plan.totalSec).toBe(8);
    // Both tracks get the same splice crossfade across the join, so the cut doesn't click on either.
    expect(plan.tracks[0].gainEvents).toEqual(plan.tracks[1].gainEvents);
    expect(plan.tracks[0].gainEvents).toEqual([
      { time: 2 - MUTE_FADE_SEC, value: 1 },
      { time: 2, value: 0 },
      { time: 2, value: 0 },
      { time: 2 + MUTE_FADE_SEC, value: 1 },
    ]);
  });

  it("clips chunks to the requested start/end range", () => {
    const plan = buildPlaybackPlan(timeline(10), 3, 7, [{ mutedIntervals: [] }]);

    expect(plan.chunks).toEqual([{ sourceStart: 3, sourceEnd: 7, playAt: 0 }]);
    expect(plan.totalSec).toBe(4);
  });

  it("ducks a track's silenced spans in place, fading at each edge, without shortening anything", () => {
    const plan = buildPlaybackPlan(timeline(10), 0, 10, [{ mutedIntervals: [{ start: 2, end: 4 }] }]);

    expect(plan.chunks).toEqual([{ sourceStart: 0, sourceEnd: 10, playAt: 0 }]);
    expect(plan.totalSec).toBe(10);
    expect(plan.tracks[0].gainEvents).toEqual([
      { time: 2 - MUTE_FADE_SEC, value: 1 },
      { time: 2, value: 0 },
      { time: 4, value: 0 },
      { time: 4 + MUTE_FADE_SEC, value: 1 },
    ]);
  });

  it("silences one track without touching the other", () => {
    const plan = buildPlaybackPlan(timeline(10), 0, 10, [
      { mutedIntervals: [{ start: 2, end: 4 }] },
      { mutedIntervals: [] },
    ]);

    expect(plan.tracks[0].gainEvents).toHaveLength(4);
    expect(plan.tracks[1].gainEvents).toEqual([]);
    expect(plan.totalSec).toBe(10);
  });

  it("halves the fade for a silenced region shorter than 200ms", () => {
    const plan = buildPlaybackPlan(timeline(10), 0, 10, [{ mutedIntervals: [{ start: 2, end: 2.1 }] }]);

    const fade = 0.05;
    const events = plan.tracks[0].gainEvents;
    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({ time: 2 - fade, value: 1 });
    expect(events[1]).toEqual({ time: 2, value: 0 });
    expect(events[2]).toEqual({ time: 2.1, value: 0 });
    expect(events[3].value).toBe(1);
    expect(events[3].time).toBeCloseTo(2.1 + fade);
  });

  it("clamps duck fades that would spill past the start or end of the played range", () => {
    const plan = buildPlaybackPlan(timeline(10), 0, 10, [{ mutedIntervals: [{ start: 0, end: 1 }] }]);

    expect(plan.tracks[0].gainEvents[0]).toEqual({ time: 0, value: 1 });
  });

  it("scales every gain value by the track's steady-state gain", () => {
    const plan = buildPlaybackPlan(timeline(10), 0, 10, [{ mutedIntervals: [{ start: 2, end: 4 }], gain: 0.5 }]);

    expect(plan.tracks[0].gain).toBe(0.5);
    expect(plan.tracks[0].gainEvents).toEqual([
      { time: 2 - MUTE_FADE_SEC, value: 0.5 },
      { time: 2, value: 0 },
      { time: 4, value: 0 },
      { time: 4 + MUTE_FADE_SEC, value: 0.5 },
    ]);
  });

  it("does not fade the very first or very last chunk edge", () => {
    const plan = buildPlaybackPlan(timeline(10, [{ start: 0, end: 2 }, { start: 8, end: 10 }]), 0, 10, [
      { mutedIntervals: [] },
    ]);

    // Single keep chunk [2,8] with no neighbours in the plan: no fade events at all.
    expect(plan.chunks).toEqual([{ sourceStart: 2, sourceEnd: 8, playAt: 0 }]);
    expect(plan.tracks[0].gainEvents).toEqual([]);
  });

  it("produces an empty plan when nothing is kept in the requested range", () => {
    const plan = buildPlaybackPlan(timeline(10, [{ start: 0, end: 10 }]), 0, 10, [{ mutedIntervals: [] }]);

    expect(plan.chunks).toEqual([]);
    expect(plan.tracks[0].gainEvents).toEqual([]);
    expect(plan.totalSec).toBe(0);
  });
});
