import { describe, expect, it } from "vitest";
import {
  applySilenceBuffer,
  intersectRegions,
  moveMarker,
  silenceRegionsFromAmplitude,
  silenceRegionsFromSpeechSegments,
  subtractInterval,
  unionInterval,
} from "./silence";

const SAMPLE_RATE = 1000;

/** Builds a signal from seconds-long segments, each either loud (amplitude 1) or quiet (given amplitude). */
function buildSignal(segments: { seconds: number; amplitude: number }[]): Float32Array {
  const totalSamples = segments.reduce((sum, s) => sum + Math.round(s.seconds * SAMPLE_RATE), 0);
  const samples = new Float32Array(totalSamples);
  let i = 0;
  for (const segment of segments) {
    const count = Math.round(segment.seconds * SAMPLE_RATE);
    for (let j = 0; j < count; j++) samples[i++] = segment.amplitude;
  }
  return samples;
}

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

describe("silenceRegionsFromAmplitude", () => {
  it("flags a quiet block between loud ones", () => {
    const samples = buildSignal([
      { seconds: 1, amplitude: 1 },
      { seconds: 1, amplitude: 0.001 },
      { seconds: 1, amplitude: 1 },
    ]);

    const regions = silenceRegionsFromAmplitude(samples, SAMPLE_RATE, -40, 100);

    expect(regions).toHaveLength(1);
    expect(regions[0].start).toBeCloseTo(1);
    expect(regions[0].end).toBeCloseTo(2);
  });

  it("ignores a quiet blip shorter than minSilenceMs", () => {
    const samples = buildSignal([
      { seconds: 1, amplitude: 1 },
      { seconds: 0.05, amplitude: 0.001 },
      { seconds: 1, amplitude: 1 },
    ]);

    const regions = silenceRegionsFromAmplitude(samples, SAMPLE_RATE, -40, 200);

    expect(regions).toHaveLength(0);
  });

  it("returns nothing when the whole signal is loud", () => {
    const samples = buildSignal([{ seconds: 2, amplitude: 1 }]);

    expect(silenceRegionsFromAmplitude(samples, SAMPLE_RATE, -40, 100)).toHaveLength(0);
  });

  it("treats an entirely quiet signal as one region spanning the whole duration", () => {
    const samples = buildSignal([{ seconds: 2, amplitude: 0.001 }]);

    const regions = silenceRegionsFromAmplitude(samples, SAMPLE_RATE, -40, 100);

    expect(regions).toHaveLength(1);
    expect(regions[0].start).toBeCloseTo(0);
    expect(regions[0].end).toBeCloseTo(2);
  });

  it("a more lenient (less negative) threshold catches quieter-but-not-silent audio a strict one misses", () => {
    // -20dB (amplitude 0.1) — quieter than speech, louder than near-silence.
    const samples = buildSignal([
      { seconds: 1, amplitude: 1 },
      { seconds: 1, amplitude: 0.1 },
      { seconds: 1, amplitude: 1 },
    ]);

    expect(silenceRegionsFromAmplitude(samples, SAMPLE_RATE, -15, 100)).toHaveLength(1);
    expect(silenceRegionsFromAmplitude(samples, SAMPLE_RATE, -30, 100)).toHaveLength(0);
  });

  it("returns nothing for an empty signal", () => {
    expect(silenceRegionsFromAmplitude(new Float32Array(0), SAMPLE_RATE, -40, 100)).toEqual([]);
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

describe("intersectRegions", () => {
  it("returns nothing when the two sets never overlap", () => {
    const result = intersectRegions([{ start: 0, end: 1 }], [{ start: 2, end: 3 }]);
    expect(result).toEqual([]);
  });

  it("returns the fully-contained region when one region sits entirely inside the other", () => {
    const result = intersectRegions([{ start: 0, end: 10 }], [{ start: 3, end: 5 }]);
    expect(result).toEqual([{ start: 3, end: 5 }]);
  });

  it("returns only the overlap on a partial overlap", () => {
    const result = intersectRegions([{ start: 0, end: 5 }], [{ start: 3, end: 8 }]);
    expect(result).toEqual([{ start: 3, end: 5 }]);
  });

  it("excludes regions that only touch at a boundary", () => {
    const result = intersectRegions([{ start: 0, end: 2 }], [{ start: 2, end: 4 }]);
    expect(result).toEqual([]);
  });

  it("sweeps across multiple regions on both sides", () => {
    // a: not-speaking 0-2, 4-6, 8-10 ; b: not-speaking 1-3, 5-9
    const a = [{ start: 0, end: 2 }, { start: 4, end: 6 }, { start: 8, end: 10 }];
    const b = [{ start: 1, end: 3 }, { start: 5, end: 9 }];

    const result = intersectRegions(a, b);

    expect(result).toEqual([
      { start: 1, end: 2 },
      { start: 5, end: 6 },
      { start: 8, end: 9 },
    ]);
  });

  it("is symmetric — order of arguments doesn't change the result", () => {
    const a = [{ start: 0, end: 2 }, { start: 4, end: 6 }];
    const b = [{ start: 1, end: 5 }];

    expect(intersectRegions(a, b)).toEqual(intersectRegions(b, a));
  });
});
