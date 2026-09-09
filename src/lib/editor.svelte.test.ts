import { describe, expect, it } from "vitest";
import { EditorState } from "./editor.svelte";
import type { ProjectFile } from "./projectFile";
import type { PodcastProject } from "./projectV2";

const buffer = (duration = 10) =>
  ({ duration, sampleRate: 16000, length: duration * 16000, numberOfChannels: 1, getChannelData: () => new Float32Array(duration * 16000), copyFromChannel() {}, copyToChannel() {} }) as AudioBuffer;

describe("toProjectV2 / applyProjectV2 round-trip", () => {
  it("carries marks, settings, transcript, and workspace through a save/reload cycle", () => {
    const editor = new EditorState();
    editor.loadAudio(buffer(), "a.wav", new Float32Array(160000), "/rec/a.wav", "a".repeat(64));
    editor.setSelection(1, 3);
    editor.markSelection();
    editor.setBufferMs(200);
    editor.setTranscript([{ text: "hi", start: 0, end: 0.3 }], "complete");
    editor.setIn(1);
    editor.setOut(9);

    const saved = editor.toProjectV2("/rec/a.hre.json");
    expect(saved.tracks).toHaveLength(1);
    expect(saved.tracks[0].source.path).toBe("a.wav"); // relative to the project's own directory
    expect(saved.tracks[0].manualSilences).toEqual([{ start: 1, end: 3 }]);

    const reloaded = new EditorState();
    reloaded.loadAudio(buffer(), "a.wav", new Float32Array(160000), "/rec/a.wav", "a".repeat(64));
    reloaded.applyProjectV2(saved, "/rec/a.hre.json");

    expect(reloaded.rawMarkers).toEqual([{ start: 1, end: 3 }]);
    expect(reloaded.settings.bufferMs).toBe(200);
    expect(reloaded.transcriptWords).toEqual([{ text: "hi", start: 0, end: 0.3 }]);
    expect(reloaded.transcriptStatus).toBe("complete");
    expect(reloaded.inSec).toBe(1);
    expect(reloaded.outSec).toBe(9);
    expect(reloaded.projectPath).toBe("/rec/a.hre.json");
    expect(reloaded.dirty).toBe(false);
  });

  it("drops the transcript and clamps ranges when the reopened file's content doesn't match what was saved", () => {
    const editor = new EditorState();
    editor.loadAudio(buffer(10), "a.wav", new Float32Array(160000), "/rec/a.wav", "a".repeat(64));
    editor.setSelection(1, 9);
    editor.markSelection();
    editor.setTranscript([{ text: "hi", start: 0, end: 0.3 }], "complete");
    const saved = editor.toProjectV2("/rec/a.hre.json");

    // Re-open against a shorter, differently-hashed file at the same path (re-recorded/re-encoded).
    const reloaded = new EditorState();
    reloaded.loadAudio(buffer(6), "a.wav", new Float32Array(96000), "/rec/a.wav", "b".repeat(64));
    reloaded.applyProjectV2(saved, "/rec/a.hre.json");

    expect(reloaded.rawMarkers).toEqual([{ start: 1, end: 6 }]);
    expect(reloaded.transcriptWords).toEqual([]);
    expect(reloaded.transcriptStatus).toBe("missing");
  });
});

describe("applyLegacyProject", () => {
  it("migrates a version-1 sidecar's marks/settings/view into the current session", () => {
    const legacy: ProjectFile = {
      version: 1,
      audioFileName: "a.wav",
      durationSec: 10,
      rawMarkers: [{ start: 2, end: 4 }],
      inSec: 0,
      outSec: 10,
      settings: { positiveSpeechThreshold: 0.5, minSilenceMs: 300, bufferMs: 150, quietThresholdDb: -40 },
      viewStartSec: 0,
      viewDurationSec: 10,
    };
    const editor = new EditorState();
    editor.loadAudio(buffer(), "a.wav", new Float32Array(160000), "/rec/a.wav", "a".repeat(64));
    editor.applyLegacyProject(legacy, "/rec/a.hre.json");

    expect(editor.rawMarkers).toEqual([{ start: 2, end: 4 }]);
    expect(editor.projectPath).toBe("/rec/a.hre.json");
    expect(editor.transcriptStatus).toBe("missing"); // version 1 never had a transcript
    expect(editor.dirty).toBe(false);

    // The next save upgrades it to version 2 in place.
    expect(editor.toProjectV2("/rec/a.hre.json").version).toBe(2);
  });
});

describe("dirty tracking", () => {
  it("starts clean, goes dirty on an edit, and clean again once markSaved reflects that edit's revision", () => {
    const editor = new EditorState();
    editor.loadAudio(buffer(), "a.wav", new Float32Array(160000), "/rec/a.wav", "a".repeat(64));
    expect(editor.dirty).toBe(false);

    editor.setSelection(1, 2);
    editor.markSelection();
    expect(editor.dirty).toBe(true);

    editor.markSaved(editor.revision);
    expect(editor.dirty).toBe(false);
  });

  it("does not go dirty on a no-op gesture (a selection that never turns into a mark)", () => {
    const editor = new EditorState();
    editor.loadAudio(buffer(), "a.wav", new Float32Array(160000), "/rec/a.wav", "a".repeat(64));
    editor.beginEdit();
    editor.endEdit();
    expect(editor.dirty).toBe(false);
  });

  it("stays dirty for edits made after the revision a save actually captured", () => {
    const editor = new EditorState();
    editor.loadAudio(buffer(), "a.wav", new Float32Array(160000), "/rec/a.wav", "a".repeat(64));
    const revisionAtSaveStart = editor.revision;
    editor.setSelection(1, 2);
    editor.markSelection(); // lands while the (simulated) save above was "in flight"
    editor.markSaved(revisionAtSaveStart);
    expect(editor.dirty).toBe(true);
  });

  it("marks undo/redo as dirty", () => {
    const editor = new EditorState();
    editor.loadAudio(buffer(), "a.wav", new Float32Array(160000), "/rec/a.wav", "a".repeat(64));
    editor.setSelection(1, 2);
    editor.markSelection();
    editor.markSaved(editor.revision);
    editor.undo();
    expect(editor.dirty).toBe(true);
  });

  it("resets to clean on loadAudio and stays dirty across a destructive replaceAudio bake", () => {
    const editor = new EditorState();
    editor.loadAudio(buffer(), "a.wav", new Float32Array(160000), "/rec/a.wav", "a".repeat(64));
    editor.setSelection(1, 2);
    editor.markSelection();
    editor.markSaved(editor.revision);
    expect(editor.dirty).toBe(false);

    // Exercises `replaceAudio` directly rather than through `applySilenceMarked`,
    // which bakes via a real `AudioBuffer` construction unavailable outside a browser.
    editor.replaceAudio(buffer(9), new Float32Array(144000));
    expect(editor.dirty).toBe(true);
    // A bake keeps the same save destination — it isn't a new document.
    expect(editor.projectPath).toBeNull(); // never saved in this test, so still unset — but sourceSha256/speaker/filePath survive:
    expect(editor.sourceSha256).toBe("a".repeat(64));
    expect(editor.filePath).toBe("/rec/a.wav");
  });
});

describe("setTranscript", () => {
  it("is a no-op (no dirty bump) when given the same words and status again", () => {
    const editor = new EditorState();
    editor.loadAudio(buffer(), "a.wav", new Float32Array(160000), "/rec/a.wav", "a".repeat(64));
    const words = [{ text: "hi", start: 0, end: 0.3 }];
    editor.setTranscript(words, "complete");
    const revisionAfterFirst = editor.revision;
    editor.setTranscript(words, "complete");
    expect(editor.revision).toBe(revisionAfterFirst);
  });
});
