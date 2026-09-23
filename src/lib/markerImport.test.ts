import { describe, expect, it } from "vitest";
import { parseMarkerImport, formatMarkerImportSchema } from "./markerImport";
import { formatTranscriptClock, parseTranscriptClock } from "./transcript";
const context = { speakers: [{ name: "Host", id: "a" }, { name: "Guest", id: "b" }], durationSec: 20 };
const mark = { type: "export", start: "00:12.4", end: "00:18.1", speakers: ["host"] };
const parse = (markers: unknown[]) => parseMarkerImport(JSON.stringify({ markers }), context);
describe("marker import", () => {
  it("resolves names, deduplicates lanes, strips fences and clamps duration", () => {
    expect(parseMarkerImport('```json\n' + JSON.stringify({ markers: [{ ...mark, end: "01:00.0", speakers: ["HOST", "Host"] }] }) + '\n```', context)).toEqual([{ type: "export", start: 12.4, end: 20, laneIds: ["a"] }]);
  });
  it.each([
    { type: "mute" }, { start: 12.4 }, { start: "00:60.0" }, { end: "00:10.0" },
    { speakers: [] }, { speakers: ["Unknown"] }, { speakers: null }, { start: "01:00.0" },
  ])("rejects the whole batch for %j", (invalid) => {
    expect(typeof parse([mark, { ...mark, ...invalid }])).toBe("string");
  });
  it("rejects malformed documents and missing speakers", () => {
    for (const text of ['null', '{}', '[]', '{', '{"markers":[]}']) expect(typeof parseMarkerImport(text, context)).toBe("string");
    expect(typeof parse([{ type: "cut", start: "00:00.0", end: "00:01.0" }])).toBe("string");
  });
  it("rejects ambiguous names", () => {
    expect(parseMarkerImport(JSON.stringify({ markers: [mark] }), { ...context, speakers: [{ name: "Host", id: "a" }, { name: "HOST", id: "b" }] })).toContain("ambiguous");
  });
  it("exports an example accepted by the parser", () => {
    const schema = formatMarkerImportSchema(["Host", "Guest"]);
    const example = schema.slice(schema.indexOf('{'), schema.indexOf('\nAllowed types:'));
    expect(Array.isArray(parseMarkerImport(example, context))).toBe(true);
  });
  it("rounds clocks with carry and parses long recordings", () => {
    expect(formatTranscriptClock(59.96)).toBe("01:00.0");
    expect(formatTranscriptClock(0.04)).toBe("00:00.0");
    expect(parseTranscriptClock("120:03.4")).toBe(7203.4);
    expect(parseTranscriptClock(formatTranscriptClock(12.36))).toBe(12.4);
  });
});
