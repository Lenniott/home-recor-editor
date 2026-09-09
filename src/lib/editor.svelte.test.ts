import { describe, expect, it, vi } from "vitest";
import { buildPlaybackPlan } from "./audio/playbackPlan";
import { EditorState, type TrackState } from "./editor.svelte";
import type { ProjectFile } from "./projectFile";
import type { PodcastProject } from "./projectV2";
import { vadDetector } from "./vadDetector";

const buffer = (duration = 10) =>
  ({ duration, sampleRate: 16000, length: duration * 16000, numberOfChannels: 1, getChannelData: () => new Float32Array(duration * 16000), copyFromChannel() {}, copyToChannel() {} }) as AudioBuffer;

/** A two-track session: two already-synced recordings, no marks yet. */
function twoTrackEditor(durations: [number, number] = [10, 10]): EditorState {
  const editor = new EditorState();
  editor.loadAudio(buffer(durations[0]), "a.wav", new Float32Array(durations[0] * 16000), "/rec/a.wav", "a".repeat(64));
  editor.addTrack(buffer(durations[1]), "b.wav", new Float32Array(durations[1] * 16000), "/rec/b.wav", "b".repeat(64));
  return editor;
}

/** Mark [start, end] as silence on one track, the way a drag-select would. */
function mark(editor: EditorState, track: TrackState, start: number, end: number): void {
  editor.setSelection(start, end);
  editor.markSelection(track);
}

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

  it("resets to clean on loadAudio and goes dirty again when a second track is added", () => {
    const editor = new EditorState();
    editor.loadAudio(buffer(), "a.wav", new Float32Array(160000), "/rec/a.wav", "a".repeat(64));
    editor.setSelection(1, 2);
    editor.markSelection();
    editor.markSaved(editor.revision);
    expect(editor.dirty).toBe(false);

    editor.addTrack(buffer(9), "b.wav", new Float32Array(144000), "/rec/b.wav", "b".repeat(64));
    expect(editor.dirty).toBe(true);
    // Adding a lane keeps the first track's identity and its marks.
    expect(editor.sourceSha256).toBe("a".repeat(64));
    expect(editor.filePath).toBe("/rec/a.wav");
    expect(editor.tracks[0].rawMarkers).toEqual([{ start: 1, end: 2 }]);
  });

  it("stretches the view to fit a second track that's longer than the first", () => {
    const editor = new EditorState();
    editor.loadAudio(buffer(10), "a.wav", new Float32Array(160000), "/rec/a.wav", "a".repeat(64));
    editor.addTrack(buffer(20), "b.wav", new Float32Array(320000), "/rec/b.wav", "b".repeat(64));

    expect(editor.durationSec).toBe(20);
    expect(editor.viewDurationSec).toBe(20); // stretched to show the newly-longer project
  });

  it("leaves an existing zoom alone when the second track isn't longer than the first", () => {
    const editor = new EditorState();
    editor.loadAudio(buffer(20), "a.wav", new Float32Array(320000), "/rec/a.wav", "a".repeat(64));
    editor.setView(2, 5); // user zooms in before adding the second track

    editor.addTrack(buffer(3), "b.wav", new Float32Array(48000), "/rec/b.wav", "b".repeat(64));

    expect(editor.durationSec).toBe(20); // the new track is shorter — nothing to stretch for
    expect(editor.viewStartSec).toBe(2);
    expect(editor.viewDurationSec).toBe(5); // the zoom the user chose is left alone
  });
});

describe("two-track state model", () => {
  it("keeps each track's marks, settings, and speaker to itself", () => {
    const editor = twoTrackEditor();
    const [first, second] = editor.tracks;

    mark(editor, first, 1, 3);
    editor.setActiveTrack(second.id);
    mark(editor, second, 5, 6);
    editor.setBufferMs(400); // applies to the active track only

    expect(first.rawMarkers).toEqual([{ start: 1, end: 3 }]);
    expect(second.rawMarkers).toEqual([{ start: 5, end: 6 }]);
    expect(first.settings.bufferMs).toBe(150);
    expect(second.settings.bufferMs).toBe(400);
    // The active-lane shorthands follow whichever track is selected.
    expect(editor.rawMarkers).toEqual([{ start: 5, end: 6 }]);
    expect(editor.settings.bufferMs).toBe(400);
  });

  it("silencing one track leaves the other track and the project duration alone", () => {
    const editor = twoTrackEditor();
    const [first, second] = editor.tracks;
    mark(editor, first, 1, 3);

    expect(second.rawMarkers).toEqual([]);
    expect(editor.durationSec).toBe(10);
    expect(editor.displayKeptDuration).toBe(10);
  });

  it("takes the project duration from the longest track", () => {
    const editor = twoTrackEditor([10, 6]);
    expect(editor.durationSec).toBe(10);
    expect(editor.tracks[1].durationSec).toBe(6);
  });

  it("round-trips both tracks through a save/reload cycle", () => {
    const editor = twoTrackEditor();
    const [first, second] = editor.tracks;
    editor.setSpeaker(first, "Alex");
    editor.setSpeaker(second, "Sam");
    mark(editor, first, 1, 3);
    mark(editor, second, 5, 6);
    editor.setActiveTrack(second.id);
    editor.setTranscript([{ text: "hi", start: 0, end: 0.3 }], "complete");
    editor.setSelection(7, 8);
    editor.cutSelection();

    const saved = editor.toProjectV2("/rec/session.hre.json");
    expect(saved.tracks).toHaveLength(2);
    expect(saved.tracks.map((t) => t.speaker)).toEqual(["Alex", "Sam"]);
    expect(saved.tracks.map((t) => t.source.path)).toEqual(["a.wav", "b.wav"]);
    expect(saved.tracks[0].manualSilences).toEqual([{ start: 1, end: 3 }]);
    expect(saved.cuts).toEqual([{ start: 7, end: 8 }]);
    expect(saved.workspace.activeTrackId).toBe(second.id);

    const reloaded = twoTrackEditor();
    reloaded.applyProjectV2(saved, "/rec/session.hre.json");

    expect(reloaded.tracks.map((t) => t.speaker)).toEqual(["Alex", "Sam"]);
    expect(reloaded.tracks[0].rawMarkers).toEqual([{ start: 1, end: 3 }]);
    expect(reloaded.tracks[1].rawMarkers).toEqual([{ start: 5, end: 6 }]);
    expect(reloaded.tracks[1].transcriptWords).toEqual([{ text: "hi", start: 0, end: 0.3 }]);
    expect(reloaded.tracks[0].transcriptStatus).toBe("missing");
    expect(reloaded.cuts).toEqual([{ start: 7, end: 8 }]);
    expect(reloaded.activeTrack?.id).toBe(reloaded.tracks[1].id);
    expect(reloaded.dirty).toBe(false);
  });

  it("undoes an edit on the track that made it, leaving the other alone", () => {
    const editor = twoTrackEditor();
    const [first, second] = editor.tracks;
    mark(editor, first, 1, 3);
    mark(editor, second, 5, 6);

    editor.undo();

    expect(editor.tracks[0].rawMarkers).toEqual([{ start: 1, end: 3 }]);
    expect(editor.tracks[1].rawMarkers).toEqual([]);
  });

  it("removes a lane without touching the shared cuts", () => {
    const editor = twoTrackEditor();
    editor.setSelection(2, 4);
    editor.cutSelection();
    editor.removeTrack(editor.tracks[1].id);

    expect(editor.tracks).toHaveLength(1);
    expect(editor.activeTrack?.id).toBe(editor.tracks[0].id);
    expect(editor.cuts).toEqual([{ start: 2, end: 4 }]);
  });

  it("re-clamps cuts, dismissed suggestions, and workspace position when removing the longer of two tracks shrinks the project", () => {
    const editor = twoTrackEditor([6, 10]); // track 0 is 6s, track 1 (removed below) is 10s
    editor.setSelection(7, 9);
    editor.cutSelection(); // valid now: project duration is 10 while both tracks are loaded
    editor.dismissCut({ start: 4, end: 5.5 });
    editor.setOut(10);
    editor.setPlayhead(9.5);

    editor.removeTrack(editor.tracks[1].id);

    expect(editor.durationSec).toBe(6);
    // A cut entirely past the new duration is dropped outright, not left dangling.
    expect(editor.cuts).toEqual([]);
    expect(editor.dismissed).toEqual([{ start: 4, end: 5.5 }]);
    expect(editor.outSec).toBeLessThanOrEqual(6);
    expect(editor.playheadSec).toBeLessThanOrEqual(6);
    // The result must still be a project the schema accepts — nothing left over-length.
    expect(() => editor.toProjectV2("/rec/a.hre.json")).not.toThrow();
  });
});

describe("shared cuts", () => {
  it("removes the same span from the shared timeline for every track", () => {
    const editor = twoTrackEditor();
    editor.setSelection(2, 4);
    editor.cutSelection();

    expect(editor.cuts).toEqual([{ start: 2, end: 4 }]);
    editor.setPreview("edited");
    expect(editor.displayKeptDuration).toBe(8);
    expect(editor.timelineSpans.map((s) => [s.kind, s.sourceStart, s.sourceEnd])).toEqual([
      ["keep", 0, 2],
      ["hidden", 2, 4],
      ["keep", 4, 10],
    ]);
    // Nothing about the loaded audio changed — a cut is reversible.
    expect(editor.tracks.every((t) => t.durationSec === 10)).toBe(true);
  });

  it("merges overlapping cuts and puts time back on restore", () => {
    const editor = twoTrackEditor();
    editor.addCut({ start: 2, end: 4 });
    editor.addCut({ start: 3, end: 6 });
    expect(editor.cuts).toEqual([{ start: 2, end: 6 }]);

    editor.restoreCut({ start: 2, end: 6 });
    expect(editor.cuts).toEqual([]);
    expect(editor.displayKeptDuration).toBe(10);
  });

  it("undoes a cut", () => {
    const editor = twoTrackEditor();
    editor.addCut({ start: 2, end: 4 });
    editor.undo();
    expect(editor.cuts).toEqual([]);
  });

  it("shows the untouched timeline again in the original preview", () => {
    const editor = twoTrackEditor();
    editor.addCut({ start: 2, end: 4 });
    editor.setPreview("original");

    expect(editor.hiddenIntervals).toEqual([]);
    expect(editor.displayKeptDuration).toBe(10);
    expect(editor.mutedIntervalsFor(editor.tracks[0])).toEqual([]);
  });
});

describe("cut suggestion review", () => {
  /** Both speakers quiet from 2s to 6s, with track A also quiet on its own from 8s. */
  function withOverlappingSilence(): EditorState {
    const editor = twoTrackEditor();
    const [first, second] = editor.tracks;
    editor.setBufferMs(0, first);
    editor.setBufferMs(0, second);
    mark(editor, first, 2, 6);
    mark(editor, first, 8, 10);
    mark(editor, second, 3, 7);
    return editor;
  }

  it("suggests only the span both tracks call silence", () => {
    const editor = withOverlappingSilence();
    expect(editor.cutSuggestionList).toEqual([{ start: 3, end: 6 }]);
  });

  it("accepting a suggestion moves it into the cuts and stops suggesting it", () => {
    const editor = withOverlappingSilence();
    editor.addCut(editor.cutSuggestionList[0]);

    expect(editor.cuts).toEqual([{ start: 3, end: 6 }]);
    expect(editor.cutSuggestionList).toEqual([]);
    expect(editor.displayKeptDuration).toBe(10);
  });

  it("dismissing a suggestion stops suggesting it without removing anything", () => {
    const editor = withOverlappingSilence();
    editor.dismissCut(editor.cutSuggestionList[0]);

    expect(editor.cuts).toEqual([]);
    expect(editor.dismissed).toEqual([{ start: 3, end: 6 }]);
    expect(editor.cutSuggestionList).toEqual([]);
    expect(editor.displayKeptDuration).toBe(10);
  });

  it("accepts every pending suggestion in one step", () => {
    const editor = withOverlappingSilence();
    // A second overlapping stretch, so "accept all" has more than one to take.
    mark(editor, editor.tracks[1], 8, 10);

    expect(editor.cutSuggestionList).toHaveLength(2);
    editor.acceptAllCuts();
    expect(editor.cuts).toEqual([{ start: 3, end: 6 }, { start: 8, end: 10 }]);
    expect(editor.cutSuggestionList).toEqual([]);
  });

  it("treats a shorter track's missing tail as silence for both tracks", () => {
    const editor = twoTrackEditor([10, 6]);
    const [first, second] = editor.tracks;
    editor.setBufferMs(0, first);
    editor.setBufferMs(0, second);
    mark(editor, first, 5, 10);

    expect(editor.cutSuggestionList).toEqual([{ start: 6, end: 10 }]);
  });

  it("re-running detection on one track keeps the other's marks, the accepted cuts, and the dismissals", async () => {
    const editor = withOverlappingSilence();
    editor.addCut({ start: 3, end: 4 });
    editor.dismissCut({ start: 4, end: 5 });
    const detect = vi.spyOn(vadDetector, "detect").mockResolvedValue([{ start: 0, end: 1 }]);

    try {
      await editor.runSilenceDetection(editor.tracks[0]);
    } finally {
      detect.mockRestore();
    }

    // Detection replaced only the track it ran on.
    expect(editor.tracks[0].rawMarkers).toEqual([{ start: 0, end: 10 }]);
    expect(editor.tracks[1].rawMarkers).toEqual([{ start: 3, end: 7 }]);
    expect(editor.cuts).toEqual([{ start: 3, end: 4 }]);
    expect(editor.dismissed).toEqual([{ start: 4, end: 5 }]);
    expect(editor.cutSuggestionList).toEqual([{ start: 5, end: 7 }]);
  });
});

describe("non-destructive playback", () => {
  it("skips cuts for both tracks at once and mutes each track's own silences in place", () => {
    const editor = twoTrackEditor();
    const [first, second] = editor.tracks;
    editor.setBufferMs(0, first);
    editor.setBufferMs(0, second);
    mark(editor, first, 1, 2);
    editor.addCut({ start: 4, end: 6 });

    editor.setPreview("edited");
    const plan = buildPlaybackPlan(
      editor.timelineSpans,
      0,
      editor.durationSec,
      editor.tracks.map((track) => ({ mutedIntervals: editor.mutedIntervalsFor(track) })),
    );

    expect(plan.chunks).toEqual([
      { sourceStart: 0, sourceEnd: 4, playAt: 0 },
      { sourceStart: 6, sourceEnd: 10, playAt: 4 },
    ]);
    expect(plan.totalSec).toBe(8); // only the cut shortens playback
    // Track A ducks its own 1–2s silence; track B only gets the shared splice fade.
    expect(plan.tracks[0].gainEvents.filter((e) => e.time > 0.5 && e.time < 3)).toHaveLength(4);
    expect(plan.tracks[1].gainEvents.every((e) => e.time >= 3.9)).toBe(true);
  });

  it("plays the untouched recordings in the original preview", () => {
    const editor = twoTrackEditor();
    mark(editor, editor.tracks[0], 1, 2);
    editor.addCut({ start: 4, end: 6 });
    editor.setPreview("original");

    const plan = buildPlaybackPlan(
      editor.timelineSpans,
      0,
      editor.durationSec,
      editor.tracks.map((track) => ({ mutedIntervals: editor.mutedIntervalsFor(track) })),
    );

    expect(plan.chunks).toEqual([{ sourceStart: 0, sourceEnd: 10, playAt: 0 }]);
    expect(plan.tracks.every((t) => t.gainEvents.length === 0)).toBe(true);
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

describe("cleanup review workflow", () => {
  it("keeps new cut markers on the full timeline until edited preview is requested", () => {
    const e = twoTrackEditor();
    e.setSelection(2, 4);
    e.cutSelection();
    expect(e.cuts).toEqual([{ start: 2, end: 4 }]);
    expect(e.displayKeptDuration).toBe(10);
    e.setPreview("edited");
    expect(e.displayKeptDuration).toBe(8);
  });
  it("silences every explicitly selected lane and no others", () => {
    const e = twoTrackEditor();
    e.setSelection(2, 4, e.tracks.map(t => t.id));
    e.markSelection();
    expect(e.tracks.map(t => t.rawMarkers)).toEqual([[{start: 2, end: 4}], [{start: 2, end: 4}]]);
    e.undo();
    expect(e.tracks.map(t => t.rawMarkers)).toEqual([[], []]);
  });
  it("leaves a selection pending even when it overlaps an existing marker", () => {
    const e = twoTrackEditor();
    e.activeTrack!.rawMarkers = [{start: 2, end: 4}];
    e.setSelection(2, 5);
    e.finishSelectionDrag();
    expect(e.selectionRange).toEqual({start: 2, end: 5});
    expect(e.rawMarkers).toEqual([{start: 2, end: 4}]);
  });
});

describe("all-track analysis and speech scope", () => {
  it("runs speech detection sequentially for every track while preserving manual marks", async () => {
    const e = twoTrackEditor();
    e.tracks.forEach(t => t.monoSamples.fill(.5));
    e.tracks[0].rawMarkers = [{start:1,end:2}];
    let active = 0, peak = 0;
    const detector = vi.spyOn(vadDetector, "detect").mockImplementation(async () => {
      active++; peak = Math.max(active,peak);
      await Promise.resolve();
      active--;
      return [{start:0,end:8}];
    });
    await e.detectAllTracks();
    expect(detector).toHaveBeenCalledTimes(2);
    expect(peak).toBe(1);
    expect(e.tracks[0].rawMarkers).toContainEqual({start:1,end:2});
    expect(e.tracks[1].rawMarkers.length).toBeGreaterThan(0);
    detector.mockRestore();
  });
  it("does not attach detection results to a replacement recording", async () => {
    const e = twoTrackEditor();
    let complete!: (value: {start:number;end:number}[]) => void;
    const detector = vi.spyOn(vadDetector, "detect").mockImplementation(() => new Promise(resolve => complete = resolve));
    const job = e.detectAllTracks();
    e.loadAudio(buffer(), "new.wav", new Float32Array(160000));
    complete([]);
    await job;
    expect(e.rawMarkers).toEqual([]);
    expect(detector).toHaveBeenCalledTimes(1);
    detector.mockRestore();
  });
  it("silences selected words only within their owning speaker ranges", () => {
    const e = twoTrackEditor();
    const [a,b] = e.tracks;
    e.selectTranscriptWords([{trackId:a.id,text:"A",start:1,end:2},{trackId:b.id,text:"B",start:3,end:5}]);
    e.markSelection();
    expect(a.rawMarkers).toEqual([{start:1,end:2}]);
    expect(b.rawMarkers).toEqual([{start:3,end:5}]);
    e.undo();
    expect(e.selectionTrackIds).toEqual([a.id,b.id]);
    expect(e.selectionFor(a)).toMatchObject({start:1,end:2});
    e.cutSelection();
    expect(e.cuts).toEqual([{start:1,end:5}]);
    expect(e.displayKeptDuration).toBe(10);
  });
});


describe("unified marker actions and zoom", () => {
  it("converts every silence marker into shared cuts as one undoable edit", () => {
    const e = twoTrackEditor();
    e.setBufferMs(0, e.tracks[0]);
    e.setBufferMs(0, e.tracks[1]);
    mark(e, e.tracks[0], 1, 3);
    mark(e, e.tracks[1], 2, 4);
    e.addCut({start: 7, end: 8});

    e.convertAllSilencesToCuts();

    expect(e.cuts).toEqual([{start: 1, end: 4}, {start: 7, end: 8}]);
    expect(e.tracks.map(track => track.rawMarkers)).toEqual([[], []]);
    e.undo();
    expect(e.cuts).toEqual([{start: 7, end: 8}]);
    expect(e.tracks.map(track => track.rawMarkers)).toEqual([
      [{start: 1, end: 3}],
      [{start: 2, end: 4}],
    ]);
  });

  it("marks, trims, and undoes either action through the same interface", () => {
    for (const action of ["silence","cut"] as const) {
      const e = twoTrackEditor();
      e.markerAction = action;
      e.setSelection(2,6);
      e.markAction();
      e.setSelection(3,4);
      e.unmarkAction();
      expect(action === "cut" ? e.cuts : e.rawMarkers).toEqual([{start:2,end:3},{start:4,end:6}]);
      e.undo();
      expect(action === "cut" ? e.cuts : e.rawMarkers).toEqual([{start:2,end:6}]);
    }
  });
  it("drags and merges cut marker boundaries without removing time", () => {
    const e = twoTrackEditor();
    e.addCut({start:2,end:4}); e.addCut({start:5,end:7});
    e.commitEdit(() => { e.moveCut(0,"end",6); e.finishCutDrag(); });
    expect(e.cuts).toEqual([{start:2,end:7}]);
    expect(e.displayKeptDuration).toBe(10);
    e.undo();
    expect(e.cuts).toHaveLength(2);
  });
  it("uses reciprocal zoom steps and clamps to the available timeline", () => {
    const e = twoTrackEditor();
    e.zoomView(.8);
    expect(e.viewDurationSec).toBe(8);
    expect(e.viewStartSec).toBe(1);
    e.zoomView(1.25);
    expect(e.viewDurationSec).toBe(10);
    expect(e.viewStartSec).toBe(0);
    e.zoomView(.000001);
    expect(e.viewDurationSec).toBe(.2);
  });
});
