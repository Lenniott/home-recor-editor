import { describe, expect, it } from "vitest";
import { EditorState } from "./editor.svelte";
import { openRecordings, saveProject } from "./projectSession";
import {
  DEFAULT_SETTINGS,
  serializePodcastProject,
  type PodcastProject,
} from "./projectV2";

const buffer = (duration = 10) =>
  ({
    duration,
    sampleRate: 16000,
    length: duration * 16000,
    numberOfChannels: 1,
    getChannelData: () => new Float32Array(duration * 16000),
    copyFromChannel() {},
    copyToChannel() {},
  }) as AudioBuffer;

function memoryDesktop(opts: {
  audio: Record<string, Uint8Array>;
  text?: Record<string, string>;
  missingText?: string[];
  unreadableText?: string[];
}) {
  const files = new Map(Object.entries(opts.text ?? {}));
  const missing = new Set(opts.missingText ?? []);
  const unreadable = new Set(opts.unreadableText ?? []);
  return {
    files,
    async readAudio(path: string) {
      const bytes = opts.audio[path];
      if (!bytes) throw new Error(`missing audio ${path}`);
      return bytes;
    },
    async readText(path: string) {
      if (unreadable.has(path)) throw new Error("Permission denied");
      if (missing.has(path) || !files.has(path)) return null;
      return files.get(path)!;
    },
    async writeText(path: string, contents: string) {
      files.set(path, contents);
    },
    async decodeAudio() {
      return buffer();
    },
  };
}

describe("openRecordings", () => {
  it("imports one recording with no companion project as an empty unmarked session", async () => {
    const editor = new EditorState();
    const desktop = memoryDesktop({
      audio: { "/rec/a.wav": new Uint8Array([0]) },
      missingText: ["/rec/a.hre.json"],
    });

    const result = await openRecordings({
      files: ["/rec/a.wav"],
      desktop,
      editor,
    });

    expect(result.tracks).toHaveLength(1);
    expect(result.error).toBe(null);
    expect(result.projectPath).toBe(null);
    expect(result.tracks[0].rawMarkers).toEqual([]);
  });

  it("restores marks and transcript from a current-format companion beside the recording", async () => {
    const sha256 =
      "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d";
    const companion: PodcastProject = {
      version: 2,
      name: "a",
      sampleRate: 16000,
      tracks: [
        {
          id: "t1",
          speaker: "Alex",
          source: { path: "a.wav", name: "a.wav", sha256, duration: 10 },
          settings: { ...DEFAULT_SETTINGS },
          detected: [],
          manualSilences: [{ start: 1, end: 3 }],
          restored: [],
          transcript: {
            status: "complete",
            words: [{ text: "hello", start: 0.1, end: 0.4 }],
          },
        },
      ],
      cuts: [],
      dismissed: [],
      workspace: {
        activeTrackId: "t1",
        preview: "edited",
        tab: "transcript",
        sidebarWidth: 320,
        sidebarOpen: true,
        viewStartSec: 0,
        viewDurationSec: 10,
        inSec: 0,
        outSec: 10,
        loop: false,
        viewFilter: "all",
        muteMarked: true,
      },
    };
    const editor = new EditorState();
    const desktop = memoryDesktop({
      audio: { "/rec/a.wav": new Uint8Array([0]) },
      text: { "/rec/a.hre.json": serializePodcastProject(companion) },
    });

    const result = await openRecordings({
      files: ["/rec/a.wav"],
      desktop,
      editor,
    });

    expect(result.error).toBe(null);
    expect(result.projectPath).toBe("/rec/a.hre.json");
    expect(result.tracks[0].rawMarkers).toEqual([{ start: 1, end: 3 }]);
    expect(result.tracks[0].transcriptWords).toEqual([
      { text: "hello", start: 0.1, end: 0.4 },
    ]);
    expect(result.tracks[0].transcriptStatus).toBe("complete");
  });

  it("blocks save to an unreadable companion and still allows Save As", async () => {
    const editor = new EditorState();
    const desktop = memoryDesktop({
      audio: { "/rec/a.wav": new Uint8Array([0]) },
      unreadableText: ["/rec/a.hre.json"],
    });

    const opened = await openRecordings({
      files: ["/rec/a.wav"],
      desktop,
      editor,
    });

    expect(opened.tracks).toHaveLength(1);
    expect(opened.tracks[0].rawMarkers).toEqual([]);
    expect(opened.projectPath).toBe(null);
    expect(opened.blockedSavePath).toBe("/rec/a.hre.json");
    expect(opened.error).toBe(
      "Permission denied The saved project is protected; use Save As for a new project.",
    );

    const blocked = await saveProject({
      editor,
      desktop,
      blockedSavePath: opened.blockedSavePath,
    });
    expect(blocked.error).toBe(
      "This project could not be restored. Use Save As to preserve the existing file.",
    );
    expect(desktop.files.has("/rec/a.hre.json")).toBe(false);

    const saved = await saveProject({
      editor,
      desktop,
      blockedSavePath: opened.blockedSavePath,
      destination: "/rec/new.hre.json",
    });
    expect(saved.error).toBe(null);
    expect(saved.projectPath).toBe("/rec/new.hre.json");
    expect(desktop.files.has("/rec/new.hre.json")).toBe(true);
  });

  it("adds a second imported recording to the open session instead of replacing it", async () => {
    const editor = new EditorState();
    const desktop = memoryDesktop({
      audio: {
        "/rec/a.wav": new Uint8Array([0]),
        "/rec/b.wav": new Uint8Array([1]),
      },
      missingText: ["/rec/a.hre.json", "/rec/b.hre.json"],
    });

    await openRecordings({
      files: ["/rec/a.wav"],
      desktop,
      editor,
    });
    const result = await openRecordings({
      files: ["/rec/b.wav"],
      desktop,
      editor,
    });

    expect(result.error).toBe(null);
    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[0].filePath).toBe("/rec/a.wav");
    expect(result.tracks[1].filePath).toBe("/rec/b.wav");
  });

  it("does not attach a recording that is already in the session", async () => {
    const editor = new EditorState();
    const desktop = memoryDesktop({
      audio: { "/rec/a.wav": new Uint8Array([0]) },
      missingText: ["/rec/a.hre.json"],
    });

    await openRecordings({
      files: ["/rec/a.wav"],
      desktop,
      editor,
    });
    editor.setSelection(1, 2);
    editor.markSelection();
    const result = await openRecordings({
      files: ["/rec/a.wav"],
      desktop,
      editor,
    });

    expect(result.error).toBe("That recording is already in this project.");
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].rawMarkers).toEqual([{ start: 1, end: 2 }]);
  });
});

describe("saveProject", () => {
  it("does not overwrite an existing sidecar when the session has no project path", async () => {
    const editor = new EditorState();
    const original = '{"keep":true}';
    const desktop = memoryDesktop({
      audio: { "/rec/a.wav": new Uint8Array([0]) },
      text: { "/rec/a.hre.json": original },
    });
    editor.loadAudio(
      buffer(),
      "a.wav",
      new Float32Array(160000),
      "/rec/a.wav",
      "a".repeat(64),
    );

    const result = await saveProject({
      editor,
      desktop,
      blockedSavePath: null,
    });

    expect(result.error).toBe(
      "A project file already exists at this name. Use Save As to keep it.",
    );
    expect(result.projectPath).toBe(null);
    expect(desktop.files.get("/rec/a.hre.json")).toBe(original);
  });

  it("still writes when the session is already bound to that project file", async () => {
    const sha256 =
      "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d";
    const companion: PodcastProject = {
      version: 2,
      name: "a",
      sampleRate: 16000,
      tracks: [
        {
          id: "t1",
          speaker: "Alex",
          source: { path: "a.wav", name: "a.wav", sha256, duration: 10 },
          settings: { ...DEFAULT_SETTINGS },
          detected: [],
          manualSilences: [{ start: 1, end: 3 }],
          restored: [],
          transcript: { status: "missing", words: [] },
        },
      ],
      cuts: [],
      dismissed: [],
      workspace: {
        activeTrackId: "t1",
        preview: "edited",
        tab: "transcript",
        sidebarWidth: 320,
        sidebarOpen: true,
        viewStartSec: 0,
        viewDurationSec: 10,
        inSec: 0,
        outSec: 10,
        loop: false,
        viewFilter: "all",
        muteMarked: true,
      },
    };
    const editor = new EditorState();
    const desktop = memoryDesktop({
      audio: { "/rec/a.wav": new Uint8Array([0]) },
      text: { "/rec/a.hre.json": serializePodcastProject(companion) },
    });
    await openRecordings({
      files: ["/rec/a.wav"],
      desktop,
      editor,
    });
    editor.setSpeaker(editor.tracks[0], "Sam");

    const result = await saveProject({
      editor,
      desktop,
      blockedSavePath: null,
    });

    expect(result.error).toBe(null);
    expect(result.projectPath).toBe("/rec/a.hre.json");
    expect(desktop.files.get("/rec/a.hre.json")).toContain("Sam");
  });
});
