import { describe, expect, it } from "vitest";
import { formatTranscriptClock } from "../transcript";
import { excludeSilences, speechWindows, restoreSpeechTimes } from "./speechTimeline";

describe("speech-only transcription timeline", () => {
  it("pads speech, merges touching windows and excludes invalid timestamps", () => {
    expect(speechWindows([{start:2,end:3},{start:3.1,end:4},{start:NaN,end:9},{start:8,end:7}],10)).toEqual([{start:1.8,end:4.2,offset:0}]);
  });
  it("restores source times after a long omitted pause", () => {
    const speech = [{start:1,end:2},{start:20,end:21}];
    const windows = speechWindows(speech,30,0);
    expect(restoreSpeechTimes([{text:"one",start:0,end:.5},{text:"two",start:1.2,end:1.6}],windows,speech))
      .toEqual([{text:"one",start:1,end:1.5},{text:"two",start:20.2,end:20.6}]);
  });
  it("drops words wholly in padding and clamps words that cross a join", () => {
    const speech = [{start:1,end:2},{start:10,end:11}];
    const windows = speechWindows(speech,20);
    const restored = restoreSpeechTimes([{text:"padding",start:0,end:.1},{text:"edge",start:1,end:2}],windows,speech);
    expect(restored).toHaveLength(1);
    expect(restored[0].start).toBe(1.8);
    expect(restored[0].end).toBe(2.2);
  });
  it("produces no windows for a non-speaking recording", () => {
    expect(speechWindows([],10)).toEqual([]);
  });

  it("maps stitched Glad onto the heard 11s after amplitude silence punches the VAD span", () => {
    // Heard: host intro 00:01–00:07, Glad 00:11–00:12. VAD covers the 4s hole.
    const speech = excludeSilences([{ start: 0.6, end: 11.9 }], [{ start: 6.5, end: 10.8 }]);
    const windows = speechWindows(speech, 13.18);
    const first = windows[0]!;
    const gladStitched = first.offset + (first.end - first.start);
    const restored = restoreSpeechTimes(
      [{ text: "Glad", start: gladStitched, end: gladStitched + 0.4 }],
      windows,
      speech,
    );
    expect(restored).toHaveLength(1);
    expect(formatTranscriptClock(restored[0]!.start)).toBe("00:10.6");
  });

  it("maps stitched thanks onto the heard 7s after dropping false speech in the quiet", () => {
    // Heard: guest Hi 00:00–00:01, thanks 00:07–00:09. Silero fires inside the hole.
    const speech = excludeSilences(
      [
        { start: 0.86, end: 1.34 },
        { start: 6.14, end: 9.02 },
      ],
      [{ start: 1.04, end: 7.54 }],
    );
    const windows = speechWindows(speech, 13.18);
    const restored = restoreSpeechTimes(
      [
        { text: "Hi,", start: 0, end: 0.3 },
        { text: "thanks", start: windows[1]!.offset, end: windows[1]!.offset + 0.4 },
      ],
      windows,
      speech,
    );
    expect(restored.map((word) => word.text)).toEqual(["Hi,", "thanks"]);
    expect(formatTranscriptClock(restored[1]!.start)).toBe("00:07.3");
  });
});
