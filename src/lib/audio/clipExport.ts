/**
 * Turn per-track clip marks into exported WAV buffers. Clips are source
 * spans (no silence mute, no shared cuts) — the same per-lane intervals
 * the transcript search-and-mark flow writes. Mixing overlapping speakers
 * is optional; separate mode writes one file per mark per track.
 */

import { combineRenders } from "./exportMix";
import { sanitizeFileNamePart } from "../exportNames";
import type { Range } from "../projectV2";

export interface ClipTrackInput {
  speaker: string;
  clips: Range[];
  channels: Float32Array[];
  sampleRate: number;
}

export interface PlannedClip {
  name: string;
  channels: Float32Array[];
  sampleRate: number;
}

export function sliceChannels(
  channels: Float32Array[],
  sampleRate: number,
  start: number,
  end: number,
): Float32Array[] {
  const length = channels[0]?.length ?? 0;
  const from = Math.max(0, Math.min(length, Math.round(start * sampleRate)));
  const to = Math.max(from, Math.min(length, Math.round(end * sampleRate)));
  return channels.map((data) => data.slice(from, to));
}

export function overlappingClipGroups(tracks: Range[][]): { start: number; end: number; trackIndexes: number[] }[] {
  const items = tracks.flatMap((clips, trackIndex) => clips.map((clip) => ({ ...clip, trackIndex })));
  items.sort((a, b) => a.start - b.start || a.end - b.end);
  const groups: { start: number; end: number; trackIndexes: number[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && item.start < last.end) {
      last.end = Math.max(last.end, item.end);
      if (!last.trackIndexes.includes(item.trackIndex)) last.trackIndexes.push(item.trackIndex);
    } else {
      groups.push({ start: item.start, end: item.end, trackIndexes: [item.trackIndex] });
    }
  }
  return groups;
}

export function clipExportNames(stem: string, entries: { speakers: string[] }[]): string[] {
  const used = new Set<string>();
  return entries.map((entry, index) => {
    const n = String(index + 1).padStart(3, "0");
    const who = entry.speakers.map((speaker, i) => sanitizeFileNamePart(speaker, `track-${i + 1}`)).join("+");
    const preferred = `${stem}-clip-${n}-${who}.wav`;
    const name = used.has(preferred.toLowerCase()) ? `${stem}-clip-${n}-${who}-${index + 1}.wav` : preferred;
    used.add(name.toLowerCase());
    return name;
  });
}

function maskToClips(channels: Float32Array[], sampleRate: number, start: number, end: number, clips: Range[]): Float32Array[] {
  const sliced = sliceChannels(channels, sampleRate, start, end);
  return sliced.map((data) => {
    const out = data.slice();
    for (let i = 0; i < out.length; i++) {
      const time = start + i / sampleRate;
      if (!clips.some((clip) => time >= clip.start && time < clip.end)) out[i] = 0;
    }
    return out;
  });
}

export function planClipRenders(
  stem: string,
  mode: "separate" | "mix",
  tracks: ClipTrackInput[],
): PlannedClip[] {
  if (mode === "separate") {
    const entries = tracks.flatMap((track) =>
      track.clips.map((clip) => ({
        speakers: [track.speaker],
        clip,
        track,
      })),
    );
    const names = clipExportNames(stem, entries);
    return entries.map((entry, index) => ({
      name: names[index],
      sampleRate: entry.track.sampleRate,
      channels: sliceChannels(entry.track.channels, entry.track.sampleRate, entry.clip.start, entry.clip.end),
    }));
  }

  const groups = overlappingClipGroups(tracks.map((track) => track.clips));
  const names = clipExportNames(
    stem,
    groups.map((group) => ({ speakers: group.trackIndexes.map((i) => tracks[i].speaker) })),
  );
  return groups.map((group, index) => {
    const members = group.trackIndexes.map((i) => tracks[i]);
    const sampleRate = members[0]?.sampleRate ?? 0;
    const renders = members.map((track) =>
      maskToClips(track.channels, track.sampleRate, group.start, group.end, track.clips),
    );
    return {
      name: names[index],
      sampleRate,
      channels: members.length === 1 ? renders[0] : combineRenders(renders),
    };
  });
}
