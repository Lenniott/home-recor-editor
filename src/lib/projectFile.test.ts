import { describe, expect, it } from "vitest";
import {
  parseProjectFile,
  reconcileProjectWithDuration,
  serializeProject,
  sidecarPath,
  type ProjectFile,
} from "./projectFile";

describe("sidecarPath", () => {
  it("swaps the extension for .hre.json", () => {
    expect(sidecarPath("/Takes/interview.wav")).toBe("/Takes/interview.hre.json");
  });

  it("keeps the directory on Windows-style paths", () => {
    expect(sidecarPath("C:\\Takes\\interview.wav")).toBe("C:\\Takes\\interview.hre.json");
  });

  it("handles a bare filename with no directory", () => {
    expect(sidecarPath("interview.wav")).toBe("interview.hre.json");
  });

  it("handles a filename with no extension", () => {
    expect(sidecarPath("/Takes/interview")).toBe("/Takes/interview.hre.json");
  });
});

describe("serializeProject / parseProjectFile round-trip", () => {
  const snapshot = {
    audioFileName: "interview.wav",
    durationSec: 120,
    rawMarkers: [{ start: 1, end: 2 }, { start: 5, end: 6 }],
    inSec: 0,
    outSec: 120,
    settings: { positiveSpeechThreshold: 0.5, minSilenceMs: 300, bufferMs: 150 },
    viewStartSec: 3,
    viewDurationSec: 45,
  };

  it("round-trips a full project", () => {
    const json = serializeProject(snapshot);
    const parsed = parseProjectFile(json);

    expect(parsed).not.toBeNull();
    expect(parsed).toEqual({ version: 1, ...snapshot });
  });

  it("round-trips an empty marker list", () => {
    const json = serializeProject({ ...snapshot, rawMarkers: [] });
    const parsed = parseProjectFile(json);

    expect(parsed?.rawMarkers).toEqual([]);
  });
});

describe("parseProjectFile validation", () => {
  it("returns null for malformed JSON", () => {
    expect(parseProjectFile("{not json")).toBeNull();
  });

  it("returns null for a non-object payload", () => {
    expect(parseProjectFile("42")).toBeNull();
  });

  it("returns null for an unsupported version", () => {
    const json = JSON.stringify({
      version: 2,
      audioFileName: "a.wav",
      durationSec: 1,
      rawMarkers: [],
      inSec: 0,
      outSec: 1,
      settings: { positiveSpeechThreshold: 0.5, minSilenceMs: 300, bufferMs: 150 },
      viewStartSec: 0,
      viewDurationSec: 1,
    });

    expect(parseProjectFile(json)).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    const json = JSON.stringify({ version: 1, audioFileName: "a.wav" });

    expect(parseProjectFile(json)).toBeNull();
  });

  it("returns null when the view window is missing", () => {
    const json = JSON.stringify({
      version: 1,
      audioFileName: "a.wav",
      durationSec: 10,
      rawMarkers: [],
      inSec: 0,
      outSec: 10,
      settings: { positiveSpeechThreshold: 0.5, minSilenceMs: 300, bufferMs: 150 },
    });

    expect(parseProjectFile(json)).toBeNull();
  });

  it("drops invalid individual markers instead of failing the whole parse", () => {
    const json = JSON.stringify({
      version: 1,
      audioFileName: "a.wav",
      durationSec: 10,
      rawMarkers: [{ start: 1, end: 2 }, { start: 5, end: 3 }, { start: "x", end: 4 }],
      inSec: 0,
      outSec: 10,
      settings: { positiveSpeechThreshold: 0.5, minSilenceMs: 300, bufferMs: 150 },
      viewStartSec: 0,
      viewDurationSec: 10,
    });

    const parsed = parseProjectFile(json);

    expect(parsed?.rawMarkers).toEqual([{ start: 1, end: 2 }]);
  });
});

describe("reconcileProjectWithDuration", () => {
  const project: ProjectFile = {
    version: 1,
    audioFileName: "a.wav",
    durationSec: 10,
    rawMarkers: [{ start: 1, end: 2 }, { start: 8, end: 12 }, { start: 15, end: 20 }],
    inSec: 0,
    outSec: 10,
    settings: { positiveSpeechThreshold: 0.5, minSilenceMs: 300, bufferMs: 150 },
    viewStartSec: 2,
    viewDurationSec: 10,
  };

  it("is a no-op when durations match", () => {
    expect(reconcileProjectWithDuration(project, 10)).toBe(project);
  });

  it("drops markers entirely past the new duration", () => {
    const reconciled = reconcileProjectWithDuration(project, 9);

    expect(reconciled.rawMarkers).not.toContainEqual({ start: 15, end: 20 });
  });

  it("clamps a marker that straddles the new duration", () => {
    const reconciled = reconcileProjectWithDuration(project, 9);

    expect(reconciled.rawMarkers).toContainEqual({ start: 8, end: 9 });
  });

  it("clamps inSec/outSec to the new duration", () => {
    const reconciled = reconcileProjectWithDuration({ ...project, outSec: 10 }, 5);

    expect(reconciled.outSec).toBe(5);
    expect(reconciled.inSec).toBe(0);
  });

  it("clamps the view window to the new duration", () => {
    const reconciled = reconcileProjectWithDuration(project, 5);

    expect(reconciled.viewStartSec).toBe(2);
    expect(reconciled.viewDurationSec).toBe(5);
  });
});
