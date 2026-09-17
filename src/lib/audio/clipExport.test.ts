import { describe, expect, it } from "vitest";
import {
  clipExportNames,
  overlappingClipGroups,
  planClipRenders,
  sliceChannels,
} from "./clipExport";

describe("sliceChannels", () => {
  it("copies the requested span without mutating the source", () => {
    const source = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const [out] = sliceChannels([source], 10, 0.2, 0.5);
    expect(Array.from(out)).toEqual([3, 4, 5]);
    expect(source[2]).toBe(3);
  });
});

describe("overlappingClipGroups", () => {
  it("keeps a single-track span as its own group", () => {
    expect(overlappingClipGroups([[{ start: 1, end: 2 }], []])).toEqual([
      { start: 1, end: 2, trackIndexes: [0] },
    ]);
  });

  it("merges overlapping speakers into one group and leaves a later solo span", () => {
    expect(
      overlappingClipGroups([
        [{ start: 1, end: 3 }],
        [{ start: 2, end: 4 }, { start: 8, end: 9 }],
      ]),
    ).toEqual([
      { start: 1, end: 4, trackIndexes: [0, 1] },
      { start: 8, end: 9, trackIndexes: [1] },
    ]);
  });
});

describe("clipExportNames", () => {
  it("numbers clips and joins mixed speakers", () => {
    expect(
      clipExportNames("interview", [
        { speakers: ["Host"], start: 1.2 },
        { speakers: ["Host", "Guest"], start: 4 },
      ]),
    ).toEqual(["interview-clip-001-Host.wav", "interview-clip-002-Host+Guest.wav"]);
  });
});

describe("planClipRenders", () => {
  it("writes one file per marked span on each track", () => {
    const host = new Float32Array(1000).fill(1);
    const guest = new Float32Array(1000).fill(0.5);
    const files = planClipRenders("show", "separate", [
      { speaker: "Host", clips: [{ start: 0.1, end: 0.2 }], channels: [host], sampleRate: 1000 },
      { speaker: "Guest", clips: [{ start: 0.1, end: 0.2 }], channels: [guest], sampleRate: 1000 },
    ]);
    expect(files.map((f) => f.name)).toEqual([
      "show-clip-001-Host.wav",
      "show-clip-002-Guest.wav",
    ]);
    expect(files[0].channels[0][0]).toBe(1);
    expect(files[1].channels[0][0]).toBe(0.5);
    expect(files[0].channels[0].length).toBe(100);
  });

  it("mixes overlapping speakers into one clip and leaves a solo clip alone", () => {
    const host = new Float32Array(1000).fill(1);
    const guest = new Float32Array(1000).fill(1);
    const files = planClipRenders("show", "mix", [
      { speaker: "Host", clips: [{ start: 0, end: 0.4 }], channels: [host], sampleRate: 1000 },
      { speaker: "Guest", clips: [{ start: 0.2, end: 0.4 }], channels: [guest], sampleRate: 1000 },
    ]);
    expect(files.map((f) => f.name)).toEqual([
      "show-clip-001-Host+Guest.wav",
    ]);
    expect(files[0].channels[0].length).toBe(400);
    // Equal-gain stereo mix of two full-scale tracks, clamped.
    expect(files[0].channels[0][0]).toBe(0.5);
    expect(files[0].channels[0][300]).toBe(1);
  });
});
