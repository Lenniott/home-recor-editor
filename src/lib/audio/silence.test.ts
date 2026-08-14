import { describe, expect, it } from "vitest";
import {
  applySilenceBuffer,
  moveMarker,
  silenceRegionsFromSpeechSegments,
  subtractInterval,
  unionInterval,
} from "./silence";

describe("silenceRegionsFromSpeechSegments", () => {
  it("finds the gap between two speech segments", () => {
    const regions = silenceRegionsFromSpeechSegments(
      [{ start: 0, end: 0.2 }, { start: 0.5, end: 0.7 }],
      0.7,
      0.05,
    );

    expect(regions).toHaveLength(1);
    expect(regions[0].start).toBeCloseTo(0.2);
    expect(regions[0].end).toBeCloseTo(0.5);
  });

  it("ignores gaps shorter than minSilenceMs", () => {
    const regions = silenceRegionsFromSpeechSegments(
      [{ start: 0, end: 0.2 }, { start: 0.22, end: 0.5 }],
      0.5,
      100,
    );

    expect(regions).toHaveLength(0);
  });

  it("includes a leading silence region before the first speech segment", () => {
    const regions = silenceRegionsFromSpeechSegments([{ start: 0.3, end: 0.5 }], 0.5, 50);

    expect(regions).toHaveLength(1);
    expect(regions[0].start).toBeCloseTo(0);
    expect(regions[0].end).toBeCloseTo(0.3);
  });

  it("includes a trailing silence region after the last speech segment", () => {
    const regions = silenceRegionsFromSpeechSegments([{ start: 0, end: 0.2 }], 0.5, 50);

    expect(regions).toHaveLength(1);
    expect(regions[0].start).toBeCloseTo(0.2);
    expect(regions[0].end).toBeCloseTo(0.5);
  });

  it("returns nothing when speech fills the whole duration", () => {
    const regions = silenceRegionsFromSpeechSegments([{ start: 0, end: 0.5 }], 0.5, 50);

    expect(regions).toHaveLength(0);
  });

  it("returns nothing for no segments and zero duration", () => {
    expect(silenceRegionsFromSpeechSegments([], 0, 50)).toEqual([]);
  });

  it("treats the whole file as silent when there is no speech at all", () => {
    const regions = silenceRegionsFromSpeechSegments([], 1, 50);

    expect(regions).toHaveLength(1);
    expect(regions[0]).toEqual({ start: 0, end: 1 });
  });

  it("sorts out-of-order segments before deriving gaps", () => {
    const regions = silenceRegionsFromSpeechSegments(
      [{ start: 0.5, end: 0.7 }, { start: 0, end: 0.2 }],
      0.7,
      0.05,
    );

    expect(regions).toHaveLength(1);
    expect(regions[0].start).toBeCloseTo(0.2);
    expect(regions[0].end).toBeCloseTo(0.5);
  });
});

describe("applySilenceBuffer", () => {
  it("pads markers inward by the buffer amount", () => {
    const [region] = applySilenceBuffer([{ start: 1, end: 2 }], 100);

    expect(region.displayed).not.toBeNull();
    expect(region.displayed!.start).toBeCloseTo(1.1);
    expect(region.displayed!.end).toBeCloseTo(1.9);
  });

  it("collapses to null once the buffer overtakes the region", () => {
    const [region] = applySilenceBuffer([{ start: 1, end: 1.15 }], 100);

    expect(region.displayed).toBeNull();
  });

  it("keeps the raw region even when displayed collapses, so a smaller buffer can recover it", () => {
    const [collapsed] = applySilenceBuffer([{ start: 1, end: 1.15 }], 100);
    const [recovered] = applySilenceBuffer([collapsed.raw], 50);

    expect(recovered.displayed).not.toBeNull();
  });
});

describe("unionInterval", () => {
  it("inserts a new region when it touches nothing", () => {
    const regions = unionInterval([{ start: 5, end: 6 }], 1, 2);

    expect(regions).toEqual([{ start: 1, end: 2 }, { start: 5, end: 6 }]);
  });

  it("merges with an overlapping region", () => {
    const regions = unionInterval([{ start: 1, end: 3 }], 2, 4);

    expect(regions).toEqual([{ start: 1, end: 4 }]);
  });

  it("merges with a touching region (no gap between them)", () => {
    const regions = unionInterval([{ start: 1, end: 2 }], 2, 3);

    expect(regions).toEqual([{ start: 1, end: 3 }]);
  });

  it("merges a range that bridges two separate regions into one", () => {
    const regions = unionInterval([{ start: 0, end: 1 }, { start: 4, end: 5 }], 0.5, 4.5);

    expect(regions).toEqual([{ start: 0, end: 5 }]);
  });

  it("is a no-op for a degenerate range", () => {
    const regions = unionInterval([{ start: 1, end: 2 }], 3, 3);

    expect(regions).toEqual([{ start: 1, end: 2 }]);
  });
});

describe("subtractInterval", () => {
  it("splits a region in two when the range carves out its middle", () => {
    const regions = subtractInterval([{ start: 1, end: 10 }], 4, 6);

    expect(regions).toEqual([{ start: 1, end: 4 }, { start: 6, end: 10 }]);
  });

  it("trims the start of a region when the range overlaps its left edge", () => {
    const regions = subtractInterval([{ start: 1, end: 10 }], 0, 3);

    expect(regions).toEqual([{ start: 3, end: 10 }]);
  });

  it("trims the end of a region when the range overlaps its right edge", () => {
    const regions = subtractInterval([{ start: 1, end: 10 }], 8, 12);

    expect(regions).toEqual([{ start: 1, end: 8 }]);
  });

  it("drops a region entirely covered by the range", () => {
    const regions = subtractInterval([{ start: 1, end: 10 }], 0, 12);

    expect(regions).toEqual([]);
  });

  it("leaves regions outside the range untouched", () => {
    const regions = subtractInterval([{ start: 1, end: 2 }, { start: 5, end: 6 }], 1, 2);

    expect(regions).toEqual([{ start: 5, end: 6 }]);
  });

  it("is a no-op for a degenerate range", () => {
    const regions = subtractInterval([{ start: 1, end: 10 }], 4, 4);

    expect(regions).toEqual([{ start: 1, end: 10 }]);
  });
});

describe("moveMarker", () => {
  it("moving the start marker updates raw.start by inverting the buffer", () => {
    const raw = { start: 1, end: 2 };
    const moved = moveMarker(raw, 100, "start", 1.3);

    expect(moved.start).toBeCloseTo(1.2);
    expect(moved.end).toBe(2);
  });

  it("moving the end marker updates raw.end by inverting the buffer", () => {
    const raw = { start: 1, end: 2 };
    const moved = moveMarker(raw, 100, "end", 1.7);

    expect(moved.end).toBeCloseTo(1.8);
    expect(moved.start).toBe(1);
  });

  it("clamps so start never passes end and end never passes start", () => {
    const raw = { start: 1, end: 2 };

    expect(moveMarker(raw, 100, "start", 5).start).toBeLessThanOrEqual(2);
    expect(moveMarker(raw, 100, "end", -5).end).toBeGreaterThanOrEqual(1);
  });
});
