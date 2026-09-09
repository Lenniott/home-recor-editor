import { describe, expect, it } from "vitest";
import { parseTranscript, selectedWordRange, wordsAtOffsets } from "./transcript";

const words = [
  { text: "Hello,", start: 1, end: 1.5, from: 0, to: 6 },
  { text: "world!", start: 1.6, end: 2.2, from: 7, to: 13 },
  { text: "Next", start: 4, end: 4.4, from: 15, to: 19 },
];
describe("transcript selection", () => {
  it("selects a single word and reversed multiword ranges including pauses", () => {
    expect(selectedWordRange(words, 0, 0)).toEqual({ start: 1, end: 1.5 });
    expect(selectedWordRange(words, 2, 0)).toEqual({ start: 1, end: 4.4 });
    expect(selectedWordRange(words, -1, 0)).toBeNull();
  });
  it("snaps partial characters to words without including a touched next word", () => {
    expect(wordsAtOffsets(words, 2, 9)).toEqual([0, 1]);
    expect(wordsAtOffsets(words, 9, 2)).toEqual([0, 1]);
    expect(wordsAtOffsets(words, 0, 7)).toEqual([0, 0]);
    expect(wordsAtOffsets(words, 13, 15)).toBeNull();
    expect(wordsAtOffsets(words, 4, 4)).toBeNull();
  });
  it("handles selections spanning paragraph whitespace and punctuation", () => {
    expect(wordsAtOffsets(words, 11, 17)).toEqual([1, 2]);
    expect(wordsAtOffsets(words, 5, 6)).toEqual([0, 0]);
  });
});

describe("engine output", () => {
  it("converts milliseconds, attaches punctuation, and clamps the final word", () => {
    expect(parseTranscript({ transcription: [
      { text: " Hello", offsets: { from: 1000, to: 1500 } },
      { text: ",", offsets: { from: 1500, to: 1510 } },
      { text: " world!", offsets: { from: 1600, to: 2300 } },
    ] }, 2)).toEqual([{ text: "Hello,", start: 1, end: 1.51 }, { text: "world!", start: 1.6, end: 2 }]);
  });
  it("rejects missing, negative, nonfinite, backwards and empty timestamps", () => {
    const offsets = [undefined, { from: -1, to: 2 }, { from: 2, to: 2 }, { from: 10, to: 5 }, { from: NaN, to: 20 }, { from: 0, to: Infinity }, { from: "0", to: 10 }];
    expect(parseTranscript({ transcription: offsets.map(offsets => ({ text: "word", offsets })) }, 10)).toEqual([]);
    expect(parseTranscript(null, 10)).toEqual([]);
    expect(parseTranscript({ transcription: [{ text: "[BLANK_AUDIO]", offsets: { from: 0, to: 1000 } }] }, 10)).toEqual([]);
  });
});
