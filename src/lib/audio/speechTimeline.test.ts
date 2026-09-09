import { describe, expect, it } from "vitest";
import { speechWindows, restoreSpeechTimes } from "./speechTimeline";

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
});
