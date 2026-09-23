import type { TimelineMarker } from "./markers";
import { parseTranscriptClock } from "./transcript";

export type ImportedMarker = Omit<TimelineMarker, "id">;

/** Returns a complete validated batch or a user-facing error; never partially applies. */
export function parseMarkerImport(
  json: string,
  { speakers, durationSec }: { speakers: { name: string; id: string }[]; durationSec: number },
): ImportedMarker[] | string {
  if (!Number.isFinite(durationSec) || durationSec <= 0 || !speakers.length) return "Load a recording before adding markers.";
  let value: unknown;
  try {
    const text = json.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, "$1");
    value = JSON.parse(text);
  } catch { return 'Invalid JSON. Paste an object containing a "markers" array.'; }
  if (!value || typeof value !== "object" || !("markers" in value) || !Array.isArray(value.markers)) return 'Expected an object containing a "markers" array.';
  if (!value.markers.length) return "The markers array is empty.";
  const result: ImportedMarker[] = [];
  for (const [index, mark] of value.markers.entries()) {
    const error = (message: string) => `Marker ${index + 1}: ${message}`;
    if (!mark || typeof mark !== "object" || !["cut", "export", "silence"].includes(mark.type)) return error("type must be cut, export, or silence.");
    const start = parseTranscriptClock(mark.start), end = parseTranscriptClock(mark.end);
    if (start === null || end === null) return error("start and end must be mm:ss.s clocks (for example 00:12.4).");
    const clampedStart = Math.min(start, durationSec), clampedEnd = Math.min(end, durationSec);
    if (clampedEnd <= clampedStart) return error("end must follow start within the recording.");
    if (!Array.isArray(mark.speakers) || !mark.speakers.length) return error("speakers must be a non-empty array of speaker names.");
    const laneIds: string[] = [];
    for (const name of mark.speakers) {
      if (typeof name !== "string" || !name.trim()) return error("each speaker must be a name.");
      const matches = speakers.filter(speaker => speaker.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (!matches.length) return error(`Unknown speaker ${JSON.stringify(name)}.`);
      if (matches.length > 1) return error(`Speaker ${JSON.stringify(name)} is ambiguous. Give each track a unique speaker name.`);
      laneIds.push(matches[0].id);
    }
    result.push({ type: mark.type, start: clampedStart, end: clampedEnd, laneIds: [...new Set(laneIds)] });
  }
  return result;
}

export function formatMarkerImportSchema(speakerNames: string[]): string {
  return `--- Marker JSON instructions ---
Propose editorial markers using original recording times from this transcript.
Return JSON with this shape:
${JSON.stringify({ markers: [{ type: "export", start: "00:12.4", end: "00:18.1", speakers: speakerNames.slice(0, 1) }] }, null, 2)}
Allowed types: cut (remove time from every track), export (shareable clip), silence (mute named speakers in place).
Start and end must be strings in mm:ss.s format, with one decimal place; minutes may exceed 59. End must follow start.
Required speakers: a non-empty array chosen from ${JSON.stringify(speakerNames)} (case-insensitive). Use unique speaker names, never internal track IDs.
Cuts always affect every track, even when only one speaker is named. Export and silence affect only the named speakers.
Markers are added to existing edits. Overlapping cuts or silences with the same lanes merge; export markers stay separate.
Times beyond the recording are clamped; empty ranges and invalid markers reject the whole batch.
Use only original recording times, never clocks from an edited or clip transcript.
`;
}
