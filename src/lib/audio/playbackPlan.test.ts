import { describe, expect, it } from "vitest";
import { buildPlaybackPlan, MUTE_FADE_SEC } from "./playbackPlan";
import { visibleSpans } from "./timelineMap";

describe("buildPlaybackPlan", () => {
  it("plays the full range as one chunk with no gain events when mute is off", () => {
    const spans = visibleSpans(10, [{ start: 2, end: 4 }], "all");
    const plan = buildPlaybackPlan(spans, 0, 10, "all", false, [{ start: 2, end: 4 }]);

    expect(plan.chunks).toEqual([{ sourceStart: 0, sourceEnd: 10, playAt: 0 }]);
    expect(plan.gainEvents).toEqual([]);
    expect(plan.totalSec).toBe(10);
  });

  it("skips hidden spans when the view filter hides marked audio", () => {
    const spans = visibleSpans(10, [{ start: 2, end: 4 }], "hideMarked");
    const plan = buildPlaybackPlan(spans, 0, 10, "hideMarked", false, [{ start: 2, end: 4 }]);

    expect(plan.chunks).toEqual([
      { sourceStart: 0, sourceEnd: 2, playAt: 0 },
      { sourceStart: 4, sourceEnd: 10, playAt: 2 },
    ]);
    expect(plan.totalSec).toBe(8);
    expect(plan.gainEvents).toEqual([]);
  });

  it("clips chunks to the requested start/end range", () => {
    const spans = visibleSpans(10, [], "all");
    const plan = buildPlaybackPlan(spans, 3, 7, "all", false, []);

    expect(plan.chunks).toEqual([{ sourceStart: 3, sourceEnd: 7, playAt: 0 }]);
    expect(plan.totalSec).toBe(4);
  });

  it("ducks marked audio in place for the 'all' filter, fading at each edge", () => {
    const spans = visibleSpans(10, [{ start: 2, end: 4 }], "all");
    const plan = buildPlaybackPlan(spans, 0, 10, "all", true, [{ start: 2, end: 4 }]);

    expect(plan.chunks).toEqual([{ sourceStart: 0, sourceEnd: 10, playAt: 0 }]);
    expect(plan.gainEvents).toEqual([
      { time: 2 - MUTE_FADE_SEC, value: 1 },
      { time: 2, value: 0 },
      { time: 4, value: 0 },
      { time: 4 + MUTE_FADE_SEC, value: 1 },
    ]);
  });

  it("halves the fade for a marked region shorter than 200ms", () => {
    const spans = visibleSpans(10, [{ start: 2, end: 2.1 }], "all");
    const plan = buildPlaybackPlan(spans, 0, 10, "all", true, [{ start: 2, end: 2.1 }]);

    const fade = 0.05;
    expect(plan.gainEvents).toHaveLength(4);
    expect(plan.gainEvents[0]).toEqual({ time: 2 - fade, value: 1 });
    expect(plan.gainEvents[1]).toEqual({ time: 2, value: 0 });
    expect(plan.gainEvents[2]).toEqual({ time: 2.1, value: 0 });
    expect(plan.gainEvents[3].value).toBe(1);
    expect(plan.gainEvents[3].time).toBeCloseTo(2.1 + fade);
  });

  it("clamps duck fades that would spill past the start or end of the played range", () => {
    const spans = visibleSpans(10, [{ start: 0, end: 1 }], "all");
    const plan = buildPlaybackPlan(spans, 0, 10, "all", true, [{ start: 0, end: 1 }]);

    expect(plan.gainEvents[0]).toEqual({ time: 0, value: 1 });
  });

  it("fades across splices for 'hideMarked' instead of ducking in place", () => {
    const spans = visibleSpans(10, [{ start: 2, end: 4 }], "hideMarked");
    const plan = buildPlaybackPlan(spans, 0, 10, "hideMarked", true, [{ start: 2, end: 4 }]);

    expect(plan.gainEvents).toEqual([
      { time: 2 - MUTE_FADE_SEC, value: 1 },
      { time: 2, value: 0 },
      { time: 2, value: 0 },
      { time: 2 + MUTE_FADE_SEC, value: 1 },
    ]);
  });

  it("does not fade the very first or very last chunk edge for 'hideMarked'", () => {
    const spans = visibleSpans(10, [{ start: 0, end: 2 }, { start: 8, end: 10 }], "hideMarked");
    const plan = buildPlaybackPlan(spans, 0, 10, "hideMarked", true, [
      { start: 0, end: 2 },
      { start: 8, end: 10 },
    ]);

    // Single keep chunk [2,8] with no neighbours in the plan: no fade events at all.
    expect(plan.chunks).toEqual([{ sourceStart: 2, sourceEnd: 8, playAt: 0 }]);
    expect(plan.gainEvents).toEqual([]);
  });

  it("ignores muteMarked entirely for 'hideUnmarked'", () => {
    const spans = visibleSpans(10, [{ start: 2, end: 4 }], "hideUnmarked");
    const plan = buildPlaybackPlan(spans, 0, 10, "hideUnmarked", true, [{ start: 2, end: 4 }]);

    expect(plan.chunks).toEqual([{ sourceStart: 2, sourceEnd: 4, playAt: 0 }]);
    expect(plan.gainEvents).toEqual([]);
  });

  it("produces an empty plan when nothing is kept in the requested range", () => {
    const spans = visibleSpans(10, [{ start: 0, end: 10 }], "hideMarked");
    const plan = buildPlaybackPlan(spans, 0, 10, "hideMarked", true, [{ start: 0, end: 10 }]);

    expect(plan.chunks).toEqual([]);
    expect(plan.gainEvents).toEqual([]);
    expect(plan.totalSec).toBe(0);
  });
});
