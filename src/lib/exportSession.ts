/**
 * Export session seam: staging, naming, and writes. The page picks a
 * destination then calls `runExport`; tests inject writeWav.
 */
import {
  alignRenders,
  combineRenders,
  frameCount,
  padToFrames,
  renderForExport,
} from "./audio/exportMix";
import { mixFileName, joinPath, projectStem, separateTrackFileNames } from "./exportNames";

export type ExportMode = "separate" | "mix" | "both" | "recording";

export type ExportTrack = {
  channels: Float32Array[];
  sampleRate: number;
  speaker: string;
  muted: { start: number; end: number }[];
  fileName?: string | null;
};

export async function runExport({
  mode,
  tracks,
  cuts,
  directory,
  writeWav,
  onProgress,
}: {
  mode: ExportMode;
  tracks: ExportTrack[];
  cuts: { start: number; end: number }[];
  directory: string;
  writeWav: (path: string, channels: Float32Array[], sampleRate: number) => Promise<void>;
  onProgress?: (progress: number, stage: string) => void;
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

  const stem = projectStem(tracks[0].fileName ?? "export");
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

  let written = 0;
  if (mode === "recording") {
    const name = `${stem}-edited.wav`;
    onProgress?.(0.8, `Writing ${name}`);
    await writeWav(joinPath(directory, name), renders[0], sampleRate);
    onProgress?.(1, "Export complete");
    return { error: null, written: 1 };
  }

  if (mode !== "mix") {
    const names = separateTrackFileNames(
      stem,
      tracks.map((track) => track.speaker),
    );
    for (const [index, name] of names.entries()) {
      onProgress?.(0.5 + (0.4 * written) / tracks.length, `Writing ${name}`);
      await writeWav(joinPath(directory, name), renders[index], sampleRate);
      written++;
    }
  }
  if (mode !== "separate") {
    const name = mixFileName(stem);
    onProgress?.(0.9, "Mixing and writing combined WAV");
    await writeWav(joinPath(directory, name), combineRenders(renders), sampleRate);
    written++;
  }
  onProgress?.(1, "Export complete");
  return { error: null, written };
}
