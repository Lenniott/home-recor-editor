import { describe, expect, it } from "vitest";
import { encodeWav } from "./encodeWav";
import {
  alignRenders,
  combineRenders,
  downmixToMono,
  frameCount,
  padToFrames,
  renderForExport,
} from "./exportMix";

describe("padToFrames", () => {
  it("pads a short render with trailing silence", () => {
    const [out] = padToFrames([new Float32Array([1, 1, 1])], 5);
    expect(Array.from(out)).toEqual([1, 1, 1, 0, 0]);
  });

  it("leaves a render that already matches untouched", () => {
    const data = new Float32Array([1, 2]);
    const [out] = padToFrames([data], 2);
    expect(out).toBe(data);
  });

  it("pads every channel of a stereo render", () => {
    const [left, right] = padToFrames([new Float32Array([1]), new Float32Array([0.5])], 3);
    expect(Array.from(left)).toEqual([1, 0, 0]);
    expect(Array.from(right)).toEqual([0.5, 0, 0]);
  });
});

describe("alignRenders", () => {
  it("pads the shorter render to the longer one's frame count", () => {
    const short = [new Float32Array([1, 1])];
    const long = [new Float32Array([2, 2, 2, 2])];
    const [alignedShort, alignedLong] = alignRenders([short, long]);

    expect(frameCount(alignedShort)).toBe(4);
    expect(frameCount(alignedLong)).toBe(4);
    // Only the tail differs — the shared start is untouched.
    expect(Array.from(alignedShort[0])).toEqual([1, 1, 0, 0]);
    expect(Array.from(alignedLong[0])).toEqual([2, 2, 2, 2]);
  });

  it("gives two exports identical frame counts whatever their channel layouts", () => {
    const mono = [new Float32Array(10).fill(1)];
    const stereo = [new Float32Array(25).fill(1), new Float32Array(25).fill(1)];
    const aligned = alignRenders([mono, stereo]);

    expect(frameCount(aligned[0])).toBe(frameCount(aligned[1]));
    // Channel layouts are preserved: padding never merges or adds channels.
    expect(aligned[0].length).toBe(1);
    expect(aligned[1].length).toBe(2);
    expect(aligned[1][0].length).toBe(25);
  });

  it("pads a render the cuts emptied out to full length", () => {
    const [aligned] = alignRenders([[new Float32Array(0)], [new Float32Array(4).fill(1)]]);
    expect(Array.from(aligned[0])).toEqual([0, 0, 0, 0]);
  });
});

describe("downmixToMono", () => {
  it("averages stereo channels", () => {
    const out = downmixToMono([new Float32Array([1, 0]), new Float32Array([0, 0.5])]);
    expect(Array.from(out)).toEqual([0.5, 0.25]);
  });

  it("copies a mono render rather than handing back the input array", () => {
    const data = new Float32Array([1, 2]);
    const out = downmixToMono([data]);
    expect(Array.from(out)).toEqual([1, 2]);
    expect(out).not.toBe(data);
  });
});

describe("combineRenders", () => {
  it("sums two mono tracks at half gain each", () => {
    const [mix] = combineRenders([[new Float32Array([1, 1, 0])], [new Float32Array([1, -1, 0.5])]]);
    expect(Array.from(mix)).toEqual([1, 0, 0.25]);
  });

  it("stays within full scale for two full-scale tracks", () => {
    const [mix] = combineRenders([[new Float32Array(4).fill(1)], [new Float32Array(4).fill(1)]]);
    expect(Math.max(...mix)).toBe(1);
  });

  it("mixes a multi-channel track down to mono before combining", () => {
    // Track A is stereo at 1 / 0 -> mono 0.5; track B is mono at 0.5.
    const stereo = [new Float32Array([1, 1]), new Float32Array([0, 0])];
    const mono = [new Float32Array([0.5, 0.5])];
    const [mix] = combineRenders([stereo, mono]);

    expect(mix.length).toBe(2);
    // (0.5 + 0.5) / 2
    expect(Array.from(mix)).toEqual([0.5, 0.5]);
  });

  it("runs to the longer track's length, padding the shorter with silence", () => {
    const [mix] = combineRenders([[new Float32Array([1, 1])], [new Float32Array([1, 1, 1, 1])]]);
    expect(Array.from(mix)).toEqual([1, 1, 0.5, 0.5]);
  });

  it("mixes a single track at unity", () => {
    const [mix] = combineRenders([[new Float32Array([0.5, -0.5])]]);
    expect(Array.from(mix)).toEqual([0.5, -0.5]);
  });

  it("clamps an overshooting sum instead of wrapping", () => {
    const [mix] = combineRenders([[new Float32Array([2])], [new Float32Array([2])]]);
    expect(mix[0]).toBe(1);
  });
});

describe("renderForExport", () => {
  it("applies this track's own silences and the shared cuts", () => {
    const sampleRate = 100;
    const data = new Float32Array(1000).fill(1);
    const [out] = renderForExport([data], sampleRate, [{ start: 0, end: 2 }], [{ start: 8, end: 10 }]);

    // 10s - 2s cut = 8s, and the muted first 2s are still there (just silent).
    expect(out.length).toBe(800);
    expect(out[100]).toBe(0);
    expect(out[400]).toBe(1);
  });

  it("renders a track the shared cuts remove entirely as nothing, keeping its channel layout", () => {
    const sampleRate = 100;
    const short = [new Float32Array(200).fill(1), new Float32Array(200).fill(1)];
    const out = renderForExport(short, sampleRate, [], [{ start: 0, end: 5 }]);

    expect(out.length).toBe(2);
    expect(frameCount(out)).toBe(0);
  });

  it("never mutates the channels it was given", () => {
    const data = new Float32Array(1000).fill(1);
    renderForExport([data], 100, [{ start: 2, end: 4 }], [{ start: 5, end: 6 }]);
    expect(data.every((sample) => sample === 1)).toBe(true);
  });

  it("keeps two unequal-length tracks frame-identical once aligned", () => {
    const sampleRate = 100;
    const cuts = [{ start: 1, end: 2 }];
    const long = renderForExport([new Float32Array(1000).fill(1)], sampleRate, [], cuts);
    const short = renderForExport([new Float32Array(400).fill(1)], sampleRate, [], cuts);
    const [alignedLong, alignedShort] = alignRenders([long, short]);

    expect(frameCount(alignedLong)).toBe(900);
    expect(frameCount(alignedShort)).toBe(frameCount(alignedLong));
    // The shorter track's own audio ends where its recording did, minus the shared cut.
    expect(alignedShort[0][299]).toBe(1);
    expect(alignedShort[0][500]).toBe(0);
  });
});

describe("separate exports", () => {
  /** What `+page.svelte` writes per track for a Separate/Both export. */
  function exportTracks(
    tracks: { channels: Float32Array[]; muted: { start: number; end: number }[] }[],
    sampleRate: number,
    cuts: { start: number; end: number }[],
  ): Uint8Array[] {
    const renders = alignRenders(
      tracks.map((track) => renderForExport(track.channels, sampleRate, track.muted, cuts)),
    );
    return renders.map((render) => encodeWav(render, sampleRate));
  }

  it("writes both tracks at the same sample rate and frame count, unequal sources included", () => {
    const sampleRate = 100;
    const [a, b] = exportTracks(
      [
        // 10s stereo, with its own silence; the other track never sees it.
        {
          channels: [new Float32Array(1000).fill(1), new Float32Array(1000).fill(1)],
          muted: [{ start: 3, end: 5 }],
        },
        // 6s mono — its missing tail is simply silence.
        { channels: [new Float32Array(600).fill(1)], muted: [] },
      ],
      sampleRate,
      [{ start: 1, end: 2 }],
    );

    const headerA = new DataView(a.buffer, a.byteOffset, a.byteLength);
    const headerB = new DataView(b.buffer, b.byteOffset, b.byteLength);

    expect(headerA.getUint32(24, true)).toBe(sampleRate);
    expect(headerB.getUint32(24, true)).toBe(sampleRate);
    // Channel layouts are preserved per track, so compare frames, not bytes.
    expect(headerA.getUint16(22, true)).toBe(2);
    expect(headerB.getUint16(22, true)).toBe(1);
    const framesA = headerA.getUint32(40, true) / headerA.getUint16(32, true);
    const framesB = headerB.getUint32(40, true) / headerB.getUint16(32, true);
    expect(framesA).toBe(900);
    expect(framesB).toBe(framesA);
  });

  it("keeps the frame counts identical after repeated cuts", () => {
    const sampleRate = 100;
    const cuts = [
      { start: 1, end: 2 },
      { start: 4, end: 4.5 },
      { start: 7, end: 9 },
    ];
    const renders = alignRenders([
      renderForExport([new Float32Array(1000).fill(1)], sampleRate, [], cuts),
      renderForExport([new Float32Array(650).fill(1)], sampleRate, [], cuts),
    ]);

    // 10s less 3.5s of cuts.
    expect(frameCount(renders[0])).toBe(650);
    expect(frameCount(renders[1])).toBe(frameCount(renders[0]));
  });
});
