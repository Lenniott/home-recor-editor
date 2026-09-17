import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { speechWindows, restoreSpeechTimes } from "./audio/speechTimeline";
import {
  conversationParagraphs,
  formatParagraphClock,
  formatTranscriptClock,
  parseTranscript,
  selectedWordRange,
  visualWordRange,
  wordsAtOffsets,
} from "./transcript";

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

  it("parseTranscript maps fixture offsets 0 and 200 ms to 0 and 0.2 seconds", () => {
    const fixture = JSON.parse(
      readFileSync(new URL("./fixtures/whisper-cli-oj.json", import.meta.url), "utf8"),
    ) as unknown;
    const words = parseTranscript(fixture, 10);
    expect(words[0]?.start).toBe(0);
    expect(words[1]?.start).toBe(0.2);
    const speech = [{ start: 0, end: 10 }];
    const windows = speechWindows(speech, 10, 0);
    expect(restoreSpeechTimes(words, windows, speech).map((word) => word.start)).toEqual([0, 0.2]);
  });
});

describe("conversation paragraphs", () => {
  it("peels opening his, keeps the host floor, then the guest reply", () => {
    const flattened = [
      { text: "Hi,", start: 0.3, end: 0.8, trackId: "host", speaker: "Host" },
      { text: "this", start: 1.0, end: 5.0, trackId: "host", speaker: "Host" },
      { text: "lyrics.", start: 5.0, end: 5.5, trackId: "host", speaker: "Host" },
      { text: "I'm", start: 5.5, end: 5.8, trackId: "host", speaker: "Host" },
      { text: "guest.", start: 6.5, end: 6.9, trackId: "host", speaker: "Host" },
      { text: "Glad", start: 10.8, end: 11.2, trackId: "host", speaker: "Host" },
      { text: "to", start: 11.2, end: 11.4, trackId: "host", speaker: "Host" },
      { text: "you", start: 11.4, end: 11.6, trackId: "host", speaker: "Host" },
      { text: "here.", start: 11.6, end: 11.8, trackId: "host", speaker: "Host" },
      { text: "Hi,", start: 0.4, end: 0.9, trackId: "guest", speaker: "Guest" },
      { text: "thanks", start: 7.2, end: 8.4, trackId: "guest", speaker: "Guest" },
      { text: "me.", start: 8.5, end: 8.8, trackId: "guest", speaker: "Guest" },
    ].sort((a, b) => a.start - b.start || a.trackId.localeCompare(b.trackId));
    const turns = conversationParagraphs(flattened, () => 1.2);
    expect(
      turns.map((turn) => ({
        speaker: flattened[turn.indices[0]].speaker,
        clock: formatParagraphClock(turn.start, turn.end),
        text: turn.indices.map((index) => flattened[index].text).join(" "),
        seek: flattened[turn.indices[0]].start,
      })),
    ).toEqual([
      { speaker: "Host", clock: "00:00–00:01", text: "Hi,", seek: 0.3 },
      { speaker: "Guest", clock: "00:00–00:01", text: "Hi,", seek: 0.4 },
      {
        speaker: "Host",
        clock: "00:01–00:07",
        text: "this lyrics. I'm guest.",
        seek: 1.0,
      },
      { speaker: "Guest", clock: "00:07–00:09", text: "thanks me.", seek: 7.2 },
      { speaker: "Host", clock: "00:11–00:12", text: "Glad to you here.", seek: 10.8 },
    ]);
    const glad = flattened.find((word) => word.text === "Glad")!;
    expect(glad.start).toBe(10.8);
    const hostFloor = turns[2].indices;
    expect(
      visualWordRange(
        turns.map((turn) => turn.indices),
        hostFloor[0],
        hostFloor[hostFloor.length - 1],
      ),
    ).toEqual(hostFloor);
  });

  it("formats clocks as mm:ss and collapses a one-second span", () => {
    expect(formatTranscriptClock(0.59)).toBe("00:01");
    expect(formatParagraphClock(0.59, 5.8)).toBe("00:01–00:06");
    expect(formatParagraphClock(0.8, 1.2)).toBe("00:01");
  });
});
