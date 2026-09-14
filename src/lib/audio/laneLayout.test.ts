import { describe, expect, it } from "vitest";
import { GUTTER_PX, laneLayout } from "./laneLayout";
import { visibleSpans } from "./timelineMap";

describe("laneLayout", () => {
  it("xToKept at the left gutter edge maps to the collapsed cut's kept time", () => {
    const spans = visibleSpans(10, [{ start: 2, end: 3 }], "hideMarked");
    const layout = laneLayout(spans, 0, 10, 1000);
    const gutterStartX = layout.keptToX(2, "start");
    // One 14px gutter: pps = (1000 − 14) / 10 = 98.6; gutter starts at 2 × 98.6.
    expect(gutterStartX).toBeCloseTo(2 * 98.6, 5);
    expect(layout.gutterPx).toBe(GUTTER_PX);
    expect(layout.xToKept(gutterStartX)).toBeCloseTo(2, 5);
  });

  it("does not throw when view duration or width is zero", () => {
    const spans = visibleSpans(10, [], "all");
    const empty = laneLayout(spans, 0, 0, 0);
    expect(empty.pps).toBe(0);
    expect(empty.xToKept(0)).toBe(0);
    expect(empty.keptToX(0)).toBe(0);
  });
});
