import { adjacentMarkedRegion, fitWindow, type NavDirection } from "./audio/markerNav";
import {
  applySilenceBuffer,
  moveMarker,
  silenceRegionsFromAmplitude,
  silenceRegionsFromSpeechSegments,
  subtractInterval,
  unionInterval,
  type Marker,
  type RawMarker,
} from "./audio/silence";
import {
  keptDuration,
  keptToSource,
  sourceToKept,
  visibleSpans,
  type DisplayedInterval,
  type TimelineSpan,
  type ViewFilter,
} from "./audio/timelineMap";
import { EditHistory } from "./editHistory";
import { reconcileProjectWithDuration, type ProjectFile } from "./projectFile";
import {
  cutSuggestions,
  intersect,
  normalize,
  reconcileTrack,
  relativeSourcePath,
  subtract,
  trackSilences,
  type PodcastProject,
  type Range,
  type TrackDocument,
} from "./projectV2";
import type { TranscriptWord } from "./transcript";
import { vadDetector } from "./vadDetector";

/** How a pending timeline selection overlaps the currently marked regions. */
export type SelectionOverlap = "unmarked" | "marked" | "mixed";

/**
 * Whether playback and the waveform show the untouched recordings, or the
 * project's edits applied: shared cuts skipped and each track's own
 * marked regions silenced. Nothing is ever baked into the audio — see
 * `EditorState.timelineSpans` / `mutedIntervalsFor`.
 */
export type PreviewMode = "original" | "edited";

export type { ViewFilter };
export type { Range };

export interface SilenceSettings {
  /** Silero VAD speech-probability threshold (0-1); higher = less sensitive. */
  positiveSpeechThreshold: number;
  minSilenceMs: number;
  bufferMs: number;
  /** Loudness floor (dB) for the secondary amplitude-based detector — see `runQuietDetection`. */
  quietThresholdDb: number;
}

const DEFAULT_SETTINGS: SilenceSettings = {
  positiveSpeechThreshold: 0.5,
  minSilenceMs: 1200,
  bufferMs: 150,
  quietThresholdDb: -40,
};

/** Silero's suggested gap between the positive and negative thresholds. */
const NEGATIVE_THRESHOLD_MARGIN = 0.15;

/** The schema tolerates one or two tracks — see `parsePodcastProject`. */
export const MAX_TRACKS = 2;

/**
 * Shared merge trigger for both ways two marked regions can end up
 * overlapping: a finished drag-select whose range overlaps existing marked
 * regions (see `finishSelectionDrag`), or dragging one marked region's
 * edge into a neighbor (see `moveMarker`). Once the overlap reaches
 * this fraction of whichever region involved is shorter, it's clearly
 * intentional, so the two merge into one instead of just piling up.
 */
const AUTO_MERGE_OVERLAP_FRACTION = 0.4;

function overlapFraction(regions: RawMarker[], start: number, end: number): number {
  if (end <= start) return 0;
  let coveredSec = 0;
  for (const region of regions) {
    const overlapStart = Math.max(start, region.start);
    const overlapEnd = Math.min(end, region.end);
    if (overlapEnd > overlapStart) coveredSec += overlapEnd - overlapStart;
  }
  return coveredSec / (end - start);
}

/**
 * One loaded recording and everything scoped to it alone: its own silence
 * marks, its own detection settings and status, its own speaker name and
 * transcript. Never its own timeline — the playhead, zoom window, IN/OUT
 * and shared cuts all live on `EditorState`, so two synced tracks are
 * always looked at (and cut) together.
 */
export class TrackState {
  /** Stable within a session; also what a saved project's `workspace.activeTrackId` refers to. */
  readonly id: string;
  fileName: string | null = $state(null);
  /** Full path of this track's recording — resolved fresh on every open/relink, never assumed unchanged. Null when opened outside Tauri (e.g. tests). */
  filePath: string | null = $state(null);
  /** SHA-256 of `filePath`'s raw bytes, as last verified against disk — see `projectV2.ts`'s `reconcileTrack`. */
  sourceSha256: string | null = $state(null);
  speaker: string = $state("Speaker 1");
  audioBuffer: AudioBuffer | null = $state(null);
  monoSamples: Float32Array = $state(new Float32Array(0));

  settings: SilenceSettings = $state({ ...DEFAULT_SETTINGS });
  /** This track's silence regions — muted in place during an edited preview, never removing time. */
  rawMarkers: RawMarker[] = $state([]);

  isDetectingSilence: boolean = $state(false);
  detectionProgress: number = $state(0);
  detectionError: string | null = $state(null);

  /** Transcript content, owned here so it survives a save/reload — see `EditorState.setTranscript`. */
  transcriptWords: TranscriptWord[] = $state([]);
  transcriptStatus: "missing" | "complete" = $state("missing");

  readonly durationSec = $derived(this.audioBuffer?.duration ?? 0);
  readonly sampleRate = $derived(this.audioBuffer?.sampleRate ?? 0);
  readonly hasAudio = $derived(this.audioBuffer !== null);

  readonly markers: Marker[] = $derived.by(() => applySilenceBuffer(this.rawMarkers, this.settings.bufferMs));

  /** Markers' displayed (post-buffer) bounds — what the view filter hides/shows and the edited preview mutes. */
  readonly markedIntervals: DisplayedInterval[] = $derived.by(() =>
    this.markers.flatMap((marker) => (marker.displayed ? [marker.displayed] : [])),
  );

  constructor(id: string, speaker: string) {
    this.id = id;
    this.speaker = speaker;
  }

  load(buffer: AudioBuffer, fileName: string, monoSamples: Float32Array, filePath: string | null, sha256: string | null): void {
    this.audioBuffer = buffer;
    this.fileName = fileName;
    this.filePath = filePath;
    this.sourceSha256 = sha256;
    this.monoSamples = monoSamples;
    this.rawMarkers = [];
    this.detectionProgress = 0;
    this.detectionError = null;
    this.transcriptWords = [];
    this.transcriptStatus = "missing";
  }

  /**
   * This track as the on-disk document shape — the form `projectV2.ts`'s
   * range algebra (`trackSilences`, `cutSuggestions`) works in.
   * `rawMarkers` map onto `detected` rather than `manualSilences` because
   * `detectedSilences` is what applies `bufferMs`, and the buffered bounds
   * are exactly what this editor shows and mutes (`markedIntervals`).
   * `toProjectV2` re-shapes the same marks for storage — see there.
   */
  toDocument(projectPath = ""): TrackDocument {
    return {
      id: this.id,
      speaker: this.speaker,
      source: {
        path: this.filePath ? relativeSourcePath(projectPath, this.filePath) : "",
        name: this.fileName ?? "",
        sha256: this.sourceSha256 ?? "",
        duration: this.durationSec,
      },
      settings: { ...this.settings },
      detected: this.rawMarkers.map((r) => ({ start: r.start, end: r.end })),
      manualSilences: [],
      restored: [],
      transcript: { status: this.transcriptStatus, words: this.transcriptWords.map((w) => ({ ...w })) },
    };
  }
}

/** A track's undoable document state — see `SessionSnapshot`. */
interface TrackSnapshot {
  rawMarkers: RawMarker[];
  settings: SilenceSettings;
  speaker: string;
}

/**
 * Everything Cmd+Z / Cmd+Shift+Z walk through. Deliberately excludes the
 * loaded buffers/samples/file identity (opening or adding a recording is
 * not undoable — see `EditorState.loadAudio`/`addTrack`) and
 * `isPlaying`/VAD progress/error (transient playback/detection status,
 * not document state).
 */
interface SessionSnapshot {
  /** Positional, matching `EditorState.tracks` — tracks are never added or removed by an undoable action. */
  tracks: TrackSnapshot[];
  activeTrackId: string | null;
  cuts: Range[];
  dismissed: Range[];
  preview: PreviewMode;
  inSec: number;
  outSec: number;
  viewStartSec: number;
  viewDurationSec: number;
  viewFilter: ViewFilter;
  selectionStartSec: number | null;
  selectionEndSec: number | null;
  playheadSec: number;
  loopInOut: boolean;
}

function cloneSnapshot(snapshot: SessionSnapshot): SessionSnapshot {
  return {
    ...snapshot,
    tracks: snapshot.tracks.map((track) => ({
      rawMarkers: track.rawMarkers.map((r) => ({ ...r })),
      settings: { ...track.settings },
      speaker: track.speaker,
    })),
    cuts: snapshot.cuts.map((r) => ({ ...r })),
    dismissed: snapshot.dismissed.map((r) => ({ ...r })),
  };
}

function regionsEqual(a: { start: number; end: number }[], b: { start: number; end: number }[]): boolean {
  return a.length === b.length && a.every((r, i) => r.start === b[i].start && r.end === b[i].end);
}

function settingsEqual(a: SilenceSettings, b: SilenceSettings): boolean {
  return (
    a.positiveSpeechThreshold === b.positiveSpeechThreshold &&
    a.minSilenceMs === b.minSilenceMs &&
    a.bufferMs === b.bufferMs &&
    a.quietThresholdDb === b.quietThresholdDb
  );
}

/** Backs `EditHistory.discardIfUnchanged` — a gesture that never actually moved anything shouldn't cost an undo step. */
function snapshotsEqual(a: SessionSnapshot, b: SessionSnapshot): boolean {
  return (
    a.activeTrackId === b.activeTrackId &&
    a.preview === b.preview &&
    a.inSec === b.inSec &&
    a.outSec === b.outSec &&
    a.viewStartSec === b.viewStartSec &&
    a.viewDurationSec === b.viewDurationSec &&
    a.viewFilter === b.viewFilter &&
    a.selectionStartSec === b.selectionStartSec &&
    a.selectionEndSec === b.selectionEndSec &&
    a.playheadSec === b.playheadSec &&
    a.loopInOut === b.loopInOut &&
    regionsEqual(a.cuts, b.cuts) &&
    regionsEqual(a.dismissed, b.dismissed) &&
    a.tracks.length === b.tracks.length &&
    a.tracks.every(
      (track, i) =>
        track.speaker === b.tracks[i].speaker &&
        settingsEqual(track.settings, b.tracks[i].settings) &&
        regionsEqual(track.rawMarkers, b.tracks[i].rawMarkers),
    )
  );
}

/**
 * Single source of truth for the loaded project: one or two tracks (see
 * `TrackState`) plus everything shared between them — playback position,
 * view window, IN/OUT, and the shared cut map. UI components read/write
 * through this — none of them own state themselves.
 */
export class EditorState {
  /** One or two loaded recordings, in lane order. Empty until something is opened. */
  tracks: TrackState[] = $state([]);
  private nextTrackNumber = 1;
  /** Which lane the detect/mark controls (and the transcript panel) apply to. */
  activeTrackId: string | null = $state(null);

  /**
   * Shared cuts: time removed from *every* track at once. The only thing
   * that shortens the project, and because the same span leaves both
   * tracks together, they stay in sync.
   */
  cuts: Range[] = $state([]);
  /** Cut suggestions explicitly turned down, so they stop being re-suggested. */
  dismissed: Range[] = $state([]);

  /**
   * Full path of the project (`.hre.json`) itself — distinct from a
   * track's `filePath` since "Save As" can point it somewhere other than
   * next to the recordings. Null until the project has been saved once.
   */
  projectPath: string | null = $state(null);

  /**
   * Bumped whenever the transcript is restored by loading a project or by
   * switching lanes, so `TranscriptPanel` can seed its transcription job
   * runner exactly once per change without a reactive feedback loop
   * against its own mirrored writes.
   */
  transcriptRestoreToken: number = $state(0);

  /** Bumped on every persisted change: undo-tracked edits, undo/redo, settings, and transcript updates. Compared against `savedRevision` — see `dirty`. */
  revision: number = $state(0);
  private savedRevision: number = $state(0);
  /** Whether there is anything new to save since the last successful write. */
  readonly dirty = $derived(this.revision !== this.savedRevision);

  playheadSec: number = $state(0);
  isPlaying: boolean = $state(false);
  loopInOut: boolean = $state(false);

  /** Untouched recordings, or the project's edits applied — see `PreviewMode`. */
  preview: PreviewMode = $state("edited");

  /**
   * Visible window of the waveform, in *kept* seconds (see `timelineSpans`)
   * — equal to source seconds while nothing is cut or filtered away.
   */
  viewStartSec: number = $state(0);
  viewDurationSec: number = $state(0);

  /** Which parts of the timeline the waveform/playback show: everything, or only marked/unmarked audio. */
  viewFilter: ViewFilter = $state("all");

  inSec: number = $state(0);
  outSec: number = $state(0);

  /** Pending drag-to-select range on the waveform, in seconds. Null when nothing is selected. */
  selectionStartSec: number | null = $state(null);
  selectionEndSec: number | null = $state(null);

  /** Undo/redo over `SessionSnapshot` — see `beginEdit`/`endEdit`/`commitEdit`/`withoutHistory` below. */
  private readonly history = new EditHistory<SessionSnapshot>(cloneSnapshot);
  /**
   * >0 while a gesture-scoped transaction is open. Only the outermost
   * `beginEdit`/`endEdit` pair touches `history` — a nested `commitEdit`
   * call (e.g. `finishSelectionDrag` calling `markSelection` mid-drag)
   * joins the caller's already-open step instead of adding its own.
   */
  private transactionDepth = 0;
  /** Set by `withoutHistory` so checkpoints are skipped even if code inside it calls `commitEdit` (e.g. a future change to `setPlayhead`). */
  private historySuspended = false;

  /** The lane the mark/detect controls act on. Falls back to the first track so callers never have to null-check ordering. */
  readonly activeTrack: TrackState | null = $derived(
    this.tracks.find((t) => t.id === this.activeTrackId) ?? this.tracks[0] ?? null,
  );

  /** The project's identity track: the one whose name/path the project file is named and saved against. */
  readonly primaryTrack: TrackState | null = $derived(this.tracks[0] ?? null);

  get fileName(): string | null {
    return this.primaryTrack?.fileName ?? null;
  }
  get filePath(): string | null {
    return this.primaryTrack?.filePath ?? null;
  }
  get sourceSha256(): string | null {
    return this.primaryTrack?.sourceSha256 ?? null;
  }

  /** Active-lane shorthands, so single-track callers read the same as before two lanes existed. */
  get speaker(): string {
    return this.activeTrack?.speaker ?? "Speaker 1";
  }
  get audioBuffer(): AudioBuffer | null {
    return this.activeTrack?.audioBuffer ?? null;
  }
  get monoSamples(): Float32Array {
    return this.activeTrack?.monoSamples ?? new Float32Array(0);
  }
  get settings(): SilenceSettings {
    return this.activeTrack?.settings ?? DEFAULT_SETTINGS;
  }
  get rawMarkers(): RawMarker[] {
    return this.activeTrack?.rawMarkers ?? [];
  }
  get markers(): Marker[] {
    return this.activeTrack?.markers ?? [];
  }
  get markedIntervals(): DisplayedInterval[] {
    return this.activeTrack?.markedIntervals ?? [];
  }
  get transcriptWords(): TranscriptWord[] {
    return this.activeTrack?.transcriptWords ?? [];
  }
  get transcriptStatus(): "missing" | "complete" {
    return this.activeTrack?.transcriptStatus ?? "missing";
  }
  get isDetectingSilence(): boolean {
    return this.activeTrack?.isDetectingSilence ?? false;
  }
  get detectionProgress(): number {
    return this.activeTrack?.detectionProgress ?? 0;
  }
  get detectionError(): string | null {
    return this.activeTrack?.detectionError ?? null;
  }

  /** The project's timeline length: the longest track. A shorter track's missing tail counts as silence (see `cutSuggestions`). */
  readonly durationSec = $derived(this.tracks.reduce((longest, t) => Math.max(longest, t.durationSec), 0));
  readonly sampleRate = $derived(this.primaryTrack?.sampleRate ?? 0);
  readonly hasAudio = $derived(this.tracks.some((t) => t.hasAudio));
  readonly canAddTrack = $derived(this.hasAudio && this.tracks.length < MAX_TRACKS);

  /**
   * Source spans the shared timeline leaves out. Cuts always (they're the
   * project's edit), plus whatever the view filter collapses — computed
   * across *all* tracks so the lanes stay aligned: "hide marked" hides
   * only what every track marks as silence, "hide unmarked" keeps
   * anything at least one track marks. `original` preview hides nothing,
   * so you hear and see the untouched recordings.
   */
  readonly hiddenIntervals: Range[] = $derived.by(() => {
    if (this.preview === "original" || this.durationSec <= 0) return [];
    const marked = this.tracks.map((t) => t.markedIntervals.map((m) => ({ start: m.start, end: m.end })));
    let filtered: Range[] = [];
    if (this.viewFilter === "hideMarked" && marked.length > 0) {
      filtered = marked.reduce(intersect);
    } else if (this.viewFilter === "hideUnmarked") {
      const anyMarked = normalize(marked.flat(), this.durationSec);
      filtered = subtract([{ start: 0, end: this.durationSec }], anyMarked);
    }
    return normalize([...this.cuts, ...filtered], this.durationSec);
  });

  /** Timeline collapsed by the cuts and the view filter: alternating spans the waveform/player keep or skip. */
  readonly timelineSpans: TimelineSpan[] = $derived.by(() =>
    visibleSpans(this.durationSec, this.hiddenIntervals, "hideMarked"),
  );

  /** Length of the collapsed timeline — the "kept" seconds `viewStartSec`/`viewDurationSec` are measured in. */
  readonly displayKeptDuration: number = $derived(keptDuration(this.timelineSpans));

  /** Cut candidates: where every track is detected-silent, minus what's already accepted or dismissed. */
  readonly cutSuggestionList: Range[] = $derived.by(() =>
    this.hasAudio
      ? cutSuggestions(
          this.tracks.map((t) => t.toDocument()),
          this.durationSec,
          this.cuts,
          this.dismissed,
        )
      : [],
  );

  readonly hasSelection = $derived(this.selectionStartSec !== null && this.selectionEndSec !== null);

  /** The pending selection as an ordered range, or null when there isn't a usable one. */
  readonly selectionRange: Range | null = $derived.by(() => {
    if (this.selectionStartSec === null || this.selectionEndSec === null) return null;
    const start = Math.min(this.selectionStartSec, this.selectionEndSec);
    const end = Math.max(this.selectionStartSec, this.selectionEndSec);
    return end > start ? { start, end } : null;
  });

  /**
   * Whether the pending selection sits entirely inside the active track's
   * marked (silence) regions, entirely outside them, or straddles both —
   * drives whether SilenceControls offers Mark, Unmark, or both.
   */
  readonly selectionOverlap: SelectionOverlap | null = $derived.by(() => {
    const range = this.selectionRange;
    if (!range) return null;
    const fraction = overlapFraction(this.rawMarkers, range.start, range.end);
    if (fraction <= 0) return "unmarked";
    if (fraction >= 1) return "marked";
    return "mixed";
  });

  /** What a track actually silences during playback/export: its own marks, and nothing at all in the original preview. */
  mutedIntervalsFor(track: TrackState): DisplayedInterval[] {
    return this.preview === "original" ? [] : track.markedIntervals;
  }

  private snapshot(): SessionSnapshot {
    return {
      tracks: this.tracks.map((track) => ({
        rawMarkers: track.rawMarkers.map((r) => ({ ...r })),
        settings: { ...track.settings },
        speaker: track.speaker,
      })),
      activeTrackId: this.activeTrack?.id ?? null,
      cuts: this.cuts.map((r) => ({ ...r })),
      dismissed: this.dismissed.map((r) => ({ ...r })),
      preview: this.preview,
      inSec: this.inSec,
      outSec: this.outSec,
      viewStartSec: this.viewStartSec,
      viewDurationSec: this.viewDurationSec,
      viewFilter: this.viewFilter,
      selectionStartSec: this.selectionStartSec,
      selectionEndSec: this.selectionEndSec,
      playheadSec: this.playheadSec,
      loopInOut: this.loopInOut,
    };
  }

  private applySnapshot(snapshot: SessionSnapshot): void {
    snapshot.tracks.forEach((track, index) => {
      const target = this.tracks[index];
      if (!target) return;
      target.rawMarkers = track.rawMarkers;
      target.settings = track.settings;
      target.speaker = track.speaker;
    });
    this.activeTrackId = snapshot.activeTrackId;
    this.cuts = snapshot.cuts;
    this.dismissed = snapshot.dismissed;
    this.preview = snapshot.preview;
    this.inSec = snapshot.inSec;
    this.outSec = snapshot.outSec;
    this.viewStartSec = snapshot.viewStartSec;
    this.viewDurationSec = snapshot.viewDurationSec;
    this.viewFilter = snapshot.viewFilter;
    this.selectionStartSec = snapshot.selectionStartSec;
    this.selectionEndSec = snapshot.selectionEndSec;
    this.playheadSec = snapshot.playheadSec;
    this.loopInOut = snapshot.loopInOut;
  }

  /**
   * Open a gesture-scoped undo transaction: checkpoints the pre-gesture
   * state once, on the outermost call. Pair with `endEdit` around a
   * multi-event gesture (a pointer drag, a wheel-zoom flick) so the whole
   * gesture becomes one undo step instead of one per intermediate event —
   * see `moveMarker`/`setView`/`setSelection`/`setIn`/`setOut`/
   * `setPlayhead`, which never checkpoint on their own.
   */
  beginEdit(): void {
    if (this.transactionDepth === 0 && !this.historySuspended) {
      this.history.checkpoint(this.snapshot());
    }
    this.transactionDepth++;
  }

  /**
   * Close a transaction opened by `beginEdit`. On the outermost call,
   * drops the checkpoint again if nothing actually changed (a click that
   * never turned into a drag) so no-op gestures don't cost an undo step.
   */
  endEdit(): void {
    if (this.transactionDepth === 0) return;
    this.transactionDepth--;
    if (this.transactionDepth === 0 && !this.historySuspended) {
      const discarded = this.history.discardIfUnchanged(this.snapshot(), snapshotsEqual);
      // A discarded checkpoint means the gesture never actually moved
      // anything — same case `discardIfUnchanged` exists for — so it
      // shouldn't mark the project dirty either.
      if (!discarded) this.revision++;
    }
  }

  /** `beginEdit` / `fn` / `endEdit` for a discrete (non-drag) action — one call, one undo step. */
  commitEdit(fn: () => void): void {
    this.beginEdit();
    fn();
    this.endEdit();
  }

  /**
   * Run `fn` without recording any undo step, even if something inside
   * it calls `commitEdit` — for state changes that must never be undone:
   * the playhead ticking during playback, and restoring a just-opened
   * file (`loadAudio`/`applyProjectV2` clear the stack afterwards anyway).
   */
  withoutHistory(fn: () => void): void {
    const wasSuspended = this.historySuspended;
    this.historySuspended = true;
    try {
      fn();
    } finally {
      this.historySuspended = wasSuspended;
    }
  }

  /** Step back one undo entry, if any. No-op on an empty stack. */
  undo(): void {
    const previous = this.history.undo(this.snapshot());
    if (previous) {
      this.applySnapshot(previous);
      this.revision++;
    }
  }

  /** Step forward one redo entry, if any. No-op on an empty stack or after a fresh edit clears it. */
  redo(): void {
    const next = this.history.redo(this.snapshot());
    if (next) {
      this.applySnapshot(next);
      this.revision++;
    }
  }

  /**
   * Open a recording as a brand-new single-track project, discarding
   * whatever was loaded. `sha256` is the just-computed hash of `filePath`'s
   * raw bytes (see `hash.ts`) — callers hash before decoding, since
   * decoding is what turns those bytes into `buffer` in the first place.
   * Null in contexts that never hash (tests, audio opened outside Tauri).
   */
  loadAudio(
    buffer: AudioBuffer,
    fileName: string,
    monoSamples: Float32Array,
    filePath: string | null = null,
    sha256: string | null = null,
  ): void {
    this.nextTrackNumber = 1;
    const track = this.createTrack();
    track.load(buffer, fileName, monoSamples, filePath, sha256);
    this.tracks = [track];
    this.activeTrackId = track.id;
    this.cuts = [];
    this.dismissed = [];
    this.resetSessionState(buffer.duration);
    this.projectPath = null;
    // A freshly opened recording is a new document — Cmd+Z should never
    // reach back past it into whatever the previous take had, and there's
    // nothing yet to save.
    this.history.clear();
    this.revision = 0;
    this.savedRevision = 0;
  }

  /**
   * Add a second, already-synced recording as its own lane (same start
   * time; a different length is fine — see `cutSuggestions`). Not
   * undoable, same as `loadAudio`: it brings in audio, which no undo
   * snapshot holds. Existing marks, cuts, and dismissed suggestions all
   * survive; only the window/IN-OUT stretch if the new track is longer.
   */
  addTrack(
    buffer: AudioBuffer,
    fileName: string,
    monoSamples: Float32Array,
    filePath: string | null = null,
    sha256: string | null = null,
  ): TrackState | null {
    if (this.tracks.length >= MAX_TRACKS) return null;
    const track = this.createTrack();
    track.load(buffer, fileName, monoSamples, filePath, sha256);
    this.tracks = [...this.tracks, track];
    this.activeTrackId = track.id;
    const duration = this.durationSec;
    this.outSec = Math.max(this.outSec, duration);
    if (this.viewDurationSec <= 0) this.setView(0, duration);
    this.transcriptRestoreToken++;
    this.history.clear();
    this.revision++;
    return track;
  }

  /** Drop a lane and everything scoped to it. Shared cuts stay — they were decisions about the project, not the track. */
  removeTrack(id: string): void {
    if (this.tracks.length <= 1) return;
    const remaining = this.tracks.filter((t) => t.id !== id);
    if (remaining.length === this.tracks.length) return;
    this.tracks = remaining;
    if (this.activeTrackId === id) this.activeTrackId = remaining[0].id;
    this.transcriptRestoreToken++;
    this.history.clear();
    this.revision++;
  }

  private createTrack(): TrackState {
    const number = this.nextTrackNumber++;
    return new TrackState(`track-${number}`, `Speaker ${number}`);
  }

  /** Point the detect/mark controls (and the transcript panel) at another lane. */
  setActiveTrack(id: string): void {
    if (this.activeTrackId === id || !this.tracks.some((t) => t.id === id)) return;
    this.commitEdit(() => {
      this.activeTrackId = id;
    });
    // The panel mirrors whichever track is active, so switching lanes is a
    // transcript restore like loading a project is.
    this.transcriptRestoreToken++;
  }

  setSpeaker(track: TrackState, speaker: string): void {
    if (track.speaker === speaker) return;
    this.commitEdit(() => {
      track.speaker = speaker;
    });
  }

  private resetSessionState(durationSec: number): void {
    this.playheadSec = 0;
    this.isPlaying = false;
    this.inSec = 0;
    this.outSec = durationSec;
    this.viewFilter = "all";
    this.preview = "edited";
    this.viewStartSec = 0;
    this.viewDurationSec = durationSec;
    this.selectionStartSec = null;
    this.selectionEndSec = null;
    this.transcriptRestoreToken++;
  }

  /**
   * Snapshot of everything a project save persists — see `projectV2.ts`.
   * `projectPath` is where this snapshot is about to be (or was last)
   * written to, since each source recording's path is stored relative to
   * it (see `relativeSourcePath`) so the project stays portable if the
   * files move together.
   */
  toProjectV2(projectPath: string): PodcastProject {
    const tracks = this.tracks.map((track) => {
      const document = track.toDocument(projectPath);
      // Every silence region this editor knows about is a directly
      // editable one, so it's stored as a manual silence: `detected` would
      // be re-buffered by `trackSilences` on load, shrinking the marks the
      // user actually sees. `TrackState.toDocument` maps them the other
      // way round precisely because suggestions *do* want the buffer applied.
      return { ...document, detected: [], manualSilences: document.detected, restored: [] };
    });
    return {
      version: 2,
      name: (this.fileName ?? "Untitled").replace(/\.[^./\\]+$/, ""),
      sampleRate: this.sampleRate,
      tracks,
      cuts: this.cuts.map((r) => ({ ...r })),
      dismissed: this.dismissed.map((r) => ({ ...r })),
      workspace: {
        activeTrackId: this.activeTrack?.id ?? tracks[0]?.id ?? "track-1",
        preview: this.preview,
        tab: "transcript",
        sidebarWidth: 320,
        sidebarOpen: true,
        viewStartSec: this.viewStartSec,
        viewDurationSec: this.viewDurationSec,
        inSec: this.inSec,
        outSec: this.outSec,
        loop: this.loopInOut,
        viewFilter: this.viewFilter,
        // Marked spans are an edit now, not an optional preview duck — the
        // flag stays in the schema (and true) so older readers still see
        // the project the way it actually sounds.
        muteMarked: true,
      },
    };
  }

  /**
   * Restore marks, settings, transcripts, shared cuts, and workspace state
   * from a loaded (or just-migrated, see `applyLegacyProject`) v2 project.
   * Call after the audio is in place — `loadAudio` for the first track and
   * `addTrack` for a second — so each saved track lines up positionally
   * with the recording just decoded for it. `reconcileTrack` verifies each
   * track's saved source identity against what was actually decoded, so a
   * project saved against a since-changed file never reuses marks or
   * transcript timestamps that no longer apply to it.
   */
  applyProjectV2(project: PodcastProject, projectPath: string): void {
    project.tracks.forEach((saved, index) => {
      const track = this.tracks[index];
      if (!track) return;
      const reconciled = reconcileTrack(saved, track.durationSec, track.sourceSha256 ?? "");
      track.speaker = reconciled.speaker;
      track.settings = { ...reconciled.settings };
      track.rawMarkers = trackSilences(reconciled).map((r) => ({ start: r.start, end: r.end }));
      track.transcriptWords = reconciled.transcript.words.map((w) => ({ ...w }));
      track.transcriptStatus = reconciled.transcript.status;
    });
    this.transcriptRestoreToken++;
    this.projectPath = projectPath;

    const duration = this.durationSec;
    this.cuts = normalize(project.cuts, duration);
    this.dismissed = normalize(project.dismissed, duration);

    const w = project.workspace;
    // Saved tracks map onto loaded lanes positionally, so the active one does too.
    const activeIndex = project.tracks.findIndex((t) => t.id === w.activeTrackId);
    this.activeTrackId = (this.tracks[activeIndex] ?? this.tracks[0])?.id ?? null;
    this.preview = w.preview === "original" ? "original" : "edited";
    this.inSec = clamp(w.inSec, 0, duration);
    this.outSec = clamp(w.outSec, this.inSec, duration);
    this.loopInOut = w.loop;
    this.viewFilter = w.viewFilter;
    this.setView(w.viewStartSec, w.viewDurationSec);

    // Same reasoning as loadAudio: restoring a project is loading a document, not editing one.
    this.history.clear();
    this.revision = 0;
    this.savedRevision = 0;
  }

  /**
   * Restore marks, IN/OUT, settings, and the zoom/pan window from a
   * version-1 sidecar — the format used before `projectV2.ts`'s
   * project/track model existed. Always a single track. Call after
   * `loadAudio` — reconciles against the just-decoded duration first (see
   * `reconcileProjectWithDuration`) so a sidecar saved against a
   * since-modified file doesn't produce out-of-range marks. `setView`
   * (rather than a direct assignment) clamps the restored window to what
   * the just-loaded audio actually supports; since nothing is cut or
   * filtered at this point the "kept" and source timelines are identical,
   * so the saved seconds carry over directly. Version 1 never had a
   * speaker name, a transcript, or its own project path distinct from the
   * sidecar convention — `loadAudio`'s defaults for those stand, and
   * `toProjectV2` upgrades this project to version 2 the next time it's
   * saved.
   */
  applyLegacyProject(project: ProjectFile, projectPath: string): void {
    const track = this.tracks[0];
    if (!track) return;
    const reconciled = reconcileProjectWithDuration(project, track.durationSec);
    track.rawMarkers = reconciled.rawMarkers.map((r) => ({ start: r.start, end: r.end }));
    track.settings = { ...reconciled.settings };
    this.inSec = reconciled.inSec;
    this.outSec = reconciled.outSec;
    this.setView(reconciled.viewStartSec, reconciled.viewDurationSec);
    this.projectPath = projectPath;
    // Same reasoning as loadAudio: restoring a sidecar is loading a document, not editing one.
    this.history.clear();
    this.revision = 0;
    this.savedRevision = 0;
  }

  /** Merge a completed (or restored) transcript into the active track — see `TranscriptPanel.svelte`. */
  setTranscript(words: TranscriptWord[], status: "missing" | "complete"): void {
    const track = this.activeTrack;
    if (!track) return;
    if (track.transcriptWords === words && track.transcriptStatus === status) return;
    track.transcriptWords = words;
    track.transcriptStatus = status;
    this.revision++;
  }

  /**
   * Record that a save has durably written the project as of `revision`
   * — see `dirty`. Takes the revision explicitly (captured by the caller
   * before it started building/writing the snapshot) rather than
   * defaulting to the current one, so an edit that lands while a save is
   * still in flight stays `dirty` instead of being wrongly marked saved.
   */
  markSaved(revision: number): void {
    this.savedRevision = revision;
  }

  /**
   * Switching filters (or previews) changes what "kept seconds" means, so
   * the raw viewStartSec/viewDurationSec numbers don't carry over — but
   * the *content* you were looking at should. Translate the current
   * window to source time under the old mapping, then back to kept time
   * under the new one, so the zoom/pan you had stays put instead of
   * resetting to the full timeline every time you toggle.
   */
  private retainingView(fn: () => void): void {
    this.commitEdit(() => {
      const oldSpans = this.timelineSpans;
      const sourceStart = keptToSource(oldSpans, this.viewStartSec);
      const sourceEnd = keptToSource(oldSpans, this.viewStartSec + this.viewDurationSec);

      fn();

      const newSpans = this.timelineSpans;
      const newStart = sourceToKept(newSpans, sourceStart);
      const newDuration = sourceToKept(newSpans, sourceEnd) - newStart;

      // The viewed content collapsed entirely under the new mapping (e.g. you
      // were zoomed into a marked region and just hid marked audio) — fall
      // back to showing everything that's left visible.
      if (newDuration > 0) this.setView(newStart, newDuration);
      else this.setView(0, this.displayKeptDuration);
    });
  }

  setViewFilter(filter: ViewFilter): void {
    this.retainingView(() => {
      this.viewFilter = filter;
    });
  }

  /** Flip between hearing/seeing the untouched recordings and the edited project. */
  setPreview(preview: PreviewMode): void {
    this.retainingView(() => {
      this.preview = preview;
    });
  }

  /** Toggle the transport loop-between-IN/OUT flag as one undo step (see `Transport.svelte`). */
  setLoopInOut(loopInOut: boolean): void {
    this.commitEdit(() => {
      this.loopInOut = loopInOut;
    });
  }

  async runSilenceDetection(track: TrackState | null = this.activeTrack): Promise<void> {
    if (!track?.hasAudio || track.isDetectingSilence) return;
    track.isDetectingSilence = true;
    track.detectionProgress = 0;
    track.detectionError = null;
    // Opened before the await so the checkpoint captures the regions this
    // detection run is about to replace. Closed in `finally`, which
    // discards it as a no-op if detection failed and `rawMarkers` never
    // changed. Only this track's marks are touched — the other lane's
    // marks, the accepted cuts, and the dismissed suggestions all stand.
    this.beginEdit();
    try {
      const segments = await vadDetector.detect(
        track.monoSamples,
        track.sampleRate,
        {
          positiveSpeechThreshold: track.settings.positiveSpeechThreshold,
          negativeSpeechThreshold: Math.max(0, track.settings.positiveSpeechThreshold - NEGATIVE_THRESHOLD_MARGIN),
        },
        (fraction) => {
          track.detectionProgress = fraction;
        },
      );
      track.rawMarkers = silenceRegionsFromSpeechSegments(segments, track.durationSec, track.settings.minSilenceMs);
    } catch (err) {
      track.detectionError = err instanceof Error ? err.message : String(err);
    } finally {
      track.isDetectingSilence = false;
      this.endEdit();
    }
  }

  private updateSettings(track: TrackState | null, patch: Partial<SilenceSettings>): void {
    if (!track) return;
    track.settings = { ...track.settings, ...patch };
    this.revision++;
  }

  setPositiveSpeechThreshold(positiveSpeechThreshold: number, track: TrackState | null = this.activeTrack): void {
    this.updateSettings(track, { positiveSpeechThreshold });
  }

  setMinSilenceMs(minSilenceMs: number, track: TrackState | null = this.activeTrack): void {
    this.updateSettings(track, { minSilenceMs });
  }

  setBufferMs(bufferMs: number, track: TrackState | null = this.activeTrack): void {
    this.updateSettings(track, { bufferMs: Math.max(0, bufferMs) });
  }

  setQuietThresholdDb(quietThresholdDb: number, track: TrackState | null = this.activeTrack): void {
    this.updateSettings(track, { quietThresholdDb });
  }

  /**
   * Second, non-ML detection pass (see `silenceRegionsFromAmplitude`):
   * flags anything quieter than `settings.quietThresholdDb`, independent
   * of whether VAD thinks it's speech. Unlike `runSilenceDetection`, this
   * *adds* to whatever markers already exist — folding each newly found
   * span through `unionInterval` merges it into a touching marker rather
   * than replacing the set, so nudging the dB slider and re-running never
   * loses VAD output or manual marks. Synchronous (no model, no worker),
   * so one `commitEdit` call is enough for a single undo step.
   */
  runQuietDetection(track: TrackState | null = this.activeTrack): void {
    if (!track?.hasAudio) return;
    this.commitEdit(() => {
      const quiet = silenceRegionsFromAmplitude(
        track.monoSamples,
        track.sampleRate,
        track.settings.quietThresholdDb,
        track.settings.minSilenceMs,
      );
      track.rawMarkers = quiet.reduce((acc, r) => unionInterval(acc, r.start, r.end), track.rawMarkers);
    });
  }

  /**
   * Drag a marker; edits the underlying raw marker so the buffer slider
   * keeps working afterwards. This just tracks the cursor 1:1 — merge
   * detection happens separately, only once the drag ends (see
   * `finishMarkerDrag`). Checking on every move would let a merge get
   * undone by the very next event: the edge is recomputed straight from
   * the raw cursor position each time, so once merged, the next tiny
   * mouse move would snap the boundary back to wherever the cursor
   * happens to be, discarding the extension the merge just made.
   */
  moveMarker(track: TrackState, markerIndex: number, edge: "start" | "end", newDisplayedSec: number): void {
    const raw = track.rawMarkers[markerIndex];
    if (!raw) return;
    const clamped = clamp(newDisplayedSec, 0, track.durationSec);
    const next = [...track.rawMarkers];
    next[markerIndex] = moveMarker(raw, track.settings.bufferMs, edge, clamped);
    track.rawMarkers = next;
  }

  /**
   * Call once a marker drag ends. If the dragged marker now overlaps a
   * neighbor by more than `AUTO_MERGE_OVERLAP_FRACTION` of whichever of
   * the two is shorter, they merge into one — drag mark B's start 4 of
   * its own 10 seconds into mark A and the two become one marker, and
   * the same holds dragging A into B. Below that threshold they're left
   * overlapping as dragged, matching a manual Mark/Unmark decision
   * instead of an automatic one.
   */
  finishMarkerDrag(track: TrackState, markerIndex: number): void {
    const dragged = track.rawMarkers[markerIndex];
    if (!dragged) return;

    let merged = dragged;
    const survivors: RawMarker[] = [];
    for (let i = 0; i < track.rawMarkers.length; i++) {
      if (i === markerIndex) continue;
      const other = track.rawMarkers[i];
      const overlapStart = Math.max(merged.start, other.start);
      const overlapEnd = Math.min(merged.end, other.end);
      const overlapSec = Math.max(0, overlapEnd - overlapStart);
      const shorterLengthSec = Math.min(merged.end - merged.start, other.end - other.start);
      if (shorterLengthSec > 0 && overlapSec / shorterLengthSec >= AUTO_MERGE_OVERLAP_FRACTION) {
        merged = { start: Math.min(merged.start, other.start), end: Math.max(merged.end, other.end) };
      } else {
        survivors.push(other);
      }
    }

    if (merged === dragged) return;
    track.rawMarkers = [...survivors, merged].sort((a, b) => a.start - b.start);
  }

  /** Update the pending drag-to-select range. Order-independent; call repeatedly while dragging. */
  setSelection(startSec: number, endSec: number): void {
    this.selectionStartSec = clamp(startSec, 0, this.durationSec);
    this.selectionEndSec = clamp(endSec, 0, this.durationSec);
  }

  clearSelection(): void {
    this.selectionStartSec = null;
    this.selectionEndSec = null;
  }

  /**
   * Mark the pending selection as silence on one track, merging it into
   * any region it touches. Ignores `minSilenceMs` — a manual mark is
   * deliberate, however short. Silence never removes time, so the other
   * track and the project duration are untouched.
   */
  markSelection(track: TrackState | null = this.activeTrack): void {
    this.commitEdit(() => {
      const range = this.selectionRange;
      if (!range || !track) return;
      track.rawMarkers = unionInterval(track.rawMarkers, range.start, range.end);
      this.clearSelection();
    });
  }

  /**
   * Unmark the pending selection, trimming or splitting whatever marked
   * regions it overlaps (see `subtractInterval`).
   */
  unmarkSelection(track: TrackState | null = this.activeTrack): void {
    this.commitEdit(() => {
      const range = this.selectionRange;
      if (!range || !track) return;
      track.rawMarkers = subtractInterval(track.rawMarkers, range.start, range.end);
      this.clearSelection();
    });
  }

  /** The "m" shortcut: unmark a fully-marked selection, mark anything else. */
  toggleSelectionMark(): void {
    if (this.selectionOverlap === "marked") this.unmarkSelection();
    else if (this.selectionOverlap !== null) this.markSelection();
  }

  /**
   * Call once a drag-select gesture ends. A selection that mostly overlaps
   * existing marked regions merges into them right away — see
   * `AUTO_MERGE_OVERLAP_FRACTION` — instead of leaving a "mixed" selection
   * pending for an explicit Mark click.
   */
  finishSelectionDrag(track: TrackState | null = this.activeTrack): void {
    const range = this.selectionRange;
    if (!range || !track) return;
    const fraction = overlapFraction(track.rawMarkers, range.start, range.end);
    if (fraction >= AUTO_MERGE_OVERLAP_FRACTION && fraction < 1) this.markSelection(track);
  }

  /**
   * Remove a span of time from the whole project: the same seconds leave
   * every track at once, which is exactly why two synced recordings stay
   * synced across a cut. Reversible — see `restoreCut` and undo.
   */
  addCut(range: Range): void {
    if (range.end <= range.start) return;
    this.commitEdit(() => {
      this.cuts = normalize([...this.cuts, range], this.durationSec);
      // A cut that's been accepted has nothing left to suggest or dismiss.
      this.dismissed = subtract(this.dismissed, [range]);
    });
  }

  /** Put a cut's time back on the timeline. */
  restoreCut(range: Range): void {
    this.commitEdit(() => {
      this.cuts = subtract(this.cuts, [range]);
    });
  }

  /** Cut the pending selection out of every track — the shared counterpart to `markSelection`. */
  cutSelection(): void {
    const range = this.selectionRange;
    if (!range) return;
    this.commitEdit(() => {
      this.addCut(range);
      this.clearSelection();
    });
  }

  /** Turn a suggestion down: it stops being suggested, and nothing is removed. */
  dismissCut(range: Range): void {
    if (range.end <= range.start) return;
    this.commitEdit(() => {
      this.dismissed = normalize([...this.dismissed, range], this.durationSec);
    });
  }

  /** Take every pending suggestion in one step. */
  acceptAllCuts(): void {
    const suggestions = this.cutSuggestionList;
    if (suggestions.length === 0) return;
    this.commitEdit(() => {
      for (const suggestion of suggestions) this.addCut(suggestion);
    });
  }

  setIn(sec: number): void {
    this.inSec = clamp(sec, 0, this.outSec);
  }

  setOut(sec: number): void {
    this.outSec = clamp(sec, this.inSec, this.durationSec);
  }

  /** Set both loop bounds at once, in either order — see the cut-review audition controls. */
  setInOut(inSec: number, outSec: number): void {
    const start = clamp(Math.min(inSec, outSec), 0, this.durationSec);
    this.inSec = start;
    this.outSec = clamp(Math.max(inSec, outSec), start, this.durationSec);
  }

  setPlayhead(sec: number): void {
    this.playheadSec = clamp(sec, 0, this.durationSec);
  }

  /** `startSec`/`durationSec` are kept seconds — see `displayKeptDuration`. */
  setView(startSec: number, durationSec: number): void {
    const total = this.displayKeptDuration;
    const maxStart = Math.max(0, total - durationSec);
    this.viewStartSec = clamp(startSec, 0, maxStart);
    this.viewDurationSec = clamp(durationSec, 0, total || durationSec);
  }

  /**
   * Zoom to fit a source-time range and put the playhead at its start —
   * how a cut suggestion is auditioned. Returns the seconds the caller
   * should seek to, so the player can reschedule audio at the same time.
   */
  focusRange(range: Range, loop = true): number {
    this.commitEdit(() => {
      const view = fitWindow(range, this.durationSec);
      this.setView(sourceToKept(this.timelineSpans, view.startSec), view.durationSec);
      this.setInOut(range.start, range.end);
      this.loopInOut = loop;
    });
    return range.start;
  }

  /**
   * Jump to the next/prev marked region on the active track relative to
   * wherever the playhead is right now (see `adjacentMarkedRegion`) and
   * zoom to fit it. Forces `viewFilter` back to "all" first — under
   * `hideMarked` the target region is collapsed to zero kept width
   * (nothing to fit), and under `hideUnmarked` the padding would pull in
   * neighboring kept content unrelated to this region in source time.
   *
   * Does not move the playhead itself — that's `AudioPlayer.seek`'s job
   * (it also reschedules audio if already playing). Returns the region's
   * start for the caller to seek to, or null if there are no marked
   * regions. Callers should wrap this and the following seek in their own
   * `beginEdit`/`endEdit` so the filter reset, the zoom, and the playhead
   * move land as one undo step — see `AudioPlayer.goToAdjacentMarkedRegion`.
   */
  goToAdjacentMarkedRegion(direction: NavDirection): number | null {
    const region = adjacentMarkedRegion(this.markedIntervals, this.playheadSec, direction);
    if (!region) return null;

    this.commitEdit(() => {
      this.viewFilter = "all";
      const { startSec, durationSec } = fitWindow(region, this.durationSec);
      this.setView(sourceToKept(this.timelineSpans, startSec), durationSec);
    });
    return region.start;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const editor = new EditorState();
