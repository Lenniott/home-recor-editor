import { describe, expect, it } from "vitest";
import { sileroThresholds } from "./sileroThresholds";

describe("sileroThresholds", () => {
  it("sileroThresholds(0.5) is { positive: 0.5, negative: 0.35 }", () => {
    expect(sileroThresholds(0.5)).toEqual({ positive: 0.5, negative: 0.35 });
  });

  it("sileroThresholds(0.1) is { positive: 0.1, negative: 0 }", () => {
    expect(sileroThresholds(0.1)).toEqual({ positive: 0.1, negative: 0 });
  });

  it("sileroThresholds(0.9) is { positive: 0.9, negative: 0.75 }", () => {
    expect(sileroThresholds(0.9)).toEqual({ positive: 0.9, negative: 0.75 });
  });
});
