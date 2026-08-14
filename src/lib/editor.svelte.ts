import {
  applySilenceBuffer,
  moveSilenceMarker,
  silenceRegionsFromSpeechSegments,
  subtractInterval,
  unionInterval,
  type RawSilenceRegion,
  type SilenceRegion,
} from "./audio/silence";
import { vadDetector } from "./vadDetector";

/** How a pending timeline selection overlaps the currently marked regions. */
export type SelectionOverlap = "unmarked" | "marked" | "mixed";

export interface SilenceSettings {
  /** Silero VAD speech-probability threshold (0-1); higher = less sensitive. */
  positiveSpeechThreshold: number;
  minSilenceMs: number;
  bufferMs: number;
}

const DEFAULT_SETTINGS: SilenceSettings = {
  positiveSpeechThreshold: 0.5,
  minSilenceMs: 300,
  bufferMs: 150,
};

/** Silero's suggested gap between the positive and negative thresholds. */
const NEGATIVE_THRESHOLD_MARGIN = 0.15;

/**
 * Shared merge trigger for both ways two marked regions can end up
 * overlapping: a finished drag-select whose range overlaps existing marked
 * regions (see `finishSelectionDrag`), or dragging one marked region's
 * edge into a neighbor (see `moveSilenceMarker`). Once the overlap reaches
 * this fraction of whichever region involved is shorter, it's clearly
 * intentional, so the two merge into one instead of just piling up.
 */
const AUTO_MERGE_OVERLAP_FRACTION = 0.4;

function overlapFraction(regions: RawSilenceRegion[], start: number, end: number): number {
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
 * Single source of truth for the loaded take and everything derived from
 * it: playback position, view window, silence regions, and the IN/OUT
 * markers. UI components read/write through this — none of them own
 * state themselves.
 */
export class EditorState {
  fileName: string | null = $state(null);
  audioBuffer: AudioBuffer | null = $state(null);
  monoSamples: Float32Array = $state(new Float32Array(0));

  playheadSec: number = $state(0);
  isPlaying: boolean = $state(false);
  loopInOut: boolean = $state(false);

  /** Visible window of the waveform, in seconds. */
  viewStartSec: number = $state(0);
  viewDurationSec: number = $state(0);

  settings: SilenceSettings = $state({ ...DEFAULT_SETTINGS });
  rawSilenceRegions: RawSilenceRegion[] = $state([]);
  isDetectingSilence: boolean = $state(false);
  detectionProgress: number = $state(0);
  detectionError: string | null = $state(null);

  inSec: number = $state(0);
  outSec: number = $state(0);

  /** Pending drag-to-select range on the waveform, in seconds. Null when nothing is selected. */
  selectionStartSec: number | null = $state(null);
  selectionEndSec: number | null = $state(null);

  readonly durationSec = $derived(this.audioBuffer?.duration ?? 0);
  readonly sampleRate = $derived(this.audioBuffer?.sampleRate ?? 0);
  readonly hasAudio = $derived(this.audioBuffer !== null);

  readonly silenceRegions: SilenceRegion[] = $derived.by(() =>
    applySilenceBuffer(this.rawSilenceRegions, this.settings.bufferMs),
  );

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

    const fraction = overlapFraction(this.rawSilenceRegions, start, end);
    if (fraction <= 0) return "unmarked";
    if (fraction >= 1) return "marked";
    return "mixed";
  });

  loadAudio(buffer: AudioBuffer, fileName: string, monoSamples: Float32Array): void {
    this.audioBuffer = buffer;
    this.fileName = fileName;
    this.monoSamples = monoSamples;
    this.playheadSec = 0;
    this.isPlaying = false;
    this.rawSilenceRegions = [];
    this.detectionProgress = 0;
    this.detectionError = null;
    this.inSec = 0;
    this.outSec = buffer.duration;
    this.viewStartSec = 0;
    this.viewDurationSec = buffer.duration;
    this.selectionStartSec = null;
    this.selectionEndSec = null;
  }

  async runSilenceDetection(): Promise<void> {
    if (!this.hasAudio || this.isDetectingSilence) return;
    this.isDetectingSilence = true;
    this.detectionProgress = 0;
    this.detectionError = null;
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
      this.rawSilenceRegions = silenceRegionsFromSpeechSegments(
        segments,
        this.durationSec,
        this.settings.minSilenceMs,
      );
    } catch (err) {
      this.detectionError = err instanceof Error ? err.message : String(err);
    } finally {
      this.isDetectingSilence = false;
    }
  }

  setPositiveSpeechThreshold(positiveSpeechThreshold: number): void {
    this.settings = { ...this.settings, positiveSpeechThreshold };
  }

  setMinSilenceMs(minSilenceMs: number): void {
    this.settings = { ...this.settings, minSilenceMs };
  }

  setBufferMs(bufferMs: number): void {
    this.settings = { ...this.settings, bufferMs: Math.max(0, bufferMs) };
  }

  /**
   * Drag a silence marker; edits the underlying raw region so the buffer
   * slider keeps working afterwards. This just tracks the cursor 1:1 —
   * merge detection happens separately, only once the drag ends (see
   * `finishSilenceMarkerDrag`). Checking on every move would let a merge
   * get undone by the very next event: the edge is recomputed straight
   * from the raw cursor position each time, so once merged, the next tiny
   * mouse move would snap the boundary back to wherever the cursor
   * happens to be, discarding the extension the merge just made.
   */
  moveSilenceMarker(regionIndex: number, edge: "start" | "end", newDisplayedSec: number): void {
    const raw = this.rawSilenceRegions[regionIndex];
    if (!raw) return;
    const clamped = clamp(newDisplayedSec, 0, this.durationSec);
    const next = [...this.rawSilenceRegions];
    next[regionIndex] = moveSilenceMarker(raw, this.settings.bufferMs, edge, clamped);
    this.rawSilenceRegions = next;
  }

  /**
   * Call once a silence-marker drag ends. If the dragged region now
   * overlaps a neighbor by more than `AUTO_MERGE_OVERLAP_FRACTION` of
   * whichever of the two is shorter, they merge into one — drag mark B's
   * start 4 of its own 10 seconds into mark A and the two become one
   * region, and the same holds dragging A into B. Below that threshold
   * they're left overlapping as dragged, matching a manual Mark/Unmark
   * decision instead of an automatic one.
   */
  finishSilenceMarkerDrag(regionIndex: number): void {
    const dragged = this.rawSilenceRegions[regionIndex];
    if (!dragged) return;

    let merged = dragged;
    const survivors: RawSilenceRegion[] = [];
    for (let i = 0; i < this.rawSilenceRegions.length; i++) {
      if (i === regionIndex) continue;
      const other = this.rawSilenceRegions[i];
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
    this.rawSilenceRegions = [...survivors, merged].sort((a, b) => a.start - b.start);
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
    if (this.selectionStartSec === null || this.selectionEndSec === null) return;
    const start = Math.min(this.selectionStartSec, this.selectionEndSec);
    const end = Math.max(this.selectionStartSec, this.selectionEndSec);
    this.rawSilenceRegions = unionInterval(this.rawSilenceRegions, start, end);
    this.clearSelection();
  }

  /**
   * Unmark the pending selection, trimming or splitting whatever marked
   * regions it overlaps (see `subtractInterval`).
   */
  unmarkSelection(): void {
    if (this.selectionStartSec === null || this.selectionEndSec === null) return;
    const start = Math.min(this.selectionStartSec, this.selectionEndSec);
    const end = Math.max(this.selectionStartSec, this.selectionEndSec);
    this.rawSilenceRegions = subtractInterval(this.rawSilenceRegions, start, end);
    this.clearSelection();
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
    const fraction = overlapFraction(this.rawSilenceRegions, start, end);
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

  setView(startSec: number, durationSec: number): void {
    const maxStart = Math.max(0, this.durationSec - durationSec);
    this.viewStartSec = clamp(startSec, 0, maxStart);
    this.viewDurationSec = clamp(durationSec, 0, this.durationSec || durationSec);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const editor = new EditorState();
