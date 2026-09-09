import { describe, expect, it } from "vitest";
import { joinPath, mixFileName, projectStem, sanitizeFileNamePart, separateTrackFileNames } from "./exportNames";

describe("sanitizeFileNamePart", () => {
  it("replaces path separators and reserved punctuation", () => {
    expect(sanitizeFileNamePart('a/b\\c:d*e?f"g<h>i|j', "fallback")).toBe("a-b-c-d-e-f-g-h-i-j");
  });

  it("collapses whitespace and trims", () => {
    expect(sanitizeFileNamePart("  Alex   Kim \n", "fallback")).toBe("Alex Kim");
  });

  it("drops leading dots so an export can't land on a hidden file", () => {
    expect(sanitizeFileNamePart("..hidden", "fallback")).toBe("hidden");
  });

  it("drops trailing dots and spaces", () => {
    expect(sanitizeFileNamePart("Alex. ", "fallback")).toBe("Alex");
  });

  it("falls back when nothing usable is left", () => {
    expect(sanitizeFileNamePart("///", "track-1")).toBe("track-1");
    expect(sanitizeFileNamePart("   ", "track-2")).toBe("track-2");
  });

  it("caps the length", () => {
    expect(sanitizeFileNamePart("x".repeat(200), "fallback")).toHaveLength(60);
  });
});

describe("projectStem", () => {
  it("strips the recording's extension", () => {
    expect(projectStem("interview take 2.wav")).toBe("interview take 2");
  });

  it("names an unsaved project", () => {
    expect(projectStem(null)).toBe("Untitled");
  });
});

describe("separateTrackFileNames", () => {
  it("names one file per track from the project name and speaker", () => {
    expect(separateTrackFileNames("interview", ["Alex", "Sam"])).toEqual([
      "interview-Alex-edited.wav",
      "interview-Sam-edited.wav",
    ]);
  });

  it("keeps two identically-named speakers from writing the same file", () => {
    const [first, second] = separateTrackFileNames("interview", ["Speaker 1", "Speaker 1"]);
    expect(first).toBe("interview-Speaker 1-edited.wav");
    expect(second).not.toBe(first);
  });

  it("falls back to the lane number for an unusable speaker name", () => {
    expect(separateTrackFileNames("interview", ["/"])).toEqual(["interview-track-1-edited.wav"]);
  });
});

describe("mixFileName", () => {
  it("names the combined mix after the project", () => {
    expect(mixFileName("interview")).toBe("interview-mix.wav");
  });
});

describe("joinPath", () => {
  it("joins a posix directory", () => {
    expect(joinPath("/home/al/exports", "a.wav")).toBe("/home/al/exports/a.wav");
  });

  it("joins a windows directory with a backslash", () => {
    expect(joinPath("C:\\Users\\al\\exports", "a.wav")).toBe("C:\\Users\\al\\exports\\a.wav");
  });

  it("doesn't double a trailing separator", () => {
    expect(joinPath("/home/al/exports/", "a.wav")).toBe("/home/al/exports/a.wav");
  });

  it("keeps a root directory rooted", () => {
    expect(joinPath("/", "a.wav")).toBe("/a.wav");
  });
});
