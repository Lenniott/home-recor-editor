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

  it("clips merge of a two-lane mark writes one clip wav", async () => {
    const written: string[] = [];
    const end = 4 / 16000;
    await runExport({
      mode: "merge",
      scope: "clips",
      marks: [{ start: 0, end, laneIds: ["a", "b"] }],
      tracks: [
        { ...track("Alex"), id: "a" },
        { ...track("Sam"), id: "b" },
      ],
      cuts: [],
      directory: "/out",
      writeWav: async (path) => {
        written.push(path);
      },
    });
    expect(written).toEqual(["/out/interview-clip-1.wav"]);
  });

  it("one-lane mark writes one file even in separate", async () => {
    const written: string[] = [];
    const end = 4 / 16000;
    await runExport({
      mode: "separate",
      scope: "clips",
      marks: [{ start: 0, end, laneIds: ["a"] }],
      tracks: [
        { ...track("Alex"), id: "a" },
        { ...track("Sam"), id: "b" },
      ],
      cuts: [],
      directory: "/out",
      writeWav: async (path) => {
        written.push(path);
      },
    });
    expect(written).toEqual(["/out/interview-clip-1.wav"]);
  });

  it("two-lane separate writes two speaker-suffixed clip names", async () => {
    const written: string[] = [];
    const end = 4 / 16000;
    await runExport({
      mode: "separate",
      scope: "clips",
      marks: [{ start: 0, end, laneIds: ["a", "b"] }],
      tracks: [
        { ...track("Alex"), id: "a" },
        { ...track("Sam"), id: "b" },
      ],
      cuts: [],
      directory: "/out",
      writeWav: async (path) => {
        written.push(path);
      },
    });
    expect(written).toEqual(["/out/interview-clip-1-Alex.wav", "/out/interview-clip-1-Sam.wav"]);
  });

  it("both writes merge plus separates for a two-lane mark", async () => {
    const written: string[] = [];
    const end = 4 / 16000;
    await runExport({
      mode: "both",
      scope: "clips",
      marks: [{ start: 0, end, laneIds: ["a", "b"] }],
      tracks: [
        { ...track("Alex"), id: "a" },
        { ...track("Sam"), id: "b" },
      ],
      cuts: [],
      directory: "/out",
      writeWav: async (path) => {
        written.push(path);
      },
    });
    expect(written).toEqual([
      "/out/interview-clip-1-Alex.wav",
      "/out/interview-clip-1-Sam.wav",
      "/out/interview-clip-1.wav",
    ]);
  });

  it("zero marks errors and writes nothing", async () => {
    const written: string[] = [];
    const result = await runExport({
      mode: "merge",
      scope: "clips",
      marks: [],
      tracks: [track("Alex"), track("Sam")],
      cuts: [],
      directory: "/out",
      writeWav: async (path) => {
        written.push(path);
      },
    });
    expect(written).toHaveLength(0);
    expect(result.error).toMatch(/export mark/i);
    expect(result.written).toBe(0);
  });

  it("skips a clip emptied by cuts and still writes the rest", async () => {
    const written: string[] = [];
    const clip = 4 / 16000;
    await runExport({
      mode: "merge",
      scope: "clips",
      marks: [
        { start: 0, end: clip, laneIds: ["a", "b"] },
        { start: clip, end: clip * 2, laneIds: ["a", "b"] },
      ],
      tracks: [
        { ...track("Alex", { length: 8 }), id: "a" },
        { ...track("Sam", { length: 8 }), id: "b" },
      ],
      cuts: [{ start: 0, end: clip }],
      directory: "/out",
      writeWav: async (path) => {
        written.push(path);
      },
    });
    expect(written).toEqual(["/out/interview-clip-1.wav"]);
  });

  it("existing clip path errors without writing", async () => {
    const written: string[] = [];
    const end = 4 / 16000;
    const result = await runExport({
      mode: "merge",
      scope: "clips",
      marks: [{ start: 0, end, laneIds: ["a", "b"] }],
      tracks: [
        { ...track("Alex"), id: "a" },
        { ...track("Sam"), id: "b" },
      ],
      cuts: [],
      directory: "/out",
      fileExists: (path) => path === "/out/interview-clip-1.wav",
      writeWav: async (path) => {
        written.push(path);
      },
    });
    expect(written).toHaveLength(0);
    expect(result.error).toMatch(/already exists/);
  });

  it("silences inside the range are muted in the written PCM", async () => {
    const written: Float32Array[][] = [];
    const end = 4 / 16000;
    await runExport({
      mode: "merge",
      scope: "clips",
      marks: [{ start: 0, end, laneIds: ["a"] }],
      tracks: [{ ...track("Alex"), id: "a", muted: [{ start: 0, end }] }],
      cuts: [],
      directory: "/out",
      channels: "mono",
      writeWav: async (_path, channels) => {
        written.push(channels);
      },
    });
    expect(written).toHaveLength(1);
    expect(Array.from(written[0][0])).toEqual([0, 0, 0, 0]);
  });

  it("transcript-only writes stem-transcript.txt and no wav", async () => {
    const wav: string[] = [];
    const texts: { path: string; contents: string }[] = [];
    await runExport({
      mode: "merge",
      includeAudio: false,
      includeTranscript: true,
      applyEdits: true,
      tracks: [
        {
          ...track("Alex"),
          words: [{ text: "Hello", start: 1, end: 1.5 }],
        },
      ],
      cuts: [],
      directory: "/out",
      writeWav: async (path) => {
        wav.push(path);
      },
      writeText: async (path, contents) => {
        texts.push({ path, contents });
      },
    });
    expect(wav).toHaveLength(0);
    expect(texts).toHaveLength(1);
    expect(texts[0].path).toBe("/out/interview-transcript.txt");
    expect(texts[0].contents).toContain("Hello");
    expect(texts[0].contents).toMatch(/0:00:01|00:01/);
  });

  it("apply edits off keeps a word whose span is fully cut", async () => {
    const texts: string[] = [];
    await runExport({
      mode: "merge",
      includeAudio: false,
      includeTranscript: true,
      applyEdits: false,
      tracks: [
        {
          ...track("Alex"),
          words: [{ text: "Kept", start: 0.5, end: 1.5 }],
        },
      ],
      cuts: [{ start: 0, end: 2 }],
      directory: "/out",
      writeWav: async () => {},
      writeText: async (_path, contents) => {
        texts.push(contents);
      },
    });
    expect(texts[0]).toContain("Kept");
  });

  it("apply edits on drops a cut word and remaps a later clock by the cut length", async () => {
    const texts: string[] = [];
    await runExport({
      mode: "merge",
      includeAudio: false,
      includeTranscript: true,
      applyEdits: true,
      tracks: [
        {
          ...track("Alex"),
          words: [
            { text: "Gone", start: 0.5, end: 1.5 },
            { text: "Later", start: 3, end: 3.5 },
          ],
        },
      ],
      cuts: [{ start: 0, end: 2 }],
      directory: "/out",
      writeWav: async () => {},
      writeText: async (_path, contents) => {
        texts.push(contents);
      },
    });
    expect(texts[0]).not.toContain("Gone");
    expect(texts[0]).toContain("Later");
    expect(texts[0]).toMatch(/00:01|0:00:01/);
    expect(texts[0]).not.toMatch(/00:03|0:00:03/);
  });

  it("silenced words are dropped only when apply edits is on", async () => {
    const on: string[] = [];
    const off: string[] = [];
    const tracks = [
      {
        ...track("Alex"),
        muted: [{ start: 0, end: 2 }],
        words: [{ text: "Quiet", start: 0.5, end: 1.5 }],
      },
    ];
    await runExport({
      mode: "merge",
      includeAudio: false,
      includeTranscript: true,
      applyEdits: true,
      tracks,
      cuts: [],
      directory: "/out",
      writeWav: async () => {},
      writeText: async (_path, contents) => {
        on.push(contents);
      },
    });
    await runExport({
      mode: "merge",
      includeAudio: false,
      includeTranscript: true,
      applyEdits: false,
      tracks,
      cuts: [],
      directory: "/out",
      writeWav: async () => {},
      writeText: async (_path, contents) => {
        off.push(contents);
      },
    });
    expect(on[0]).not.toContain("Quiet");
    expect(off[0]).toContain("Quiet");
  });

  it("clips scope keeps only words overlapping an export mark", async () => {
    const texts: { path: string; contents: string }[] = [];
    await runExport({
      mode: "merge",
      includeAudio: false,
      includeTranscript: true,
      applyEdits: true,
      scope: "clips",
      marks: [{ start: 4, end: 6, laneIds: ["a"] }],
      tracks: [
        {
          ...track("Alex"),
          id: "a",
          words: [
            { text: "Outside", start: 0, end: 1 },
            { text: "Inside", start: 4.2, end: 4.8 },
          ],
        },
      ],
      cuts: [],
      directory: "/out",
      writeWav: async () => {},
      writeText: async (path, contents) => {
        texts.push({ path, contents });
      },
    });
    expect(texts).toEqual([
      { path: "/out/interview-clip-1.txt", contents: expect.stringContaining("Inside") },
    ]);
    expect(texts[0].contents).not.toContain("Outside");
  });

  it("clips transcript writes one txt per clip as speaker paragraphs", async () => {
    const wav: string[] = [];
    const texts: { path: string; contents: string }[] = [];
    await runExport({
      mode: "merge",
      includeAudio: true,
      includeTranscript: true,
      applyEdits: true,
      scope: "clips",
      marks: [
        { start: 0, end: 0.0002, laneIds: ["a"] },
        { start: 0.0002, end: 0.0004, laneIds: ["a"] },
      ],
      tracks: [
        {
          ...track("Alex", { length: 8 }),
          id: "a",
          words: [
            { text: "First", start: 0, end: 0.00005 },
            { text: "clip", start: 0.00006, end: 0.0001 },
            { text: "Second", start: 0.00025, end: 0.0003 },
          ],
        },
      ],
      cuts: [],
      directory: "/out",
      writeWav: async (path) => {
        wav.push(path);
      },
      writeText: async (path, contents) => {
        texts.push({ path, contents });
      },
    });
    expect(wav).toEqual(["/out/interview-clip-1.wav", "/out/interview-clip-2.wav"]);
    expect(texts.map((item) => item.path)).toEqual([
      "/out/interview-clip-1.txt",
      "/out/interview-clip-2.txt",
    ]);
    expect(texts[0].contents).toBe("00:00.0 Alex\nFirst clip\n");
    expect(texts[1].contents).toBe("00:00.0 Alex\nSecond\n");
  });

  it("existing txt path errors and does not clobber", async () => {
    const texts: string[] = [];
    const result = await runExport({
      mode: "merge",
      includeAudio: false,
      includeTranscript: true,
      tracks: [
        {
          ...track("Alex"),
          words: [{ text: "Hello", start: 1, end: 1.5 }],
        },
      ],
      cuts: [],
      directory: "/out",
      writeWav: async () => {},
      writeText: async (path, contents) => {
        texts.push(`${path}:${contents}`);
      },
      fileExists: async (path) => path === "/out/interview-transcript.txt",
    });
    expect(result.error).toBe("/out/interview-transcript.txt already exists.");
    expect(result.written).toBe(0);
    expect(texts).toHaveLength(0);
  });
});

 it.each([
   ["all", false, true], ["all", true, false], ["clips", false, false],
 ] as const)("schema scope=%s applyEdits=%s", async (scope, applyEdits, expected) => {
   const texts: string[] = [];
   const result = await runExport({
     mode: "recording", tracks: [{ ...track("Host", { sampleRate: 10, length: 100 }), id: "a", words: [{ text: "Hello", start: 1, end: 2 }] }],
     cuts: [], directory: "/out", includeAudio: false, includeTranscript: true,
     includeMarkerSchema: true, scope, applyEdits,
     marks: [{ start: 0, end: 3, laneIds: ["a"] }],
     writeWav: async () => { throw new Error("Unexpected audio write"); },
     writeText: async (_path, contents) => { texts.push(contents); },
   });
   expect(result.error).toBeNull();
   expect(texts).toHaveLength(1);
   expect(texts[0].includes("Marker JSON instructions")).toBe(expected);
 });
