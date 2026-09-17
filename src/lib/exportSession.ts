/**
 * Export session seam: staging, naming, and writes. The page picks a
 * destination then calls `runExport`; tests inject writeWav.
 */
import {
  alignRenders,
  combineRenders,
  frameCount,
  layoutChannels,
  padToFrames,
  renderForExport,
  type ExportChannelLayout,
} from "./audio/exportMix";
import {
  clipFileName,
  clipSeparateFileName,
  clipTranscriptFileName,
  mergeFileName,
  joinPath,
  projectStem,
  separateTrackFileNames,
} from "./exportNames";
import { formatExportTranscript, type ExportTranscriptLine } from "./transcript";

export type ExportMode = "separate" | "merge" | "both" | "recording";
export type ExportScope = "all" | "clips";
export type ExportMark = { start: number; end: number; laneIds: string[] };

export type ExportTrack = {
  id?: string;
  channels: Float32Array[];
  sampleRate: number;
  speaker: string;
  muted: { start: number; end: number }[];
  words?: { text: string; start: number; end: number }[];
  fileName?: string | null;
};

type Interval = { start: number; end: number };

function shiftIntervals(intervals: Interval[], start: number, end: number): Interval[] {
  return intervals
    .map((interval) => ({
      start: Math.max(interval.start, start) - start,
      end: Math.min(interval.end, end) - start,
    }))
    .filter((interval) => interval.end > interval.start);
}

function sliceChannels(channels: Float32Array[], sampleRate: number, start: number, end: number): Float32Array[] {
  const from = Math.max(0, Math.round(start * sampleRate));
  const to = Math.max(from, Math.round(end * sampleRate));
  return channels.map((channel) => channel.slice(from, to));
}

function trackId(track: ExportTrack, index: number): string {
  return track.id ?? String(index);
}

export async function runExport({
  mode,
  tracks,
  cuts,
  directory,
  writeWav,
  onProgress,
  channels = "stereo",
  scope = "all",
  marks = [],
  fileExists,
  includeAudio = true,
  includeTranscript = false,
  applyEdits = true,
  writeText,
}: {
  mode: ExportMode;
  tracks: ExportTrack[];
  cuts: Interval[];
  directory: string;
  writeWav: (path: string, channels: Float32Array[], sampleRate: number) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
  onProgress?: (progress: number, stage: string) => void;
  channels?: ExportChannelLayout;
  scope?: ExportScope;
  marks?: ExportMark[];
  fileExists?: (path: string) => boolean | Promise<boolean>;
  includeAudio?: boolean;
  includeTranscript?: boolean;
  applyEdits?: boolean;
}): Promise<{ error: string | null; written: number }> {
  if (tracks.length === 0) return { error: null, written: 0 };
  const sampleRate = tracks[0].sampleRate;
  const mismatch = tracks.find((track) => track.sampleRate !== sampleRate);
  if (mismatch) {
    return {
      error:
        `The tracks were recorded at different sample rates (${sampleRate} Hz and ${mismatch.sampleRate} Hz). ` +
        `Convert them to a single rate and reopen the project — exporting doesn't resample.`,
      written: 0,
    };
  }

  if (scope === "clips" && includeAudio) {
    const textPlan = includeTranscript
      ? planTranscriptJobs({ tracks, cuts, directory, marks, scope, applyEdits })
      : [];
    if (includeTranscript && fileExists) {
      for (const job of textPlan) {
        if (await fileExists(job.path)) return { error: `${job.path} already exists.`, written: 0 };
      }
    }
    const clips = await exportClips({
      mode,
      tracks,
      cuts,
      directory,
      writeWav,
      onProgress,
      channels,
      marks,
      fileExists,
      sampleRate,
    });
    if (clips.error) return clips;
    const text = includeTranscript
      ? await writeTranscriptJobs(textPlan, writeText)
      : { error: null as string | null, written: 0 };
    if (text.error) return { error: text.error, written: clips.written };
    return { error: null, written: clips.written + text.written };
  }

  if (scope === "clips" && !includeAudio) {
    if (marks.length === 0) return { error: "No export marks to write as clips.", written: 0 };
  }

  const stem = projectStem(tracks[0].fileName ?? "export");
  let written = 0;
  if (includeAudio) {
    const longestFrames = Math.max(...tracks.map((track) => track.channels[0]?.length ?? 0));
    const staged: Float32Array[][] = [];
    for (const [index, track] of tracks.entries()) {
      onProgress?.(0.08 + (0.34 * index) / tracks.length, `Rendering ${track.speaker}`);
      staged.push(
        renderForExport(padToFrames(track.channels, longestFrames), sampleRate, track.muted, cuts),
      );
    }
    const renders = alignRenders(staged);
    if (frameCount(renders[0]) === 0) {
      return { error: "Nothing left to export — the cuts cover the whole project.", written: 0 };
    }

    if (mode === "recording") {
      const name = `${stem}-edited.wav`;
      onProgress?.(0.8, `Writing ${name}`);
      await writeWav(joinPath(directory, name), layoutChannels(renders[0], channels), sampleRate);
      written = 1;
    } else {
      if (mode !== "merge") {
        const names = separateTrackFileNames(
          stem,
          tracks.map((track) => track.speaker),
        );
        for (const [index, name] of names.entries()) {
          onProgress?.(0.5 + (0.4 * written) / tracks.length, `Writing ${name}`);
          await writeWav(joinPath(directory, name), layoutChannels(renders[index], channels), sampleRate);
          written++;
        }
      }
      if (mode !== "separate") {
        const name = mergeFileName(stem);
        onProgress?.(0.9, "Merging and writing combined WAV");
        await writeWav(joinPath(directory, name), layoutChannels(combineRenders(renders), channels), sampleRate);
        written++;
      }
    }
  }

  if (includeTranscript) {
    const text = await writeTranscriptFile({
      tracks,
      cuts,
      directory,
      marks,
      scope,
      applyEdits,
      writeText,
      fileExists,
    });
    if (text.error) return { error: text.error, written };
    written += text.written;
  }

  onProgress?.(1, "Export complete");
  return { error: null, written };
}

async function exportClips({
  mode,
  tracks,
  cuts,
  directory,
  writeWav,
  onProgress,
  channels,
  marks,
  fileExists,
  sampleRate,
}: {
  mode: ExportMode;
  tracks: ExportTrack[];
  cuts: Interval[];
  directory: string;
  writeWav: (path: string, channels: Float32Array[], sampleRate: number) => Promise<void>;
  onProgress?: (progress: number, stage: string) => void;
  channels: ExportChannelLayout;
  marks: ExportMark[];
  fileExists?: (path: string) => boolean | Promise<boolean>;
  sampleRate: number;
}): Promise<{ error: string | null; written: number }> {
  if (marks.length === 0) {
    return { error: "No export marks to write as clips.", written: 0 };
  }

  const stem = projectStem(tracks[0].fileName ?? "export");
  const ordered = [...marks].sort((a, b) => a.start - b.start || a.end - b.end);
  const jobs: { path: string; channels: Float32Array[] }[] = [];
  let clipIndex = 0;

  for (const mark of ordered) {
    const lanes = tracks.filter((track, index) => mark.laneIds.includes(trackId(track, index)));
    if (lanes.length === 0) continue;
    const staged = lanes.map((track) => {
      const sliced = sliceChannels(track.channels, sampleRate, mark.start, mark.end);
      return renderForExport(
        sliced,
        sampleRate,
        shiftIntervals(track.muted, mark.start, mark.end),
        shiftIntervals(cuts, mark.start, mark.end),
      );
    });
    if (staged.every((render) => frameCount(render) === 0)) continue;
    clipIndex++;
    const oneLane = lanes.length === 1;
    const aligned = alignRenders(staged);
    if (oneLane || mode === "merge") {
      const render = oneLane ? aligned[0] : combineRenders(aligned);
      if (frameCount(render) === 0) {
        clipIndex--;
        continue;
      }
      jobs.push({
        path: joinPath(directory, clipFileName(stem, clipIndex)),
        channels: layoutChannels(render, channels),
      });
      continue;
    }
    if (mode === "separate" || mode === "both") {
      for (const [index, track] of lanes.entries()) {
        if (frameCount(aligned[index]) === 0) continue;
        jobs.push({
          path: joinPath(directory, clipSeparateFileName(stem, clipIndex, track.speaker, index)),
          channels: layoutChannels(aligned[index], channels),
        });
      }
    }
    if (mode === "both") {
      const mixed = combineRenders(aligned);
      if (frameCount(mixed) > 0) {
        jobs.push({
          path: joinPath(directory, clipFileName(stem, clipIndex)),
          channels: layoutChannels(mixed, channels),
        });
      }
    }
  }

  if (fileExists) {
    for (const job of jobs) {
      if (await fileExists(job.path)) {
        return { error: `${job.path} already exists.`, written: 0 };
      }
    }
  }

  let written = 0;
  for (const job of jobs) {
    onProgress?.(0.5 + (0.5 * written) / Math.max(1, jobs.length), `Writing ${job.path}`);
    await writeWav(job.path, job.channels, sampleRate);
    written++;
  }
  onProgress?.(1, "Export complete");
  return { error: null, written };
}

function fullyCovered(start: number, end: number, ranges: Interval[]): boolean {
  return ranges.some((range) => range.start <= start && range.end >= end);
}

function overlaps(start: number, end: number, ranges: Interval[]): boolean {
  return ranges.some((range) => range.start < end && range.end > start);
}

function remapCuts(time: number, cuts: Interval[]): number {
  let shifted = time;
  for (const cut of [...cuts].sort((a, b) => a.start - b.start)) {
    if (cut.end <= time) shifted -= cut.end - cut.start;
    else if (cut.start < time) shifted -= time - cut.start;
  }
  return Math.max(0, shifted);
}

async function writeTranscriptFile({
  tracks,
  cuts,
  directory,
  marks,
  scope,
  applyEdits,
  writeText,
  fileExists,
}: {
  tracks: ExportTrack[];
  cuts: Interval[];
  directory: string;
  marks: ExportMark[];
  scope: ExportScope;
  applyEdits: boolean;
  writeText?: (path: string, contents: string) => Promise<void>;
  fileExists?: (path: string) => boolean | Promise<boolean>;
}): Promise<{ error: string | null; written: number }> {
  const jobs = planTranscriptJobs({ tracks, cuts, directory, marks, scope, applyEdits });
  if (fileExists) {
    for (const job of jobs) {
      if (await fileExists(job.path)) return { error: `${job.path} already exists.`, written: 0 };
    }
  }
  return writeTranscriptJobs(jobs, writeText);
}

function planTranscriptJobs({
  tracks,
  cuts,
  directory,
  marks,
  scope,
  applyEdits,
}: {
  tracks: ExportTrack[];
  cuts: Interval[];
  directory: string;
  marks: ExportMark[];
  scope: ExportScope;
  applyEdits: boolean;
}): { path: string; contents: string }[] {
  const stem = projectStem(tracks[0].fileName ?? "export");
  if (scope !== "clips") {
    return [
      {
        path: joinPath(directory, `${stem}-transcript.txt`),
        contents: formatExportTranscript(collectTranscriptLines(tracks, cuts, applyEdits)),
      },
    ];
  }
  const ordered = [...marks].sort((a, b) => a.start - b.start || a.end - b.end);
  const jobs: { path: string; contents: string }[] = [];
  let clipIndex = 0;
  for (const mark of ordered) {
    const lanes = tracks.filter((track, index) => mark.laneIds.includes(trackId(track, index)));
    if (lanes.length === 0) continue;
    clipIndex++;
    jobs.push({
      path: joinPath(directory, clipTranscriptFileName(stem, clipIndex)),
      contents: formatExportTranscript(
        collectTranscriptLines(lanes, cuts, applyEdits, { start: mark.start, end: mark.end }),
      ),
    });
  }
  return jobs;
}

async function writeTranscriptJobs(
  jobs: { path: string; contents: string }[],
  writeText?: (path: string, contents: string) => Promise<void>,
): Promise<{ error: string | null; written: number }> {
  if (!writeText) return { error: "Transcript export needs a text writer.", written: 0 };
  for (const job of jobs) await writeText(job.path, job.contents);
  return { error: null, written: jobs.length };
}

function collectTranscriptLines(
  tracks: ExportTrack[],
  cuts: Interval[],
  applyEdits: boolean,
  clip?: Interval,
): ExportTranscriptLine[] {
  const clipRanges = clip ? [clip] : [];
  const lines: ExportTranscriptLine[] = [];
  for (const track of tracks) {
    for (const word of track.words ?? []) {
      if (clip && !overlaps(word.start, word.end, clipRanges)) continue;
      if (applyEdits && fullyCovered(word.start, word.end, cuts)) continue;
      if (applyEdits && fullyCovered(word.start, word.end, track.muted)) continue;
      const clock = applyEdits ? remapCuts(word.start, cuts) : word.start;
      lines.push({ clock, speaker: track.speaker, text: word.text });
    }
  }
  return lines;
}
