import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  cutSuggestions,
  intersect,
  normalize,
  parsePodcastProject,
  reconcileTrack,
  relativeSourcePath,
  resolveSourcePath,
  serializePodcastProject,
  subtract,
  trackSilences,
  type PodcastProject,
  type TrackDocument,
} from "./projectV2";

function track(overrides: Partial<TrackDocument> = {}): TrackDocument {
  return {
    id: "t1",
    speaker: "Speaker 1",
    source: { path: "a.wav", name: "a.wav", sha256: "a".repeat(64), duration: 10 },
    settings: { ...DEFAULT_SETTINGS },
    detected: [],
    manualSilences: [],
    restored: [],
    transcript: { status: "missing", words: [] },
    ...overrides,
  };
}

function project(overrides: Partial<PodcastProject> = {}): PodcastProject {
  return {
    version: 2,
    name: "a",
    sampleRate: 16000,
    tracks: [track()],
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
      muteMarked: false,
    },
    ...overrides,
  };
}

describe("range algebra", () => {
  it("normalize merges touching/overlapping ranges and clamps to duration", () => {
    expect(normalize([{ start: 1, end: 3 }, { start: 2, end: 5 }, { start: 8, end: 12 }], 10)).toEqual([
      { start: 1, end: 5 },
      { start: 8, end: 10 },
    ]);
  });

  it("subtract removes the given ranges from the set", () => {
    expect(subtract([{ start: 0, end: 10 }], [{ start: 3, end: 5 }])).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 10 },
    ]);
  });

  it("intersect keeps only the overlap between two sets", () => {
    expect(intersect([{ start: 0, end: 5 }], [{ start: 3, end: 8 }])).toEqual([{ start: 3, end: 5 }]);
  });
});

describe("trackSilences", () => {
  it("combines buffered detected silence, minus restored, with manual marks", () => {
    const t = track({
      detected: [{ start: 0, end: 2 }, { start: 5, end: 8 }],
      restored: [{ start: 5, end: 8 }],
      manualSilences: [{ start: 9, end: 9.5 }],
      settings: { ...DEFAULT_SETTINGS, bufferMs: 0 },
    });
    expect(trackSilences(t)).toEqual([{ start: 0, end: 2 }, { start: 9, end: 9.5 }]);
  });
});

describe("cutSuggestions", () => {
  it("suggests only where every track's detected silence overlaps, above the loosest minimum", () => {
    const a = track({ id: "a", detected: [{ start: 2, end: 6 }], settings: { ...DEFAULT_SETTINGS, bufferMs: 0, minSilenceMs: 1000 } });
    const b = track({ id: "b", detected: [{ start: 3, end: 7 }], settings: { ...DEFAULT_SETTINGS, bufferMs: 0, minSilenceMs: 500 } });
    expect(cutSuggestions([a, b], 10, [], [])).toEqual([{ start: 3, end: 6 }]);
  });

  it("treats a shorter track's missing tail as silence", () => {
    const a = track({ id: "a", detected: [], source: { ...track().source, duration: 4 }, settings: { ...DEFAULT_SETTINGS, bufferMs: 0 } });
    const b = track({ id: "b", detected: [{ start: 3, end: 10 }], settings: { ...DEFAULT_SETTINGS, bufferMs: 0 } });
    expect(cutSuggestions([a, b], 10, [], [])).toEqual([{ start: 4, end: 10 }]);
  });

  it("excludes cuts and dismissed suggestions already decided on", () => {
    const settings = { ...DEFAULT_SETTINGS, bufferMs: 0, minSilenceMs: 500 };
    const a = track({ id: "a", detected: [{ start: 0, end: 5 }], settings });
    const b = track({ id: "b", detected: [{ start: 0, end: 5 }], settings });
    expect(cutSuggestions([a, b], 10, [{ start: 0, end: 2 }], [{ start: 2, end: 4 }])).toEqual([{ start: 4, end: 5 }]);
  });
});

describe("parsePodcastProject / serializePodcastProject round-trip", () => {
  it("round-trips a well-formed project", () => {
    const p = project();
    expect(parsePodcastProject(serializePodcastProject(p))).toEqual(p);
  });

  it("rejects an unsupported version", () => {
    expect(() => parsePodcastProject(JSON.stringify({ ...project(), version: 1 }))).toThrow();
  });

  it("rejects a malformed sha256", () => {
    const p = project({ tracks: [track({ source: { ...track().source, sha256: "not-hex" } })] });
    expect(() => parsePodcastProject(JSON.stringify(p))).toThrow();
  });

  it("rejects an out-of-range silence setting", () => {
    const p = project({ tracks: [track({ settings: { ...DEFAULT_SETTINGS, positiveSpeechThreshold: 1.5 } })] });
    expect(() => parsePodcastProject(JSON.stringify(p))).toThrow();
  });

  it("rejects a workspace pointing at an unknown track", () => {
    const p = project({ workspace: { ...project().workspace, activeTrackId: "missing" } });
    expect(() => parsePodcastProject(JSON.stringify(p))).toThrow();
  });

  it("rejects an invalid viewFilter", () => {
    const p = project({ workspace: { ...project().workspace, viewFilter: "bogus" as never } });
    expect(() => parsePodcastProject(JSON.stringify(p))).toThrow();
  });

  it("clamps sidebarWidth into its allowed range", () => {
    const p = project({ workspace: { ...project().workspace, sidebarWidth: 10 } });
    expect(parsePodcastProject(JSON.stringify(p)).workspace.sidebarWidth).toBe(260);
  });
});

describe("reconcileTrack", () => {
  it("is a no-op when identity and duration both match", () => {
    const t = track();
    expect(reconcileTrack(t, 10, "a".repeat(64))).toBe(t);
  });

  it("clamps ranges and drops the transcript when content identity has changed", () => {
    const t = track({
      manualSilences: [{ start: 1, end: 9 }],
      transcript: { status: "complete", words: [{ text: "hi", start: 0, end: 0.3 }] },
    });
    const reconciled = reconcileTrack(t, 6, "b".repeat(64));
    expect(reconciled.source.duration).toBe(6);
    expect(reconciled.source.sha256).toBe("b".repeat(64));
    expect(reconciled.manualSilences).toEqual([{ start: 1, end: 6 }]);
    expect(reconciled.transcript).toEqual({ status: "missing", words: [] });
  });
});

describe("relativeSourcePath / resolveSourcePath", () => {
  it("relativizes a source path that shares a common ancestor with the project", () => {
    expect(relativeSourcePath("/Takes/2024/session.hre.json", "/Takes/2024/audio/a.wav")).toBe("audio/a.wav");
    expect(relativeSourcePath("/Takes/2024/session.hre.json", "/Takes/a.wav")).toBe("../a.wav");
  });

  it("resolves a relative source path back against the project's directory", () => {
    expect(resolveSourcePath("/Takes/2024/session.hre.json", "audio/a.wav")).toBe("/Takes/2024/audio/a.wav");
    expect(resolveSourcePath("/Takes/2024/session.hre.json", "../a.wav")).toBe("/Takes/a.wav");
  });

  it("leaves an already-absolute source path alone", () => {
    expect(resolveSourcePath("/Takes/2024/session.hre.json", "/elsewhere/a.wav")).toBe("/elsewhere/a.wav");
  });

  it("round-trips through both directions", () => {
    const projectPath = "/Users/me/Projects/interview.hre.json";
    const source = "/Users/me/Recordings/interview.wav";
    expect(resolveSourcePath(projectPath, relativeSourcePath(projectPath, source))).toBe(source);
  });
});
