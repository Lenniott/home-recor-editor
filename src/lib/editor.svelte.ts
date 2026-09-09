import { removeMarked, silenceMarked } from "./audio/applyEdits";
import { mixToMono } from "./audio/decode";
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
import { reconcileTrack, relativeSourcePath, trackSilences, type PodcastProject } from "./projectV2";
import type { TranscriptWord } from "./transcript";
import { vadDetector } from "./vadDetector";

/** How a pending timeline selection overlaps the currently marked regions. */
export type SelectionOverlap = "unmarked" | "marked" | "mixed";

export type { ViewFilter };

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
 * Everything Cmd+Z / Cmd+Shift+Z walk through. Deliberately excludes the
 * loaded `audioBuffer`/`monoSamples`/`fileName`/`filePath` (opening a
 * recording is not undoable — see `EditorState.loadAudio`) and
 * `isPlaying`/VAD progress/error (transient playback/detection status,
 * not document state).
 */
interface SessionSnapshot {
  rawMarkers: RawMarker[];
  inSec: number;
  outSec: number;
  settings: SilenceSettings;
  viewStartSec: number;
  viewDurationSec: number;
  viewFilter: ViewFilter;
  muteMarked: boolean;
  selectionStartSec: number | null;
  selectionEndSec: number | null;
  playheadSec: number;
  loopInOut: boolean;
}

function cloneSnapshot(snapshot: SessionSnapshot): SessionSnapshot {
  return {
    ...snapshot,
    rawMarkers: snapshot.rawMarkers.map((r) => ({ ...r })),
    settings: { ...snapshot.settings },
  };
}

function regionsEqual(a: RawMarker[], b: RawMarker[]): boolean {
  return a.length === b.length && a.every((r, i) => r.start === b[i].start && r.end === b[i].end);
}

/** Backs `EditHistory.discardIfUnchanged` — a gesture that never actually moved anything shouldn't cost an undo step. */
function snapshotsEqual(a: SessionSnapshot, b: SessionSnapshot): boolean {
  return (
    a.inSec === b.inSec &&
    a.outSec === b.outSec &&
    a.viewStartSec === b.viewStartSec &&
    a.viewDurationSec === b.viewDurationSec &&
    a.viewFilter === b.viewFilter &&
    a.muteMarked === b.muteMarked &&
    a.selectionStartSec === b.selectionStartSec &&
    a.selectionEndSec === b.selectionEndSec &&
    a.playheadSec === b.playheadSec &&
    a.loopInOut === b.loopInOut &&
    a.settings.positiveSpeechThreshold === b.settings.positiveSpeechThreshold &&
    a.settings.minSilenceMs === b.settings.minSilenceMs &&
    a.settings.bufferMs === b.settings.bufferMs &&
    a.settings.quietThresholdDb === b.settings.quietThresholdDb &&
    regionsEqual(a.rawMarkers, b.rawMarkers)
  );
}

/**
 * Single source of truth for the loaded take and everything derived from
 * it: playback position, view window, silence regions, and the IN/OUT
 * markers. UI components read/write through this — none of them own
 * state themselves.
 */
export class EditorState {
  fileName: string | null = $state(null);
  /** Full path of the opened recording (the audio itself) — resolved fresh on every open/relink, never assumed unchanged. Null when opened outside Tauri (e.g. tests). */
  filePath: string | null = $state(null);
  /**
   * Full path of the project (`.hre.json`) itself — distinct from
   * `filePath` since "Save As" can point it somewhere other than next to
   * the recording. Null until the project has been saved once (see
   * `dirty`/`markSaved` and `+page.svelte`'s save/autosave flow).
   */
  projectPath: string | null = $state(null);
  /** SHA-256 of `filePath`'s raw bytes, as last verified against disk — see `projectV2.ts`'s `reconcileTrack`. Null until computed (only known once a file has actually been read). */
  sourceSha256: string | null = $state(null);
  /** No speaker-naming UI yet (single-lane editor) — persisted so a future two-track workspace has somewhere to read/write it. */
  speaker: string = $state("Speaker 1");
  audioBuffer: AudioBuffer | null = $state(null);
  monoSamples: Float32Array = $state(new Float32Array(0));

  /** Transcript content, owned here so it survives a save/reload — the actual transcription job lives in `Transcription` (see `transcription.svelte.ts`), which mirrors its completed results in via `setTranscript` and seeds itself from these on load via `transcriptRestoreToken`. */
  transcriptWords: TranscriptWord[] = $state([]);
  transcriptStatus: "missing" | "complete" = $state("missing");
  /** Bumped whenever transcriptWords/transcriptStatus are set by loading a project, so `TranscriptPanel` can seed its transcription job runner exactly once per load without a reactive feedback loop against its own mirrored writes. */
  transcriptRestoreToken: number = $state(0);

  /** Bumped on every persisted change: undo-tracked edits, undo/redo, settings, and transcript updates. Compared against `savedRevision` — see `dirty`. */
  revision: number = $state(0);
  private savedRevision: number = $state(0);
  /** Whether there is anything new to save since the last successful write. */
  readonly dirty = $derived(this.revision !== this.savedRevision);

  playheadSec: number = $state(0);
  isPlaying: boolean = $state(false);
  loopInOut: boolean = $state(false);

  /**
   * Visible window of the waveform, in *kept* seconds (see `timelineSpans`)
   * — equal to source seconds while `viewFilter` is "all".
   */
  viewStartSec: number = $state(0);
  viewDurationSec: number = $state(0);

  /** Which parts of the timeline the waveform/playback show: everything, or only marked/unmarked audio. */
  viewFilter: ViewFilter = $state("all");
  /** Duck marked audio with a 100ms fade so you can preview the cut without hiding anything. */
  muteMarked: boolean = $state(false);

  settings: SilenceSettings = $state({ ...DEFAULT_SETTINGS });
  rawMarkers: RawMarker[] = $state([]);
  isDetectingSilence: boolean = $state(false);
  detectionProgress: number = $state(0);
  detectionError: string | null = $state(null);

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

  readonly durationSec = $derived(this.audioBuffer?.duration ?? 0);
  readonly sampleRate = $derived(this.audioBuffer?.sampleRate ?? 0);
  readonly hasAudio = $derived(this.audioBuffer !== null);

  readonly markers: Marker[] = $derived.by(() =>
    applySilenceBuffer(this.rawMarkers, this.settings.bufferMs),
  );

  /** Markers' displayed (post-buffer) bounds — what the view filter hides/shows and mute ducks. */
  readonly markedIntervals: DisplayedInterval[] = $derived.by(() =>
    this.markers.flatMap((marker) => (marker.displayed ? [marker.displayed] : [])),
  );

  /** Timeline collapsed by `viewFilter`: alternating spans the waveform/player keep or skip. */
  readonly timelineSpans: TimelineSpan[] = $derived.by(() =>
    visibleSpans(this.durationSec, this.markedIntervals, this.viewFilter),
  );

  /** Length of the collapsed timeline — the "kept" seconds `viewStartSec`/`viewDurationSec` are measured in. */
  readonly displayKeptDuration: number = $derived(keptDuration(this.timelineSpans));

  readonly hasSelection = $derived(this.selectionStartSec !== null && this.selectionEndSec !== null);

  /**
   * Whether the pending selection sits entirely inside marked (silence)
   * regions, entirely outside them, or straddles both — drives whether
   * SilenceControls offers Mark, Unmark, or both.
   */
  readonly selectionOverlap: SelectionOverlap | null = $derived.by(() => {
    if (this.selectionStartSec === null || this.selectionEndSec === null) return null;
    const start = Math.min(this.selectionStartSec, this.selectionEndSec);
    const end = Math.max(this.selectionStartSec, this.selectionEndSec);
    if (end <= start) return null;

    const fraction = overlapFraction(this.rawMarkers, start, end);
    if (fraction <= 0) return "unmarked";
    if (fraction >= 1) return "marked";
    return "mixed";
  });

  private snapshot(): SessionSnapshot {
    return {
      rawMarkers: this.rawMarkers.map((r) => ({ ...r })),
      inSec: this.inSec,
      outSec: this.outSec,
      settings: { ...this.settings },
      viewStartSec: this.viewStartSec,
      viewDurationSec: this.viewDurationSec,
      viewFilter: this.viewFilter,
      muteMarked: this.muteMarked,
      selectionStartSec: this.selectionStartSec,
      selectionEndSec: this.selectionEndSec,
      playheadSec: this.playheadSec,
      loopInOut: this.loopInOut,
    };
  }

  private applySnapshot(snapshot: SessionSnapshot): void {
    this.rawMarkers = snapshot.rawMarkers;
    this.inSec = snapshot.inSec;
    this.outSec = snapshot.outSec;
    this.settings = snapshot.settings;
    this.viewStartSec = snapshot.viewStartSec;
    this.viewDurationSec = snapshot.viewDurationSec;
    this.viewFilter = snapshot.viewFilter;
    this.muteMarked = snapshot.muteMarked;
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
   * `sha256` is the just-computed hash of `filePath`'s raw bytes (see
   * `hash.ts`) — callers hash before decoding, since decoding is what
   * turns those bytes into `buffer` in the first place. Null in contexts
   * that never hash (tests, audio opened outside Tauri).
   */
  loadAudio(
    buffer: AudioBuffer,
    fileName: string,
    monoSamples: Float32Array,
    filePath: string | null = null,
    sha256: string | null = null,
  ): void {
    this.audioBuffer = buffer;
    this.fileName = fileName;
    this.filePath = filePath;
    this.sourceSha256 = sha256;
    this.monoSamples = monoSamples;
    this.resetSessionState(buffer.duration);
    this.speaker = "Speaker 1";
    this.projectPath = null;
    // A freshly opened recording is a new document — Cmd+Z should never
    // reach back past it into whatever the previous take had, and there's
    // nothing yet to save.
    this.history.clear();
    this.revision = 0;
    this.savedRevision = 0;
  }

  /**
   * Swap the loaded take for a rewritten buffer — where `applySilenceMarked`
   * and `applyRemoveMarked` land once they've baked their edit into new
   * PCM. Keeps `fileName`/`filePath`/`projectPath`/`speaker`/`sourceSha256`
   * (still the same recording and the same save destination — baking an
   * edit never touches the file on disk at `filePath`, only Export does,
   * to a destination the user picks separately, so the hash of that file
   * is unaffected), but otherwise resets like `loadAudio`: a rewritten
   * buffer invalidates the marks, IN/OUT, transcript, and view/filter
   * state built against the old one, and there's no undo across the
   * rewrite (see those methods). Marks the project dirty — a bake is a
   * real edit that autosave should pick up.
   */
  replaceAudio(buffer: AudioBuffer, monoSamples: Float32Array): void {
    this.audioBuffer = buffer;
    this.monoSamples = monoSamples;
    this.resetSessionState(buffer.duration);
    this.history.clear();
    this.revision++;
  }

  private resetSessionState(durationSec: number): void {
    this.playheadSec = 0;
    this.isPlaying = false;
    this.rawMarkers = [];
    this.detectionProgress = 0;
    this.detectionError = null;
    this.inSec = 0;
    this.outSec = durationSec;
    this.viewFilter = "all";
    this.muteMarked = false;
    this.viewStartSec = 0;
    this.viewDurationSec = durationSec;
    this.selectionStartSec = null;
    this.selectionEndSec = null;
    this.transcriptWords = [];
    this.transcriptStatus = "missing";
    this.transcriptRestoreToken++;
  }

  /**
   * Bake "Mute marked" into the buffer: zero every marked span with a
   * 100ms edge fade, same duration in and out (see
   * `applyEdits.silenceMarked`). No-op without audio or a displayed
   * marked region. No undo — an hour-long stereo take is already ~1GB in
   * RAM, too much to keep a spare copy around for; re-open the file to
   * revert.
   */
  applySilenceMarked(): void {
    if (!this.hasAudio || this.markedIntervals.length === 0) return;
    this.rewriteBuffer((channels) => silenceMarked(channels, this.sampleRate, this.markedIntervals));
  }

  /**
   * Bake "Hide marked" into the buffer: concatenate the kept spans,
   * fading each join so the splice doesn't click — duration shortens (see
   * `applyEdits.removeMarked`). No-op without audio or a displayed marked
   * region; throws if every region is marked, since nothing would remain.
   */
  applyRemoveMarked(): void {
    if (!this.hasAudio || this.markedIntervals.length === 0) return;
    this.rewriteBuffer((channels) => removeMarked(channels, this.sampleRate, this.markedIntervals));
  }

  /** Copy the current buffer's channels out (never mutate the live buffer in place), run `edit`, and swap in the result via `replaceAudio`. */
  private rewriteBuffer(edit: (channels: Float32Array[]) => Float32Array[]): void {
    const source = this.audioBuffer;
    if (!source) return;
    const channels = Array.from({ length: source.numberOfChannels }, (_, i) => source.getChannelData(i).slice());
    const edited = edit(channels);
    const buffer = new AudioBuffer({
      numberOfChannels: edited.length,
      length: edited[0]?.length ?? 0,
      sampleRate: source.sampleRate,
    });
    edited.forEach((data, i) => buffer.copyToChannel(data, i));
    this.replaceAudio(buffer, mixToMono(buffer));
  }

  /**
   * Snapshot of everything a project save persists — see `projectV2.ts`.
   * `projectPath` is where this snapshot is about to be (or was last)
   * written to, since the source recording's path is stored relative to
   * it (see `relativeSourcePath`) so the project stays portable if the
   * pair of files move together.
   */
  toProjectV2(projectPath: string): PodcastProject {
    const id = "track-1";
    return {
      version: 2,
      name: (this.fileName ?? "Untitled").replace(/\.[^./\\]+$/, ""),
      sampleRate: this.sampleRate,
      tracks: [
        {
          id,
          speaker: this.speaker,
          source: {
            path: this.filePath ? relativeSourcePath(projectPath, this.filePath) : "",
            name: this.fileName ?? "",
            sha256: this.sourceSha256 ?? "",
            duration: this.durationSec,
          },
          settings: { ...this.settings },
          // Every silence region this editor knows about is folded into
          // manualSilences — see `applyProjectV2`/`trackSilences`. There's
          // no detected-vs-manual distinction in the single-lane editor
          // yet, so re-detecting and re-buffering `detected` separately
          // would just duplicate what's already here.
          detected: [],
          manualSilences: this.rawMarkers.map((r) => ({ start: r.start, end: r.end })),
          restored: [],
          transcript: { status: this.transcriptStatus, words: this.transcriptWords.map((w) => ({ ...w })) },
        },
      ],
      cuts: [],
      dismissed: [],
      workspace: {
        activeTrackId: id,
        preview: "edited",
        tab: "transcript",
        sidebarWidth: 320,
        sidebarOpen: true,
        viewStartSec: this.viewStartSec,
        viewDurationSec: this.viewDurationSec,
        inSec: this.inSec,
        outSec: this.outSec,
        loop: this.loopInOut,
        viewFilter: this.viewFilter,
        muteMarked: this.muteMarked,
      },
    };
  }

  /**
   * Restore a track's marks, settings, transcript, and workspace state
   * from a loaded (or just-migrated, see `applyLegacyProject`) v2
   * project. Call after `loadAudio` — `reconcileTrack` verifies the
   * track's saved source identity against what was actually just decoded
   * (`sourceSha256`/`durationSec`) first, so a project saved against a
   * since-changed file never reuses marks or transcript timestamps that
   * no longer apply to it.
   */
  applyProjectV2(project: PodcastProject, projectPath: string): void {
    const track = project.tracks.find((t) => t.id === project.workspace.activeTrackId) ?? project.tracks[0];
    const reconciled = reconcileTrack(track, this.durationSec, this.sourceSha256 ?? "");
    this.speaker = reconciled.speaker;
    this.settings = { ...reconciled.settings };
    this.rawMarkers = trackSilences(reconciled).map((r) => ({ start: r.start, end: r.end }));
    this.transcriptWords = reconciled.transcript.words.map((w) => ({ ...w }));
    this.transcriptStatus = reconciled.transcript.status;
    this.transcriptRestoreToken++;
    this.projectPath = projectPath;

    const w = project.workspace;
    this.inSec = clamp(w.inSec, 0, this.durationSec);
    this.outSec = clamp(w.outSec, this.inSec, this.durationSec);
    this.loopInOut = w.loop;
    this.viewFilter = w.viewFilter;
    this.muteMarked = w.muteMarked;
    this.setView(w.viewStartSec, w.viewDurationSec);

    // Same reasoning as loadAudio: restoring a project is loading a document, not editing one.
    this.history.clear();
    this.revision = 0;
    this.savedRevision = 0;
  }

  /**
   * Restore marks, IN/OUT, settings, and the zoom/pan window from a
   * version-1 sidecar — the format used before `projectV2.ts`'s
   * project/track model existed. Call after `loadAudio` — reconciles
   * against the just-decoded duration first (see
   * `reconcileProjectWithDuration`) so a sidecar saved against a
   * since-modified file doesn't produce out-of-range marks. `setView`
   * (rather than a direct assignment) clamps the restored window to what
   * the just-loaded audio actually supports, since `viewFilter` is still
   * "all" at this point (reset by `loadAudio`) the "kept" and source
   * timelines are identical, so the saved seconds carry over directly.
   * Version 1 never had a speaker name, a transcript, or its own project
   * path distinct from the sidecar convention — `loadAudio`'s defaults
   * for those stand, and `toProjectV2` upgrades this project to version 2
   * the next time it's saved.
   */
  applyLegacyProject(project: ProjectFile, projectPath: string): void {
    const reconciled = reconcileProjectWithDuration(project, this.durationSec);
    this.rawMarkers = reconciled.rawMarkers.map((r) => ({ start: r.start, end: r.end }));
    this.inSec = reconciled.inSec;
    this.outSec = reconciled.outSec;
    this.settings = { ...reconciled.settings };
    this.setView(reconciled.viewStartSec, reconciled.viewDurationSec);
    this.projectPath = projectPath;
    // Same reasoning as loadAudio: restoring a sidecar is loading a document, not editing one.
    this.history.clear();
    this.revision = 0;
    this.savedRevision = 0;
  }

  /** Merge a completed (or restored) transcript into the project — see `TranscriptPanel.svelte`. */
  setTranscript(words: TranscriptWord[], status: "missing" | "complete"): void {
    if (this.transcriptWords === words && this.transcriptStatus === status) return;
    this.transcriptWords = words;
    this.transcriptStatus = status;
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
   * Switching filters changes what "kept seconds" means, so the raw
   * viewStartSec/viewDurationSec numbers don't carry over — but the
   * *content* you were looking at should. Translate the current window
   * to source time under the old filter, then back to kept time under
   * the new one, so the zoom/pan you had stays put instead of resetting
   * to the full timeline every time you toggle.
   */
  setViewFilter(filter: ViewFilter): void {
    this.commitEdit(() => {
      const oldSpans = this.timelineSpans;
      const sourceStart = keptToSource(oldSpans, this.viewStartSec);
      const sourceEnd = keptToSource(oldSpans, this.viewStartSec + this.viewDurationSec);

      this.viewFilter = filter;

      const newSpans = this.timelineSpans;
      const newStart = sourceToKept(newSpans, sourceStart);
      const newDuration = sourceToKept(newSpans, sourceEnd) - newStart;

      // The viewed content collapsed entirely under the new filter (e.g. you
      // were zoomed into a marked region and just hid marked audio) — fall
      // back to showing everything the new filter leaves visible.
      if (newDuration > 0) this.setView(newStart, newDuration);
      else this.setView(0, this.displayKeptDuration);
    });
  }

  setMuteMarked(muteMarked: boolean): void {
    this.commitEdit(() => {
      this.muteMarked = muteMarked;
    });
  }

  /** Toggle the transport loop-between-IN/OUT flag as one undo step (see `Transport.svelte`). */
  setLoopInOut(loopInOut: boolean): void {
    this.commitEdit(() => {
      this.loopInOut = loopInOut;
    });
  }

  async runSilenceDetection(): Promise<void> {
    if (!this.hasAudio || this.isDetectingSilence) return;
    this.isDetectingSilence = true;
    this.detectionProgress = 0;
    this.detectionError = null;
    // Opened before the await so the checkpoint captures the regions this
    // detection run is about to replace. Closed in `finally`, which
    // discards it as a no-op if detection failed and `rawMarkers` never changed.
    this.beginEdit();
    try {
      const segments = await vadDetector.detect(
        this.monoSamples,
        this.sampleRate,
        {
          positiveSpeechThreshold: this.settings.positiveSpeechThreshold,
          negativeSpeechThreshold: Math.max(
            0,
            this.settings.positiveSpeechThreshold - NEGATIVE_THRESHOLD_MARGIN,
          ),
        },
        (fraction) => {
          this.detectionProgress = fraction;
        },
      );
      this.rawMarkers = silenceRegionsFromSpeechSegments(
        segments,
        this.durationSec,
        this.settings.minSilenceMs,
      );
    } catch (err) {
      this.detectionError = err instanceof Error ? err.message : String(err);
    } finally {
      this.isDetectingSilence = false;
      this.endEdit();
    }
  }

  setPositiveSpeechThreshold(positiveSpeechThreshold: number): void {
    this.settings = { ...this.settings, positiveSpeechThreshold };
    this.revision++;
  }

  setMinSilenceMs(minSilenceMs: number): void {
    this.settings = { ...this.settings, minSilenceMs };
    this.revision++;
  }

  setBufferMs(bufferMs: number): void {
    this.settings = { ...this.settings, bufferMs: Math.max(0, bufferMs) };
    this.revision++;
  }

  setQuietThresholdDb(quietThresholdDb: number): void {
    this.settings = { ...this.settings, quietThresholdDb };
    this.revision++;
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
  runQuietDetection(): void {
    if (!this.hasAudio) return;
    this.commitEdit(() => {
      const quiet = silenceRegionsFromAmplitude(
        this.monoSamples,
        this.sampleRate,
        this.settings.quietThresholdDb,
        this.settings.minSilenceMs,
      );
      this.rawMarkers = quiet.reduce((acc, r) => unionInterval(acc, r.start, r.end), this.rawMarkers);
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
  moveMarker(markerIndex: number, edge: "start" | "end", newDisplayedSec: number): void {
    const raw = this.rawMarkers[markerIndex];
    if (!raw) return;
    const clamped = clamp(newDisplayedSec, 0, this.durationSec);
    const next = [...this.rawMarkers];
    next[markerIndex] = moveMarker(raw, this.settings.bufferMs, edge, clamped);
    this.rawMarkers = next;
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
  finishMarkerDrag(markerIndex: number): void {
    const dragged = this.rawMarkers[markerIndex];
    if (!dragged) return;

    let merged = dragged;
    const survivors: RawMarker[] = [];
    for (let i = 0; i < this.rawMarkers.length; i++) {
      if (i === markerIndex) continue;
      const other = this.rawMarkers[i];
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
    this.rawMarkers = [...survivors, merged].sort((a, b) => a.start - b.start);
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
   * Mark the pending selection as silence, merging it into any region it
   * touches. Ignores `minSilenceMs` — a manual mark is deliberate, however
   * short.
   */
  markSelection(): void {
    this.commitEdit(() => {
      if (this.selectionStartSec === null || this.selectionEndSec === null) return;
      const start = Math.min(this.selectionStartSec, this.selectionEndSec);
      const end = Math.max(this.selectionStartSec, this.selectionEndSec);
      this.rawMarkers = unionInterval(this.rawMarkers, start, end);
      this.clearSelection();
    });
  }

  /**
   * Unmark the pending selection, trimming or splitting whatever marked
   * regions it overlaps (see `subtractInterval`).
   */
  unmarkSelection(): void {
    this.commitEdit(() => {
      if (this.selectionStartSec === null || this.selectionEndSec === null) return;
      const start = Math.min(this.selectionStartSec, this.selectionEndSec);
      const end = Math.max(this.selectionStartSec, this.selectionEndSec);
      this.rawMarkers = subtractInterval(this.rawMarkers, start, end);
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
  finishSelectionDrag(): void {
    if (this.selectionStartSec === null || this.selectionEndSec === null) return;
    const start = Math.min(this.selectionStartSec, this.selectionEndSec);
    const end = Math.max(this.selectionStartSec, this.selectionEndSec);
    const fraction = overlapFraction(this.rawMarkers, start, end);
    if (fraction >= AUTO_MERGE_OVERLAP_FRACTION && fraction < 1) this.markSelection();
  }

  setIn(sec: number): void {
    this.inSec = clamp(sec, 0, this.outSec);
  }

  setOut(sec: number): void {
    this.outSec = clamp(sec, this.inSec, this.durationSec);
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
   * Jump to the next/prev marked region relative to wherever the playhead
   * is right now (see `adjacentMarkedRegion`) and zoom to fit it. Forces
   * `viewFilter` back to "all" first — under `hideMarked` the target
   * region is collapsed to zero kept width (nothing to fit), and under
   * `hideUnmarked` the padding would pull in neighboring kept content
   * unrelated to this region in source time. `muteMarked` is untouched;
   * it only affects playback, not what's visible/navigable.
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
      this.setView(startSec, durationSec);
    });
    return region.start;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const editor = new EditorState();
