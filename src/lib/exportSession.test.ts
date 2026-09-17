import { describe, expect, it } from "vitest";
import { runExport } from "./exportSession";

function track(speaker: string, opts?: { sampleRate?: number; length?: number; fileName?: string }) {
  const length = opts?.length ?? 4;
  return {
    channels: [new Float32Array(length).fill(1)],
    sampleRate: opts?.sampleRate ?? 16000,
    speaker,
    muted: [] as { start: number; end: number }[],
    fileName: opts?.fileName ?? "interview.wav",
  };
}

describe("runExport", () => {
  it("separate mode writes one wav per track with speaker-suffixed names", async () => {
    const written: string[] = [];
    const result = await runExport({
      mode: "separate",
      tracks: [track("Alex"), track("Sam")],
      cuts: [],
      directory: "/out",
      writeWav: async (path) => {
        written.push(path);
      },
    });
    expect(result.error).toBe(null);
    expect(written).toEqual(["/out/interview-Alex-edited.wav", "/out/interview-Sam-edited.wav"]);
  });

  it("merge writes stem-merge.wav", async () => {
    const written: string[] = [];
    await runExport({
      mode: "merge",
      tracks: [track("Alex"), track("Sam")],
      cuts: [],
      directory: "/out",
      writeWav: async (path) => {
        written.push(path);
      },
    });
    expect(written).toEqual(["/out/interview-merge.wav"]);
  });

  it("both writes separates plus merge file", async () => {
    const written: string[] = [];
    await runExport({
      mode: "both",
      tracks: [track("Alex"), track("Sam")],
      cuts: [],
      directory: "/out",
      writeWav: async (path) => {
        written.push(path);
      },
    });
    expect(written).toEqual([
      "/out/interview-Alex-edited.wav",
      "/out/interview-Sam-edited.wav",
      "/out/interview-merge.wav",
    ]);
  });

  it("stereo default duplicates mono to L and R on a one-channel source", async () => {
    const written: Float32Array[][] = [];
    await runExport({
      mode: "recording",
      tracks: [
        {
          channels: [new Float32Array([0.5, -0.25, 0.125])],
          sampleRate: 16000,
          speaker: "Alex",
          muted: [],
          fileName: "interview.wav",
        },
      ],
      cuts: [],
      directory: "/out",
      writeWav: async (_path, channels) => {
        written.push(channels);
      },
    });
    expect(written).toHaveLength(1);
    expect(written[0]).toHaveLength(2);
    expect(Array.from(written[0][0])).toEqual([0.5, -0.25, 0.125]);
    expect(Array.from(written[0][1])).toEqual([0.5, -0.25, 0.125]);
  });

  it('channels: "mono" writes one channel', async () => {
    const written: Float32Array[][] = [];
    await runExport({
      mode: "recording",
      tracks: [
        {
          channels: [new Float32Array([1, 0]), new Float32Array([0, 0.5])],
          sampleRate: 16000,
          speaker: "Alex",
          muted: [],
          fileName: "interview.wav",
        },
      ],
      cuts: [],
      directory: "/out",
      channels: "mono",
      writeWav: async (_path, channels) => {
        written.push(channels);
      },
    });
    expect(written).toHaveLength(1);
    expect(written[0]).toHaveLength(1);
    expect(Array.from(written[0][0])).toEqual([0.5, 0.25]);
  });

  it("runExport fails before write when track sample rates differ", async () => {
    const written: string[] = [];
    const result = await runExport({
      mode: "merge",
      tracks: [track("Alex", { sampleRate: 16000 }), track("Sam", { sampleRate: 44100 })],
      cuts: [],
      directory: "/out",
      writeWav: async (path) => {
        written.push(path);
      },
    });
    expect(written).toHaveLength(0);
    expect(result.error).toMatch(/convert/i);
    expect(result.error).toMatch(/reopen/i);
  });
});
