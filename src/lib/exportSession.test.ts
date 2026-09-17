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

  it("mix writes stem-mix.wav", async () => {
    const written: string[] = [];
    await runExport({
      mode: "mix",
      tracks: [track("Alex"), track("Sam")],
      cuts: [],
      directory: "/out",
      writeWav: async (path) => {
        written.push(path);
      },
    });
    expect(written).toEqual(["/out/interview-mix.wav"]);
  });

  it("both writes three files", async () => {
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
    expect(written).toHaveLength(3);
    expect(written.at(-1)).toBe("/out/interview-mix.wav");
  });

  it("runExport fails before write when track sample rates differ", async () => {
    const written: string[] = [];
    const result = await runExport({
      mode: "mix",
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
