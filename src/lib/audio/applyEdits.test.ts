import { describe, expect, it } from "vitest";
import { removeMarked, silenceMarked } from "./applyEdits";
import { MUTE_FADE_SEC } from "./playbackPlan";

describe("silenceMarked", () => {
  it("zeros a marked middle span and preserves length", () => {
    const sampleRate = 100;
    const data = new Float32Array(1000).fill(1);
    const [out] = silenceMarked([data], sampleRate, [{ start: 2, end: 4 }]);

    expect(out.length).toBe(data.length);
    // Well inside the marked span, past both fades.
    expect(out[300]).toBe(0);
    // Untouched outside the marked span.
    expect(out[0]).toBe(1);
    expect(out[999]).toBe(1);
  });

  it("fades from the original signal down to silence at each edge, landing inside the span", () => {
    const sampleRate = 1000;
    const data = new Float32Array(2000).fill(1);
    const [out] = silenceMarked([data], sampleRate, [{ start: 0.5, end: 1.5 }]);
    const startIdx = 500;
    const fadeSamples = Math.round(MUTE_FADE_SEC * sampleRate);

    // Sample just outside the span is untouched.
    expect(out[startIdx - 1]).toBe(1);
    // Right at the edge, gain is (close to) 1 — the fade lands inside the span.
    expect(out[startIdx]).toBeCloseTo(1, 1);
    // Mid-fade.
    expect(out[startIdx + Math.floor(fadeSamples / 2)]).toBeGreaterThan(0);
    expect(out[startIdx + Math.floor(fadeSamples / 2)]).toBeLessThan(1);
    // Past the fade, fully silent.
    expect(out[startIdx + fadeSamples]).toBe(0);
  });

  it("halves the fade for a region shorter than 2×MUTE_FADE_SEC", () => {
    const sampleRate = 1000;
    const data = new Float32Array(1000).fill(1);
    // 100ms region — half is 50ms, shorter than MUTE_FADE_SEC (100ms).
    const [out] = silenceMarked([data], sampleRate, [{ start: 0.4, end: 0.5 }]);
    const startIdx = 400;
    const endIdx = 500;

    // Meets in the middle instead of overshooting into the neighbouring keep audio.
    expect(out[startIdx]).toBeCloseTo(1, 1);
    expect(out[endIdx - 1]).toBeCloseTo(1, 1);
    const mid = Math.floor((startIdx + endIdx) / 2);
    expect(out[mid]).toBeLessThan(0.2);
  });

  it("leaves audio unchanged when nothing is marked", () => {
    const data = new Float32Array([1, 2, 3, 4]);
    const [out] = silenceMarked([data], 4, []);
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
  });

  it("merges overlapping marks via visibleSpans before silencing", () => {
    const sampleRate = 100;
    const data = new Float32Array(1000).fill(1);
    const [out] = silenceMarked(
      [data],
      sampleRate,
      [
        { start: 2, end: 3.5 },
        { start: 3, end: 5 },
      ],
    );
    // The merged marked region [2,5) is silent well past the fades.
    expect(out[400]).toBe(0);
  });

  it("keeps channels independent for stereo", () => {
    const sampleRate = 100;
    const left = new Float32Array(1000).fill(1);
    const right = new Float32Array(1000).fill(0.5);
    const [outLeft, outRight] = silenceMarked([left, right], sampleRate, [{ start: 2, end: 4 }]);
    expect(outLeft[300]).toBe(0);
    expect(outRight[300]).toBe(0);
    expect(outLeft[0]).toBe(1);
    expect(outRight[0]).toBe(0.5);
  });
});

describe("removeMarked", () => {
  it("concatenates the keep spans and shortens duration", () => {
    const sampleRate = 100;
    const data = new Float32Array(1000).fill(1);
    const [out] = removeMarked([data], sampleRate, [{ start: 2, end: 4 }]);

    // 10s - 2s marked = 8s kept.
    expect(out.length).toBe(800);
  });

  it("fades the join between the two kept spans", () => {
    const sampleRate = 1000;
    const data = new Float32Array(2000).fill(1);
    const [out] = removeMarked([data], sampleRate, [{ start: 1, end: 1.5 }]);
    // First kept span is [0,1) -> 1000 samples; its tail should fade out.
    expect(out[999]).toBeCloseTo(0, 1);
    // Second kept span starts right after; its head should fade in.
    expect(out[1000]).toBeCloseTo(0, 1);
    // Well inside either kept span, full signal.
    expect(out[500]).toBe(1);
  });

  it("rejects a result with nothing kept", () => {
    const data = new Float32Array(1000).fill(1);
    expect(() => removeMarked([data], 100, [{ start: 0, end: 10 }])).toThrow();
  });

  it("returns the whole buffer unchanged when nothing is marked", () => {
    const data = new Float32Array([1, 2, 3, 4]);
    const [out] = removeMarked([data], 4, []);
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
  });

  it("keeps stereo channels aligned", () => {
    const sampleRate = 100;
    const left = new Float32Array(1000).fill(1);
    const right = new Float32Array(1000).fill(0.5);
    const [outLeft, outRight] = removeMarked([left, right], sampleRate, [{ start: 2, end: 4 }]);
    expect(outLeft.length).toBe(800);
    expect(outRight.length).toBe(800);
  });
});
