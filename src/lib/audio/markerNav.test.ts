import { describe, expect, it } from "vitest";
import { adjacentMarkedRegion, currentRegionNumber, fitWindow } from "./markerNav";

const regions = [
  { start: 10, end: 12 },
  { start: 20, end: 25 },
  { start: 40, end: 41 },
];

describe("adjacentMarkedRegion", () => {
  it("returns null for an empty list", () => {
    expect(adjacentMarkedRegion([], 5, "next")).toBeNull();
    expect(adjacentMarkedRegion([], 5, "prev")).toBeNull();
  });

  it("sorts by start regardless of input order", () => {
    const scrambled = [regions[2], regions[0], regions[1]];
    expect(adjacentMarkedRegion(scrambled, 0, "next")).toEqual(regions[0]);
  });

  it("picks the first region after the playhead when in a gap, going next", () => {
    expect(adjacentMarkedRegion(regions, 15, "next")).toEqual(regions[1]);
  });

  it("wraps to the first region when in a gap past the last region, going next", () => {
    expect(adjacentMarkedRegion(regions, 41, "next")).toEqual(regions[0]);
  });

  it("picks the last region before the playhead when in a gap, going prev", () => {
    expect(adjacentMarkedRegion(regions, 30, "prev")).toEqual(regions[1]);
  });

  it("wraps to the last region when in a gap before the first region, going prev", () => {
    expect(adjacentMarkedRegion(regions, 0, "prev")).toEqual(regions[2]);
  });

  it("steps to the next region when the playhead is inside the current one", () => {
    expect(adjacentMarkedRegion(regions, 21, "next")).toEqual(regions[2]);
  });

  it("wraps from the last region to the first when going next", () => {
    expect(adjacentMarkedRegion(regions, 40.5, "next")).toEqual(regions[0]);
  });

  it("steps to the prev region even near the far edge of the current one (playhead drifted during playback)", () => {
    // Landing on regions[1] via nav puts the playhead at 20 (its start); a
    // moment of playback ticks it forward to e.g. 24.9, still inside the
    // region. Prev must still resolve to regions[0], not regions[1] again.
    expect(adjacentMarkedRegion(regions, 24.9, "prev")).toEqual(regions[0]);
  });

  it("wraps from the first region to the last when going prev", () => {
    expect(adjacentMarkedRegion(regions, 10, "prev")).toEqual(regions[2]);
  });

  it("treats the playhead sitting exactly on a region's end as outside it", () => {
    // 12 === regions[0].end, so containment excludes it; next from the gap
    // picks regions[1] (first region with start > 12).
    expect(adjacentMarkedRegion(regions, 12, "next")).toEqual(regions[1]);
  });
});

describe("currentRegionNumber", () => {
  it("returns null when the playhead is in a gap", () => {
    expect(currentRegionNumber(regions, 15)).toBeNull();
  });

  it("returns the 1-based position, ordered by start regardless of input order", () => {
    const scrambled = [regions[2], regions[0], regions[1]];
    expect(currentRegionNumber(scrambled, 21)).toBe(2);
  });

  it("treats the playhead exactly on a region's end as outside it", () => {
    expect(currentRegionNumber(regions, 12)).toBeNull();
  });
});

describe("fitWindow", () => {
  it("includes one region of context on each side", () => {
    const { startSec, durationSec } = fitWindow({ start: 20, end: 25 }, 100);
    expect(startSec).toBeCloseTo(15);
    expect(durationSec).toBeCloseTo(15);
  });

  it("floors very short regions at the 4s minimum", () => {
    const { durationSec } = fitWindow({ start: 20, end: 20.02 }, 100);
    expect(durationSec).toBe(4);
  });

  it("clamps padding to the start of the file", () => {
    const { startSec, durationSec } = fitWindow({ start: 0, end: 1 }, 100);
    expect(startSec).toBe(0);
    expect(durationSec).toBeCloseTo(4);
  });

  it("clamps padding to the end of the file", () => {
    const { startSec, durationSec } = fitWindow({ start: 99, end: 99.5 }, 99.5);
    expect(startSec).toBeCloseTo(95.5);
    expect(durationSec).toBeCloseTo(4);
  });

  it("never returns a window wider than the file itself", () => {
    const { startSec, durationSec } = fitWindow({ start: 0, end: 2 }, 1.5);
    expect(durationSec).toBeLessThanOrEqual(1.5);
    expect(startSec).toBe(0);
  });
});
