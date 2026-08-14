import {
  applySilenceBuffer,
  moveSilenceMarker,
  silenceRegionsFromSpeechSegments,
  type RawSilenceRegion,
  type SilenceRegion,
} from "./audio/silence";
import { vadDetector } from "./vadDetector";

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

  readonly durationSec = $derived(this.audioBuffer?.duration ?? 0);
  readonly sampleRate = $derived(this.audioBuffer?.sampleRate ?? 0);
  readonly hasAudio = $derived(this.audioBuffer !== null);

  readonly silenceRegions: SilenceRegion[] = $derived.by(() =>
    applySilenceBuffer(this.rawSilenceRegions, this.settings.bufferMs),
  );

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

  /** Drag a silence marker; edits the underlying raw region so the buffer slider keeps working afterwards. */
  moveSilenceMarker(regionIndex: number, edge: "start" | "end", newDisplayedSec: number): void {
    const raw = this.rawSilenceRegions[regionIndex];
    if (!raw) return;
    const clamped = clamp(newDisplayedSec, 0, this.durationSec);
    const next = [...this.rawSilenceRegions];
    next[regionIndex] = moveSilenceMarker(raw, this.settings.bufferMs, edge, clamped);
    this.rawSilenceRegions = next;
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
