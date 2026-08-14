import { describe, expect, it } from "vitest";
import { keptDuration, keptToSource, sourceToKept, visibleSpans } from "./timelineMap";

describe("visibleSpans", () => {
  it("returns a single keep span for 'all', ignoring marked regions", () => {
    const spans = visibleSpans(10, [{ start: 2, end: 4 }], "all");

    expect(spans).toEqual([{ kind: "keep", sourceStart: 0, sourceEnd: 10, keptStart: 0, keptEnd: 10 }]);
  });

  it("returns nothing for zero or negative duration", () => {
    expect(visibleSpans(0, [], "all")).toEqual([]);
    expect(visibleSpans(-1, [], "hideMarked")).toEqual([]);
  });

  it("hides marked regions, keeping the rest", () => {
    const spans = visibleSpans(10, [{ start: 2, end: 4 }], "hideMarked");

    expect(spans).toEqual([
      { kind: "keep", sourceStart: 0, sourceEnd: 2, keptStart: 0, keptEnd: 2 },
      { kind: "hidden", sourceStart: 2, sourceEnd: 4, keptStart: 2, keptEnd: 2 },
      { kind: "keep", sourceStart: 4, sourceEnd: 10, keptStart: 2, keptEnd: 8 },
    ]);
  });

  it("hides unmarked regions, keeping only marked ones", () => {
    const spans = visibleSpans(10, [{ start: 2, end: 4 }], "hideUnmarked");

    expect(spans).toEqual([
      { kind: "hidden", sourceStart: 0, sourceEnd: 2, keptStart: 0, keptEnd: 0 },
      { kind: "keep", sourceStart: 2, sourceEnd: 4, keptStart: 0, keptEnd: 2 },
      { kind: "hidden", sourceStart: 4, sourceEnd: 10, keptStart: 2, keptEnd: 2 },
    ]);
  });

  it("handles a marked region touching the start and end of the file", () => {
    const spans = visibleSpans(10, [{ start: 0, end: 2 }, { start: 8, end: 10 }], "hideMarked");

    expect(spans).toEqual([
      { kind: "hidden", sourceStart: 0, sourceEnd: 2, keptStart: 0, keptEnd: 0 },
      { kind: "keep", sourceStart: 2, sourceEnd: 8, keptStart: 0, keptEnd: 6 },
      { kind: "hidden", sourceStart: 8, sourceEnd: 10, keptStart: 6, keptEnd: 6 },
    ]);
  });

  it("merges overlapping input regions defensively", () => {
    const spans = visibleSpans(10, [{ start: 2, end: 5 }, { start: 4, end: 6 }], "hideMarked");

    expect(spans).toEqual([
      { kind: "keep", sourceStart: 0, sourceEnd: 2, keptStart: 0, keptEnd: 2 },
      { kind: "hidden", sourceStart: 2, sourceEnd: 6, keptStart: 2, keptEnd: 2 },
      { kind: "keep", sourceStart: 6, sourceEnd: 10, keptStart: 2, keptEnd: 6 },
    ]);
  });

  it("keeps the entire file when it's all marked and unmarked is hidden", () => {
    const spans = visibleSpans(10, [{ start: 0, end: 10 }], "hideUnmarked");

    expect(spans).toEqual([{ kind: "keep", sourceStart: 0, sourceEnd: 10, keptStart: 0, keptEnd: 10 }]);
  });

  it("returns no keep spans when the whole file is marked and marked is hidden", () => {
    const spans = visibleSpans(10, [{ start: 0, end: 10 }], "hideMarked");

    expect(spans).toEqual([{ kind: "hidden", sourceStart: 0, sourceEnd: 10, keptStart: 0, keptEnd: 0 }]);
  });
});

describe("keptDuration", () => {
  it("is the source duration when nothing is hidden", () => {
    expect(keptDuration(visibleSpans(10, [], "all"))).toBe(10);
  });

  it("subtracts hidden span lengths", () => {
    expect(keptDuration(visibleSpans(10, [{ start: 2, end: 4 }], "hideMarked"))).toBe(8);
  });

  it("is zero for an empty span list", () => {
    expect(keptDuration([])).toBe(0);
  });
});

describe("sourceToKept / keptToSource", () => {
  it("round-trips identically for 'all'", () => {
    const spans = visibleSpans(10, [{ start: 2, end: 4 }], "all");

    expect(sourceToKept(spans, 6)).toBeCloseTo(6);
    expect(keptToSource(spans, 6)).toBeCloseTo(6);
  });

  it("collapses source times inside a hidden span to the entry edge", () => {
    const spans = visibleSpans(10, [{ start: 2, end: 4 }], "hideMarked");

    expect(sourceToKept(spans, 2)).toBeCloseTo(2);
    expect(sourceToKept(spans, 3)).toBeCloseTo(2);
    expect(sourceToKept(spans, 4)).toBeCloseTo(2);
  });

  it("maps kept time in a later keep span back to source time", () => {
    const spans = visibleSpans(10, [{ start: 2, end: 4 }], "hideMarked");

    // Exactly on the boundary resolves to the earlier span's edge (source 2); kept 5 is
    // 3s into the second keep span, i.e. source 7.
    expect(keptToSource(spans, 2)).toBeCloseTo(2);
    expect(keptToSource(spans, 5)).toBeCloseTo(7);
  });

  it("clamps kept time outside the timeline", () => {
    const spans = visibleSpans(10, [{ start: 2, end: 4 }], "hideMarked");

    expect(keptToSource(spans, -5)).toBeCloseTo(0);
    expect(keptToSource(spans, 100)).toBeCloseTo(10);
  });

  it("falls back to the first span's start when there are no keep spans", () => {
    const spans = visibleSpans(10, [{ start: 0, end: 10 }], "hideMarked");

    expect(keptToSource(spans, 0)).toBe(0);
  });

  it("returns 0 for an empty span list", () => {
    expect(sourceToKept([], 5)).toBe(0);
    expect(keptToSource([], 5)).toBe(0);
  });
});
