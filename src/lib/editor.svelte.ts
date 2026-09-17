import { adjacentMarkedRegion, fitWindow, type NavDirection } from "./audio/markerNav";
import { vadDetectOptions } from "./audio/sileroThresholds";
import {
  applySilenceBuffer,
  moveMarker,
  silenceRegionsFromAmplitude,
  silenceRegionsFromSpeechSegments,
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
import { MarkerList, markersFromV2, type MarkerType, type TimelineMarker } from "./markers";
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

/** The schema tolerates one or two tracks — see `parsePodcastProject`. */
export const MAX_TRACKS = 2;

function sameTranscriptWords(a: TranscriptWord[], b: TranscriptWord[]): boolean {
  return a.length === b.length && a.every((word, i) => word.text === b[i].text && word.start === b[i].start && word.end === b[i].end);
}

/**
 * Shared merge trigger for both ways two marked regions can end up
 * overlapping: a finished drag-select whose range overlaps existing marked
 * regions (see `finishSelectionDrag`), or dragging one marked region's
 * edge into a neighbor (see `moveMarker`). Once the overlap reaches
 * this fraction of whichever region involved is shorter, it's clearly
 * intentional, so the two merge into one instead of just piling up.
 */
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

  /** Transcript content, owned here so it survives a save/reload — see `EditorState.applyTranscript`. */
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
   * This track's silence in the shape `projectV2.ts`'s range algebra
   * works in (`trackSilences`, `cutSuggestions`). `rawMarkers` map onto
   * `detected` rather than `manualSilences` because `detectedSilences` is
   * what applies `bufferMs`, and the buffered bounds are exactly what
   * this editor shows and mutes (`markedIntervals`). Carries no transcript
   * — it's recomputed whenever a mark moves, and copying words for that
   * would be pure waste; `toDocument` fills those in for saving.
   */
  readonly silenceDocument: TrackDocument = $derived.by(() => ({
    id: this.id,
    speaker: this.speaker,
    source: { path: "", name: this.fileName ?? "", sha256: this.sourceSha256 ?? "", duration: this.durationSec },
    settings: { ...this.settings },
    detected: this.rawMarkers.map((r) => ({ start: r.start, end: r.end })),
    manualSilences: [],
    restored: [],
    transcript: { status: "missing", words: [] },
  }));

  /** `silenceDocument` plus everything only a save needs: the source's relative path and the transcript. */
  toDocument(projectPath: string): TrackDocument {
    return {
      ...this.silenceDocument,
      source: {
        ...this.silenceDocument.source,
        path: this.filePath ? relativeSourcePath(projectPath, this.filePath) : "",
      },
      transcript: { status: this.transcriptStatus, words: this.transcriptWords.map((w) => ({ ...w })) },
    };
  }
}

/** A track's undoable document state — see `SessionSnapshot`. */
interface TrackSnapshot {
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
  markers: TimelineMarker[];
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
  selectionTrackIds: string[];
  selectionRanges: { trackId: string; start: number; end: number }[];
  playheadSec: number;
  loopInOut: boolean;
}

function cloneSnapshot(snapshot: SessionSnapshot): SessionSnapshot {
  return {
    ...snapshot,
    selectionTrackIds: [...snapshot.selectionTrackIds],
    selectionRanges: snapshot.selectionRanges.map(r => ({...r})),
    tracks: snapshot.tracks.map((track) => ({
      settings: { ...track.settings },
      speaker: track.speaker,
    })),
    markers: snapshot.markers.map((marker) => ({ ...marker, laneIds: [...marker.laneIds] })),
    cuts: snapshot.cuts.map((r) => ({ ...r })),
    dismissed: snapshot.dismissed.map((r) => ({ ...r })),
  };
}

function markersEqual(a: TimelineMarker[], b: TimelineMarker[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (marker, i) =>
        marker.id === b[i].id &&
        marker.type === b[i].type &&
        marker.start === b[i].start &&
        marker.end === b[i].end &&
        marker.laneIds.join() === b[i].laneIds.join(),
    )
  );
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
    a.selectionTrackIds.join() === b.selectionTrackIds.join() &&
    regionsEqual(a.selectionRanges, b.selectionRanges) &&
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
    markersEqual(a.markers, b.markers) &&
    a.tracks.length === b.tracks.length &&
    a.tracks.every(
      (track, i) =>
        track.speaker === b.tracks[i].speaker &&
        settingsEqual(track.settings, b.tracks[i].settings),
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
  preview: PreviewMode = $state("original");

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
  selectionTrackIds: string[] = $state([]);
  selectionRanges: { trackId: string; start: number; end: number }[] = $state([]);
  cutScopePreview = $state(false);
  markerAction: "silence" | "cut" = $state("silence");
  markerList = new MarkerList();
  readonly selectionTracks = $derived(this.tracks.filter(t => this.selectionTrackIds.includes(t.id)));
  readonly selectionLabel = $derived(this.selectionTracks.map(t => t.speaker).join(" + "));
  readonly detectingAny = $derived(this.tracks.some(t => t.isDetectingSilence));

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

  /**
   * Where the playhead sits on the edited timeline, with the cut time
   * taken out — what the transport counts in, against
   * `displayKeptDuration`. `playheadSec` itself stays in source time,
   * since that's what the marks, IN/OUT and transcript are expressed in.
   */
  readonly playheadKeptSec: number = $derived(sourceToKept(this.timelineSpans, this.playheadSec));

  /** Cut candidates: where every track is detected-silent, minus what's already accepted or dismissed. */
  readonly cutSuggestionList: Range[] = $derived.by(() =>
    this.hasAudio
      ? cutSuggestions(
          this.tracks.map((t) => t.silenceDocument),
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
    const fractions = this.selectionTracks.map(t => { const span = this.selectionFor(t) ?? range; return overlapFraction(t.rawMarkers, span.start, span.end); });
    const fraction = fractions.length ? fractions.reduce((a,b) => a+b, 0) / fractions.length : 0;
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
        settings: { ...track.settings },
        speaker: track.speaker,
      })),
      markers: this.markerList.all(),
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
      selectionTrackIds: [...this.selectionTrackIds],
      selectionRanges: this.selectionRanges.map(r => ({...r})),
      playheadSec: this.playheadSec,
      loopInOut: this.loopInOut,
    };
  }

  private applySnapshot(snapshot: SessionSnapshot): void {
    snapshot.tracks.forEach((track, index) => {
      const target = this.tracks[index];
      if (!target) return;
      target.settings = track.settings;
      target.speaker = track.speaker;
    });
    this.markerList = new MarkerList(this.tracks.map((track) => track.id));
    this.markerList.replace(snapshot.markers);
    this.projectMarks();
    this.activeTrackId = snapshot.activeTrackId;
    this.dismissed = snapshot.dismissed;
    this.preview = snapshot.preview;
    this.inSec = snapshot.inSec;
    this.outSec = snapshot.outSec;
    this.viewStartSec = snapshot.viewStartSec;
    this.viewDurationSec = snapshot.viewDurationSec;
    this.viewFilter = snapshot.viewFilter;
    this.selectionStartSec = snapshot.selectionStartSec;
    this.selectionEndSec = snapshot.selectionEndSec;
    this.selectionTrackIds = [...snapshot.selectionTrackIds];
    this.selectionRanges = snapshot.selectionRanges.map(r => ({...r}));
    this.playheadSec = snapshot.playheadSec;
    this.loopInOut = snapshot.loopInOut;
  }

  private projectMarks(): void {
    for (const track of this.tracks) track.rawMarkers = this.markerList.silencesOn(track.id);
    this.cuts = normalize(this.markerList.cuts(), this.durationSec);
  }

  private resetMarkerList(): void {
    this.markerList = new MarkerList(this.tracks.map((track) => track.id));
    this.projectMarks();
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
    try { fn(); } finally { this.endEdit(); }
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

  get canUndo(): boolean { void this.revision; return this.history.canUndo; }
  get canRedo(): boolean { void this.revision; return this.history.canRedo; }

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
    this.dismissed = [];
    this.resetMarkerList();
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
   * Empty session: no recordings, no project path. File → New, so the next
   * Import or Open is not stacked onto whatever was already loaded.
   */
  newProject(): void {
    this.nextTrackNumber = 1;
    this.tracks = [];
    this.activeTrackId = null;
    this.dismissed = [];
    this.resetMarkerList();
    this.resetSessionState(0);
    this.projectPath = null;
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
    if (filePath && this.tracks.some((track) => track.filePath === filePath)) return null;
    const previousDuration = this.durationSec;
    const track = this.createTrack();
    track.load(buffer, fileName, monoSamples, filePath, sha256);
    this.tracks = [...this.tracks, track];
    this.activeTrackId = track.id;
    this.markerList.setTrackIds(this.tracks.map((item) => item.id));
    this.projectMarks();
    const duration = this.durationSec;
    this.outSec = Math.max(this.outSec, duration);
    // Only stretch the view when the new track actually extends the
    // project — otherwise keep whatever pan/zoom the user already had.
    if (duration > previousDuration) this.setView(0, duration);
    this.transcriptRestoreToken++;
    this.history.clear();
    this.revision++;
    return track;
  }

  /**
   * Drop a lane and everything scoped to it. Shared cuts stay — they were
   * decisions about the project, not the track — but the removed track
   * could have been the longest one, so `durationSec` can shrink; every
   * project-level range/position that was only valid against the old
   * (longer) duration is re-clamped against the new one here, the same
   * way `applyProjectV2` clamps a freshly loaded project. Skipping this
   * would let a cut or workspace position outlive its duration and fail
   * `parsePodcastProject`'s validation on the next reload, silently
   * discarding the whole project.
   */
  removeTrack(id: string): void {
    if (this.tracks.length <= 1) return;
    const remaining = this.tracks.filter((t) => t.id !== id);
    if (remaining.length === this.tracks.length) return;
    this.tracks = remaining;
    if (this.activeTrackId === id) this.activeTrackId = remaining[0].id;
    this.transcriptRestoreToken++;

    const duration = this.durationSec;
    this.markerList.setTrackIds(remaining.map((track) => track.id));
    this.markerList.replace(
      this.markerList.all().flatMap((marker) => {
        const start = Math.max(0, marker.start);
        const end = Math.min(duration, marker.end);
        return end > start ? [{ ...marker, start, end }] : [];
      }),
    );
    this.projectMarks();
    this.dismissed = normalize(this.dismissed, duration);
    this.playheadSec = clamp(this.playheadSec, 0, duration);
    this.inSec = clamp(this.inSec, 0, duration);
    this.outSec = clamp(this.outSec, this.inSec, duration);
    this.setView(this.viewStartSec, this.viewDurationSec);

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
    this.markerAction = "silence";
    this.clearSelection();
    this.playheadSec = 0;
    this.isPlaying = false;
    this.inSec = 0;
    this.outSec = durationSec;
    this.viewFilter = "all";
    this.preview = "original";
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
      version: 3,
      name: (this.fileName ?? "Untitled").replace(/\.[^./\\]+$/, ""),
      sampleRate: this.sampleRate,
      tracks,
      cuts: this.cuts.map((r) => ({ ...r })),
      dismissed: this.dismissed.map((r) => ({ ...r })),
      markers: this.markerList.all(),
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
      track.transcriptWords = reconciled.transcript.words.map((w) => ({ ...w }));
      track.transcriptStatus = reconciled.transcript.status;
    });
    this.transcriptRestoreToken++;
    this.projectPath = projectPath;

    const duration = this.durationSec;
    const idMap = new Map(project.tracks.map((saved, index) => [saved.id, this.tracks[index]?.id]));
    const rawMarkers = project.markers ?? markersFromV2(
      project.tracks.map((track) => ({ id: track.id, manualSilences: trackSilences(track) })),
      project.cuts,
      project.tracks.map((track) => track.id),
    );
    this.markerList = new MarkerList(this.tracks.map((track) => track.id));
    this.markerList.replace(
      rawMarkers.flatMap((marker) => {
        const laneIds = [...new Set(marker.laneIds.map((id) => idMap.get(id)).filter((id): id is string => Boolean(id)))];
        const start = Math.max(0, marker.start);
        const end = Math.min(duration, marker.end);
        if (!laneIds.length || end <= start) return [];
        return [{ ...marker, start, end, laneIds: marker.type === "cut" ? this.tracks.map((track) => track.id) : laneIds }];
      }),
    );
    this.projectMarks();
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
   * `toProjectV2` upgrades this project to version 3 the next time it's
   * saved.
   */
  applyLegacyProject(project: ProjectFile, projectPath: string): void {
    const track = this.tracks[0];
    if (!track) return;
    const reconciled = reconcileProjectWithDuration(project, track.durationSec);
    track.settings = { ...reconciled.settings };
    this.markerList = new MarkerList([track.id]);
    for (const range of reconciled.rawMarkers) this.markerList.add("silence", range.start, range.end, [track.id]);
    this.projectMarks();
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
    this.applyTranscript(track.id, words, status);
  }

  /**
   * Attach words to the track that started the job, even if another lane
   * is active. The panel calls this seam instead of writing track fields.
   */
  applyTranscript(trackId: string, words: TranscriptWord[], status: "missing" | "complete"): void {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track) return;
    if (track.transcriptStatus === status && sameTranscriptWords(track.transcriptWords, words)) return;
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

  /** Toggle the transport loop-between-IN/OUT flag as one undo step. */
  setLoopInOut(loopInOut: boolean): void {
    this.commitEdit(() => {
      this.loopInOut = loopInOut;
    });
  }

  async detectAllTracks(): Promise<void> {
    if (this.detectingAny) return;
    const tracks = [...this.tracks];
    for (const track of tracks) {
      if (!this.tracks.includes(track)) break;
      await this.runSilenceDetection(track);
    }
  }

  detectQuietAllTracks(): void {
    this.commitEdit(() => { for (const track of this.tracks) this.runQuietDetection(track); });
  }

  async runSilenceDetection(track: TrackState | null = this.activeTrack): Promise<void> {
    if (!track?.hasAudio || track.isDetectingSilence) return;
    track.isDetectingSilence = true;
    track.detectionProgress = 0;
    track.detectionError = null;
    // Commit only completed results; leave edits made during analysis intact.
    const audio = track.audioBuffer;
    try {
      const segments = await vadDetector.detect(
        track.monoSamples,
        track.sampleRate,
        vadDetectOptions(track.settings.positiveSpeechThreshold),
        (fraction) => {
          track.detectionProgress = fraction;
        },
      );
      if (!this.tracks.includes(track) || track.audioBuffer !== audio) return;
      this.commitEdit(() => {
        for (const range of [
          ...silenceRegionsFromSpeechSegments(segments, track.durationSec, track.settings.minSilenceMs),
          ...silenceRegionsFromAmplitude(track.monoSamples, track.sampleRate, track.settings.quietThresholdDb, track.settings.minSilenceMs),
        ])
          this.markerList.add("silence", range.start, range.end, [track.id]);
        this.projectMarks();
      });
    } catch (err) {
      track.detectionError = err instanceof Error ? err.message : String(err);
    } finally {
      track.isDetectingSilence = false;
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
      for (const range of quiet) this.markerList.add("silence", range.start, range.end, [track.id]);
      this.projectMarks();
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
    const mark = this.silenceMarkAt(track, markerIndex);
    if (!mark) return;
    const clamped = clamp(newDisplayedSec, 0, track.durationSec);
    const moved = moveMarker({ start: mark.start, end: mark.end }, track.settings.bufferMs, edge, clamped);
    this.markerList.resize(mark.id, "start", moved.start);
    this.markerList.resize(mark.id, "end", moved.end);
    this.projectMarks();
  }

  /**
   * Call once a marker drag ends. Neighbors that overlap past the shared
   * merge fraction become one marker — see `mergeOverlappingMarkers`.
   * Below that threshold they stay as dragged. Select-drag never uses this.
   */
  finishMarkerDrag(track: TrackState, _markerIndex: number): void {
    this.markerList.mergeOverlapping();
    this.projectMarks();
  }

  private silenceMarkAt(track: TrackState, index: number): TimelineMarker | undefined {
    return this.markerList.all().filter((marker) => marker.type === "silence" && marker.laneIds.includes(track.id)).sort((a, b) => a.start - b.start)[index];
  }

  /** Update the pending drag-to-select range. Order-independent; call repeatedly while dragging. */
  setSelection(startSec: number, endSec: number, trackIds: string[] = this.activeTrack ? [this.activeTrack.id] : []): void {
    this.cutScopePreview = this.markerAction === "cut";
    this.selectionTrackIds = [...trackIds];
    this.selectionStartSec = clamp(startSec, 0, this.durationSec);
    this.selectionEndSec = clamp(endSec, 0, this.durationSec);
    this.selectionRanges = trackIds.map(trackId => ({trackId, start: Math.min(this.selectionStartSec!, this.selectionEndSec!), end: Math.max(this.selectionStartSec!, this.selectionEndSec!)}));
  }

  selectTranscriptWords(words: (TranscriptWord & {trackId: string})[]): void {
    if (!words.length) return;
    const ranges = new Map<string, {trackId:string;start:number;end:number}>();
    for (const word of words) {
      const current = ranges.get(word.trackId);
      ranges.set(word.trackId, {trackId: word.trackId, start: Math.min(current?.start ?? Infinity, word.start), end: Math.max(current?.end ?? 0, word.end)});
    }
    const selected = [...ranges.values()];
    this.setSelection(Math.min(...selected.map(r => r.start)), Math.max(...selected.map(r => r.end)), [...ranges.keys()]);
    this.selectionRanges = selected;
  }

  selectionFor(track: TrackState): Range | null {
    return this.hasSelection ? this.selectionRanges.find(r => r.trackId === track.id) ?? null : null;
  }

  clearSelection(): void {
    this.selectionTrackIds = [];
    this.selectionRanges = [];
    this.cutScopePreview = false;
    this.selectionStartSec = null;
    this.selectionEndSec = null;
  }

  /**
   * Mark the pending selection as silence on one track, merging it into
   * any region it touches. Ignores `minSilenceMs` — a manual mark is
   * deliberate, however short. Silence never removes time, so the other
   * track and the project duration are untouched.
   */
  markSelection(track: TrackState | null = null): void {
    this.commitEdit(() => {
      const range = this.selectionRange;
      if (!range) return;
      const targets = track ? [track] : this.selectionTracks;
      const groups = new Map<string, { start: number; end: number; laneIds: string[] }>();
      for (const target of targets) {
        const span = track ? range : this.selectionFor(target);
        if (!span) continue;
        const key = `${span.start}:${span.end}`;
        const group = groups.get(key);
        if (group) group.laneIds.push(target.id);
        else groups.set(key, { start: span.start, end: span.end, laneIds: [target.id] });
      }
      for (const group of groups.values()) this.markerList.add("silence", group.start, group.end, group.laneIds);
      this.projectMarks();
      this.clearSelection();
    });
  }

  /**
   * Unmark the pending selection, trimming or splitting whatever marked
   * regions it overlaps (see `subtractInterval`).
   */
  unmarkSelection(track: TrackState | null = null): void {
    this.commitEdit(() => {
      const range = this.selectionRange;
      if (!range) return;
      for (const target of track ? [track] : this.selectionTracks) {
        const span = track ? range : this.selectionFor(target);
        if (span) this.markerList.subtract("silence", span.start, span.end, [target.id]);
      }
      this.projectMarks();
      this.clearSelection();
    });
  }

  readonly actionOverlap: SelectionOverlap | null = $derived.by(() => {
    if (this.markerAction === "silence") return this.selectionOverlap;
    const range = this.selectionRange;
    if (!range) return null;
    const fraction = overlapFraction(this.cuts, range.start, range.end);
    return fraction <= 0 ? "unmarked" : fraction >= 1 ? "marked" : "mixed";
  });

  markAction(): void {
    if (this.markerAction === "silence") this.markSelection();
    else this.cutSelection();
  }

  unmarkAction(): void {
    if (this.markerAction === "silence") this.unmarkSelection();
    else {
      const range = this.selectionRange;
      if (!range) return;
      this.commitEdit(() => { this.restoreCut(range); this.clearSelection(); });
    }
  }

  setType(id: string, type: MarkerType): void {
    this.commitEdit(() => {
      this.markerList.setType(id, type);
      this.projectMarks();
    });
  }

  /** M uses the selected marker action; a fully marked range is unmarked. */
  toggleSelectionMark(): void {
    if (this.actionOverlap === "marked") this.unmarkAction();
    else if (this.actionOverlap !== null) this.markAction();
  }

  moveCut(index: number, edge: "start" | "end", sec: number): void {
    const mark = this.markerList.all().filter((marker) => marker.type === "cut").sort((a, b) => a.start - b.start)[index];
    if (!mark) return;
    const value = clamp(sec, edge === "end" ? mark.start + .001 : 0, edge === "start" ? mark.end - .001 : this.durationSec);
    this.markerList.resize(mark.id, edge, value);
    this.projectMarks();
  }

  finishCutDrag(): void {
    this.markerList.mergeOverlapping();
    this.projectMarks();
  }

  /** Completing a drag only selects; marking is always explicit. */
  finishSelectionDrag(_track: TrackState | null = this.activeTrack): void {
    // Selection never applies edits; use the explicit marking actions.
  }

  /**
   * Remove a span of time from the whole project: the same seconds leave
   * every track at once, which is exactly why two synced recordings stay
   * synced across a cut. Reversible — see `restoreCut` and undo.
   */
  addCut(range: Range): void {
    if (range.end <= range.start) return;
    this.commitEdit(() => {
      this.setPreview("original");
      this.setViewFilter("all");
      this.markerList.add("cut", range.start, range.end, this.tracks.map((track) => track.id));
      this.projectMarks();
      // A cut that's been accepted has nothing left to suggest or dismiss.
      this.dismissed = subtract(this.dismissed, [range]);
    });
  }

  /** Put a cut's time back on the timeline. */
  restoreCut(range: Range): void {
    this.commitEdit(() => {
      this.markerList.subtract("cut", range.start, range.end, this.tracks.map((track) => track.id));
      this.projectMarks();
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

  zoomView(factor: number, anchorKept = this.viewStartSec + this.viewDurationSec / 2, ratio = .5): void {
    if (!this.hasAudio) return;
    const duration = clamp(this.viewDurationSec * factor, Math.min(.2, this.displayKeptDuration), this.displayKeptDuration);
    this.setView(anchorKept - ratio * duration, duration);
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
