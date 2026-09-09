import type { TranscriptWord } from './transcript';
import type { ProjectSettings } from './projectFile';
import type { ViewFilter } from './audio/timelineMap';
import { applySilenceBuffer, subtractInterval, unionInterval } from './audio/silence';

export interface Range { start: number; end: number }
export interface TrackDocument {
  id: string;
  speaker: string;
  source: { path: string; name: string; sha256: string; duration: number };
  settings: ProjectSettings;
  detected: Range[];
  manualSilences: Range[];
  restored: Range[];
  transcript: { status: 'missing' | 'complete'; words: TranscriptWord[] };
}
export interface Workspace {
  activeTrackId: string;
  preview: 'original' | 'edited' | 'review';
  tab: 'transcript' | 'cleanup' | 'edits';
  sidebarWidth: number;
  sidebarOpen: boolean;
  viewStartSec: number;
  viewDurationSec: number;
  inSec: number;
  outSec: number;
  loop: boolean;
  /** Which parts of the timeline the waveform/playback show — see `EditorState.viewFilter`. */
  viewFilter: ViewFilter;
  /** Duck marked audio during preview instead of hiding it — see `EditorState.muteMarked`. */
  muteMarked: boolean;
}
export interface PodcastProject {
  version: 2;
  name: string;
  sampleRate: number;
  tracks: TrackDocument[];
  cuts: Range[];
  dismissed: Range[];
  workspace: Workspace;
}
export const DEFAULT_SETTINGS: ProjectSettings = { positiveSpeechThreshold: 0.5, minSilenceMs: 1200, bufferMs: 150, quietThresholdDb: -40 };
export function normalize(ranges: Range[], duration = Infinity): Range[] {
  return ranges.reduce<Range[]>((out, r) => {
    const start = Math.max(0, r.start), end = Math.min(duration, r.end);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? unionInterval(out, start, end) : out;
  }, []);
}
export function subtract(ranges: Range[], remove: Range[]): Range[] {
  return remove.reduce((out, r) => subtractInterval(out, r.start, r.end), normalize(ranges));
}
export function intersect(a: Range[], b: Range[]): Range[] {
  const result: Range[] = []; let i = 0, j = 0;
  a = normalize(a); b = normalize(b);
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start), end = Math.min(a[i].end, b[j].end);
    if (end > start) result.push({ start, end });
    if (a[i].end < b[j].end) i++; else j++;
  }
  return result;
}
export function detectedSilences(track: TrackDocument): Range[] {
  return normalize(applySilenceBuffer(track.detected, track.settings.bufferMs).flatMap(m => m.displayed ? [m.displayed] : []), track.source.duration);
}
export function trackSilences(track: TrackDocument): Range[] {
  return normalize([...subtract(detectedSilences(track), track.restored), ...track.manualSilences], track.source.duration);
}
export function cutSuggestions(tracks: TrackDocument[], duration: number, cuts: Range[], dismissed: Range[]): Range[] {
  if (!tracks.length) return [];
  const candidates = tracks.map(t => normalize([...detectedSilences(t), ...(t.source.duration < duration ? [{ start: t.source.duration, end: duration }] : [])]));
  const common = candidates.reduce(intersect);
  const minimum = Math.max(...tracks.map(t => t.settings.minSilenceMs)) / 1000;
  return subtract(common, [...cuts, ...dismissed]).filter(r => r.end - r.start >= minimum);
}
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
function ranges(value: unknown, duration: number): Range[] {
  if (!Array.isArray(value) || value.some(r => !r || !finite(r.start) || !finite(r.end) || r.start < 0 || r.end <= r.start || r.end > duration + 1e-6)) throw new Error('Invalid project edit ranges');
  return normalize(value, duration);
}
/** Reject malformed projects before replacing the current session. No silent loss of edits. */
export function parsePodcastProject(json: string): PodcastProject {
  const p = JSON.parse(json);
  if (p?.version !== 2 || typeof p.name !== 'string' || !finite(p.sampleRate) || p.sampleRate < 8000 || p.sampleRate > 192000 || !Number.isInteger(p.sampleRate) || !Array.isArray(p.tracks) || p.tracks.length < 1 || p.tracks.length > 2) throw new Error('Invalid podcast project');
  const ids = new Set<string>();
  for (const t of p.tracks) {
    if (!t || typeof t.id !== 'string' || !t.id || ids.has(t.id) || typeof t.speaker !== 'string' || typeof t.source?.path !== 'string' || typeof t.source?.name !== 'string' || !/^[a-f0-9]{64}$/.test(t.source?.sha256) || !finite(t.source.duration) || t.source.duration <= 0) throw new Error('Invalid track source');
    ids.add(t.id);
    const s = t.settings;
    if (!s || !finite(s.positiveSpeechThreshold) || s.positiveSpeechThreshold < .1 || s.positiveSpeechThreshold > .9 || !finite(s.minSilenceMs) || s.minSilenceMs < 0 || s.minSilenceMs > 3000 || !finite(s.bufferMs) || s.bufferMs < 0 || s.bufferMs > 1000 || !finite(s.quietThresholdDb) || s.quietThresholdDb < -100 || s.quietThresholdDb > 0) throw new Error('Invalid silence settings');
    t.detected = ranges(t.detected, t.source.duration); t.manualSilences = ranges(t.manualSilences, t.source.duration); t.restored = ranges(t.restored, t.source.duration);
    if (!['missing', 'complete'].includes(t.transcript?.status) || !Array.isArray(t.transcript.words)) throw new Error('Invalid transcript');
    let last = -1;
    for (const word of t.transcript.words) {
      if (typeof word.text !== 'string' || !word.text.trim() || !finite(word.start) || !finite(word.end) || word.start < 0 || word.start < last || word.end <= word.start || word.end > t.source.duration + 1e-6) throw new Error('Invalid transcript timestamps');
      last = word.start;
    }
  }
  const duration = Math.max(...p.tracks.map((t: TrackDocument) => t.source.duration));
  p.cuts = ranges(p.cuts, duration); p.dismissed = ranges(p.dismissed, duration);
  const w = p.workspace;
  if (!w || !ids.has(w.activeTrackId) || !['original', 'edited', 'review'].includes(w.preview) || !['transcript', 'cleanup', 'edits'].includes(w.tab) || ![w.viewStartSec, w.viewDurationSec, w.inSec, w.outSec, w.sidebarWidth].every(finite) || w.inSec < 0 || w.outSec > duration || w.outSec < w.inSec || w.viewStartSec < 0 || w.viewDurationSec <= 0 || typeof w.loop !== 'boolean' || typeof w.sidebarOpen !== 'boolean' || !['all', 'hideMarked', 'hideUnmarked'].includes(w.viewFilter) || typeof w.muteMarked !== 'boolean') throw new Error('Invalid project workspace');
  w.sidebarWidth = Math.max(260, Math.min(520, w.sidebarWidth));
  return p as PodcastProject;
}

/** Build the on-disk JSON string for a project — the write-side counterpart to `parsePodcastProject`. */
export function serializePodcastProject(project: PodcastProject): string {
  return JSON.stringify(project, null, 2);
}

/**
 * Reconcile a track against the actually-decoded source: same reasoning
 * as `reconcileProjectWithDuration` in `projectFile.ts`, extended with
 * content identity. A changed `sha256` means the bytes on disk are not
 * the bytes this track's edits/transcript were made against — even if
 * the duration happens to still match — so ranges are clamped to the
 * real duration and, since word-level timestamps can never be verified
 * from the duration alone, the transcript is dropped rather than reused
 * against audio it might no longer describe. A no-op when identity and
 * duration both still match.
 */
export function reconcileTrack(track: TrackDocument, actualDuration: number, actualSha256: string): TrackDocument {
  if (track.source.sha256 === actualSha256 && track.source.duration === actualDuration) return track;
  const clamp = (r: Range[]) => normalize(r, actualDuration);
  return {
    ...track,
    source: { ...track.source, duration: actualDuration, sha256: actualSha256 },
    detected: clamp(track.detected),
    manualSilences: clamp(track.manualSilences),
    restored: clamp(track.restored),
    transcript: { status: 'missing', words: [] },
  };
}

function pathParts(path: string): string[] {
  const out: string[] = [];
  for (const part of path.replaceAll('\\', '/').split('/')) {
    if (part === '..') out.pop(); else if (part && part !== '.') out.push(part);
  }
  return out;
}
export function relativeSourcePath(projectPath: string, source: string): string {
  const a = pathParts(projectPath).slice(0, -1), b = pathParts(source);
  if (a[0]?.includes(':') && a[0] !== b[0]) return source;
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}
export function resolveSourcePath(projectPath: string, source: string): string {
  if (source.startsWith('/') || /^[A-Za-z]:[\\/]/.test(source)) return source;
  const dir = projectPath.replaceAll('\\', '/').split('/').slice(0, -1).join('/');
  return (projectPath.startsWith('/') ? '/' : '') + pathParts(`${dir}/${source}`).join('/');
}
