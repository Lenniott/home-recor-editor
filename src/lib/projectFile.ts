/**
 * Sidecar file format for saving marks and edits alongside a recording.
 * Pure serialization/validation — no Tauri, no `EditorState` — so it can
 * be unit tested and reused by both the save path (`serializeProject`)
 * and the load path (`parseProjectFile`).
 */

export interface ProjectRegion {
  start: number;
  end: number;
}

export interface ProjectSettings {
  positiveSpeechThreshold: number;
  minSilenceMs: number;
  bufferMs: number;
}

export interface ProjectFile {
  version: 1;
  audioFileName: string;
  durationSec: number;
  rawMarkers: ProjectRegion[];
  inSec: number;
  outSec: number;
  settings: ProjectSettings;
  /** Zoom/pan window, in source seconds (see `EditorState.viewStartSec`/`viewDurationSec`). */
  viewStartSec: number;
  viewDurationSec: number;
}

const CURRENT_VERSION = 1;

/** Sidecar extension, chosen to avoid colliding with an unrelated `<stem>.json`. */
const SIDECAR_SUFFIX = ".hre.json";

/**
 * Derive the sidecar path for an audio file path: same directory, same
 * stem, `.hre.json` extension. Works with both `/` and `\` separators so
 * it behaves the same on Windows and Unix paths.
 */
export function sidecarPath(audioFilePath: string): string {
  const lastSlash = Math.max(audioFilePath.lastIndexOf("/"), audioFilePath.lastIndexOf("\\"));
  const dir = lastSlash >= 0 ? audioFilePath.slice(0, lastSlash + 1) : "";
  const base = lastSlash >= 0 ? audioFilePath.slice(lastSlash + 1) : audioFilePath;
  const lastDot = base.lastIndexOf(".");
  const stem = lastDot > 0 ? base.slice(0, lastDot) : base;
  return `${dir}${stem}${SIDECAR_SUFFIX}`;
}

export interface ProjectSnapshot {
  audioFileName: string;
  durationSec: number;
  rawMarkers: ProjectRegion[];
  inSec: number;
  outSec: number;
  settings: ProjectSettings;
  viewStartSec: number;
  viewDurationSec: number;
}

/** Build the on-disk JSON string from the current editor session. */
export function serializeProject(snapshot: ProjectSnapshot): string {
  const project: ProjectFile = {
    version: CURRENT_VERSION,
    audioFileName: snapshot.audioFileName,
    durationSec: snapshot.durationSec,
    rawMarkers: snapshot.rawMarkers.map((r) => ({ start: r.start, end: r.end })),
    inSec: snapshot.inSec,
    outSec: snapshot.outSec,
    settings: { ...snapshot.settings },
    viewStartSec: snapshot.viewStartSec,
    viewDurationSec: snapshot.viewDurationSec,
  };
  return JSON.stringify(project, null, 2);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidRegion(value: unknown): value is ProjectRegion {
  if (typeof value !== "object" || value === null) return false;
  const region = value as Record<string, unknown>;
  return isFiniteNumber(region.start) && isFiniteNumber(region.end) && region.end > region.start;
}

function isValidSettings(value: unknown): value is ProjectSettings {
  if (typeof value !== "object" || value === null) return false;
  const settings = value as Record<string, unknown>;
  return (
    isFiniteNumber(settings.positiveSpeechThreshold) &&
    isFiniteNumber(settings.minSilenceMs) &&
    isFiniteNumber(settings.bufferMs)
  );
}

/**
 * Parse and validate sidecar JSON. Returns `null` for anything that
 * isn't a well-formed project file (wrong version, missing fields,
 * malformed JSON) rather than throwing — a missing or corrupt sidecar
 * should never block opening the audio itself. Invalid individual
 * regions are dropped rather than failing the whole parse.
 */
export function parseProjectFile(json: string): ProjectFile | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = raw as Record<string, unknown>;

  if (candidate.version !== CURRENT_VERSION) return null;
  if (typeof candidate.audioFileName !== "string") return null;
  if (!isFiniteNumber(candidate.durationSec)) return null;
  if (!isFiniteNumber(candidate.inSec) || !isFiniteNumber(candidate.outSec)) return null;
  if (!isFiniteNumber(candidate.viewStartSec) || !isFiniteNumber(candidate.viewDurationSec)) return null;
  if (!isValidSettings(candidate.settings)) return null;
  if (!Array.isArray(candidate.rawMarkers)) return null;

  const rawMarkers = candidate.rawMarkers.filter(isValidRegion);

  return {
    version: CURRENT_VERSION,
    audioFileName: candidate.audioFileName,
    durationSec: candidate.durationSec,
    rawMarkers,
    inSec: candidate.inSec,
    outSec: candidate.outSec,
    settings: candidate.settings,
    viewStartSec: candidate.viewStartSec,
    viewDurationSec: candidate.viewDurationSec,
  };
}

/**
 * Reconcile a loaded project against the actually-decoded duration —
 * they can disagree if the file was re-encoded or truncated since the
 * sidecar was saved. Markers entirely past the new duration are dropped,
 * partially-overlapping ones are clamped, and IN/OUT/view are clamped to
 * the valid range so a stale sidecar never crashes the load.
 */
export function reconcileProjectWithDuration(project: ProjectFile, durationSec: number): ProjectFile {
  if (project.durationSec === durationSec) return project;

  const rawMarkers = project.rawMarkers
    .filter((region) => region.start < durationSec)
    .map((region) => ({ start: region.start, end: Math.min(region.end, durationSec) }))
    .filter((region) => region.end > region.start);

  return {
    ...project,
    durationSec,
    rawMarkers,
    inSec: Math.min(Math.max(project.inSec, 0), durationSec),
    outSec: Math.min(Math.max(project.outSec, 0), durationSec),
    viewStartSec: Math.min(Math.max(project.viewStartSec, 0), durationSec),
    viewDurationSec: Math.min(Math.max(project.viewDurationSec, 0), durationSec),
  };
}
