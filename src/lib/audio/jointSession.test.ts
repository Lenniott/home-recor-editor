import { describe, expect, it } from "vitest";
import { encodeJointTracks, shiftRegions, toTrackTime } from "./jointSession";

describe("shiftRegions", () => {
  it("shifts every region by the offset", () => {
    const result = shiftRegions([{ start: 1, end: 2 }, { start: 5, end: 6 }], 0.5);
    expect(result).toEqual([{ start: 1.5, end: 2.5 }, { start: 5.5, end: 6.5 }]);
  });

  it("returns the same array reference for a zero offset", () => {
    const regions = [{ start: 1, end: 2 }];
    expect(shiftRegions(regions, 0)).toBe(regions);
  });

  it("supports negative offsets", () => {
    const result = shiftRegions([{ start: 5, end: 6 }], -2);
    expect(result).toEqual([{ start: 3, end: 4 }]);
  });
});

describe("toTrackTime", () => {
  it("undoes the offset and passes regions through unchanged when fully in range", () => {
    const result = toTrackTime([{ start: 2, end: 4 }], 1, 10);
    expect(result).toEqual([{ start: 1, end: 3 }]);
  });

  it("clips a region that starts before the track's own timeline", () => {
    const result = toTrackTime([{ start: 0, end: 2 }], 1, 10);
    // session 0-2 shifted back by offset 1 -> track time -1 to 1, clamped to 0-1
    expect(result).toEqual([{ start: 0, end: 1 }]);
  });

  it("clips a region that ends after the track's duration", () => {
    const result = toTrackTime([{ start: 8, end: 12 }], 0, 10);
    expect(result).toEqual([{ start: 8, end: 10 }]);
  });

  it("drops a region that falls entirely outside the track's own timeline", () => {
    const result = toTrackTime([{ start: 20, end: 22 }], 0, 10);
    expect(result).toEqual([]);
  });
});

describe("encodeJointTracks", () => {
  function wav(bytes: Uint8Array) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      numChannels: view.getUint16(22, true),
      sampleRate: view.getUint32(24, true),
      dataSize: view.getUint32(40, true),
      sample: (frame: number, ch: number, numChannels: number) =>
        view.getInt16(44 + (frame * numChannels + ch) * 2, true),
    };
  }

  it("interleaves two tracks in the order given, already aligned", () => {
    const a = new Float32Array([1, 0.5, 0]);
    const b = new Float32Array([-1, -0.5, 0]);
    const bytes = encodeJointTracks([
      { channel: a, sampleRate: 1000, offsetSec: 0 },
      { channel: b, sampleRate: 1000, offsetSec: 0 },
    ]);
    const parsed = wav(bytes);

    expect(parsed.numChannels).toBe(2);
    expect(parsed.sample(0, 0, 2)).toBeCloseTo(0x7fff, -1);
    expect(parsed.sample(0, 1, 2)).toBeCloseTo(-0x8000, -1);
  });

  it("handles more than two tracks", () => {
    const bytes = encodeJointTracks([
      { channel: new Float32Array([1, 1]), sampleRate: 1000, offsetSec: 0 },
      { channel: new Float32Array([1, 1]), sampleRate: 1000, offsetSec: 0 },
      { channel: new Float32Array([1, 1]), sampleRate: 1000, offsetSec: 0 },
    ]);
    expect(wav(bytes).numChannels).toBe(3);
  });

  it("pads the earlier-starting track with leading silence so all align to session time", () => {
    // second track starts 2 samples (2ms @ 1000Hz) later than the first.
    const a = new Float32Array([1, 1, 1, 1]);
    const b = new Float32Array([1, 1]);
    const bytes = encodeJointTracks([
      { channel: a, sampleRate: 1000, offsetSec: 0 },
      { channel: b, sampleRate: 1000, offsetSec: 0.002 },
    ]);
    const parsed = wav(bytes);

    expect(parsed.sample(0, 1, 2)).toBe(0);
    expect(parsed.sample(1, 1, 2)).toBe(0);
    expect(parsed.sample(2, 1, 2)).not.toBe(0);
  });

  it("truncates to the shortest aligned length", () => {
    const a = new Float32Array(5).fill(1);
    const b = new Float32Array(2).fill(1);
    const bytes = encodeJointTracks([
      { channel: a, sampleRate: 1000, offsetSec: 0 },
      { channel: b, sampleRate: 1000, offsetSec: 0 },
    ]);
    const parsed = wav(bytes);

    expect(parsed.dataSize).toBe(2 /* frames */ * 2 /* channels */ * 2 /* bytes/sample */);
  });

  it("throws on a sample-rate mismatch instead of resampling", () => {
    expect(() =>
      encodeJointTracks([
        { channel: new Float32Array(4), sampleRate: 44100, offsetSec: 0 },
        { channel: new Float32Array(4), sampleRate: 48000, offsetSec: 0 },
      ]),
    ).toThrow(/sample rates differ/i);
  });

  it("throws when given no tracks", () => {
    expect(() => encodeJointTracks([])).toThrow(/no tracks/i);
  });
});
