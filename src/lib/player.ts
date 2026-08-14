import { buildPlaybackPlan, type PlaybackPlan } from "./audio/playbackPlan";
import { editor, type EditorState } from "./editor.svelte";

/**
 * Owns the AudioContext / AudioBufferSourceNode lifecycle and keeps
 * `editor.playheadSec` moving while a take plays. Callers only ever need
 * play / pause / toggle / seek — everything about scheduling nodes,
 * skipping hidden spans, ducking marked audio, and polling elapsed time
 * stays behind that interface.
 */
export class AudioPlayer {
  private readonly editor: EditorState;
  private context: AudioContext | null = null;
  private sourceNodes: AudioBufferSourceNode[] = [];
  private gainNode: GainNode | null = null;
  private plan: PlaybackPlan | null = null;
  private planContextStart = 0;
  private rafHandle: number | null = null;

  constructor(editor: EditorState) {
    this.editor = editor;
  }

  /** Also used to decode newly opened files, so decode and playback share one context. */
  getContext(): AudioContext {
    if (!this.context) this.context = new AudioContext();
    return this.context;
  }

  toggle(): void {
    if (this.editor.isPlaying) this.pause();
    else this.play();
  }

  play(): void {
    const buffer = this.editor.audioBuffer;
    if (!buffer) return;

    const context = this.getContext();
    void context.resume();
    this.stopSources();

    const boundary = this.editor.loopInOut ? this.editor.outSec : this.editor.durationSec;
    const atEnd = this.editor.playheadSec >= boundary - 0.001;
    const startSec = atEnd ? this.editor.inSec : this.editor.playheadSec;

    const plan = buildPlaybackPlan(
      this.editor.timelineSpans,
      startSec,
      boundary,
      this.editor.viewFilter,
      this.editor.muteMarked,
      this.editor.markedIntervals,
    );

    if (plan.chunks.length === 0) {
      // Nothing kept to play from here (e.g. "hide unmarked" with no marked regions).
      this.editor.setPlayhead(startSec);
      this.editor.isPlaying = false;
      return;
    }

    const gainNode = context.createGain();
    gainNode.connect(context.destination);
    const contextStart = context.currentTime;
    for (const event of plan.gainEvents) {
      gainNode.gain.linearRampToValueAtTime(event.value, contextStart + event.time);
    }

    const sources = plan.chunks.map((chunk) => {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNode);
      source.start(contextStart + chunk.playAt, chunk.sourceStart, chunk.sourceEnd - chunk.sourceStart);
      return source;
    });
    const lastSource = sources[sources.length - 1];
    lastSource.onended = () => {
      if (this.sourceNodes[this.sourceNodes.length - 1] === lastSource) this.handleEnded();
    };

    this.gainNode = gainNode;
    this.sourceNodes = sources;
    this.plan = plan;
    this.planContextStart = contextStart;
    this.editor.setPlayhead(startSec);
    this.editor.isPlaying = true;
    this.scheduleTick();
  }

  pause(): void {
    this.editor.setPlayhead(this.currentSourceSec());
    this.stopSources();
    this.editor.isPlaying = false;
    this.cancelTick();
  }

  /** Relocate playback (and the playhead) to `sec`; keeps playing if it was already playing. */
  seek(sec: number): void {
    const wasPlaying = this.editor.isPlaying;
    this.stopSources();
    this.cancelTick();
    this.editor.isPlaying = false;
    this.editor.setPlayhead(sec);
    if (wasPlaying) this.play();
  }

  /**
   * Rebuild the schedule from the current playhead. Call after changing
   * the view filter, mute, or marked regions while a take is playing —
   * none of those invalidate the AudioBuffer, only what's already been
   * scheduled from it, so a plain re-seek is enough to pick them up.
   */
  refreshIfPlaying(): void {
    if (this.editor.isPlaying) this.seek(this.editor.playheadSec);
  }

  /** Elapsed context time since the current plan started, converted back to a source-buffer position. */
  private currentSourceSec(): number {
    if (!this.context || !this.plan) return this.editor.playheadSec;
    const elapsed = clamp(this.context.currentTime - this.planContextStart, 0, this.plan.totalSec);
    return this.sourceSecAtElapsed(elapsed);
  }

  /** Maps a point on the plan's own (gapless) timeline back to where that is in the source buffer. */
  private sourceSecAtElapsed(elapsedPlaySec: number): number {
    const chunks = this.plan?.chunks ?? [];
    if (chunks.length === 0) return this.editor.playheadSec;

    for (const chunk of chunks) {
      const length = chunk.sourceEnd - chunk.sourceStart;
      if (elapsedPlaySec <= chunk.playAt + length || chunk === chunks[chunks.length - 1]) {
        return chunk.sourceStart + Math.max(0, elapsedPlaySec - chunk.playAt);
      }
    }
    return chunks[chunks.length - 1].sourceEnd;
  }

  private stopSources(): void {
    for (const source of this.sourceNodes) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // already stopped — harmless
      }
      source.disconnect();
    }
    this.sourceNodes = [];
    this.gainNode?.disconnect();
    this.gainNode = null;
    this.plan = null;
  }

  private handleEnded(): void {
    this.cancelTick();
    if (this.editor.loopInOut) {
      this.editor.setPlayhead(this.editor.inSec);
      this.play();
      return;
    }
    this.editor.isPlaying = false;
  }

  private scheduleTick = (): void => {
    if (!this.editor.isPlaying || !this.context || !this.plan) return;

    const elapsed = this.context.currentTime - this.planContextStart;
    if (elapsed >= this.plan.totalSec) {
      this.stopSources();
      this.handleEnded();
      return;
    }

    this.editor.setPlayhead(this.sourceSecAtElapsed(elapsed));
    this.rafHandle = requestAnimationFrame(this.scheduleTick);
  };

  private cancelTick(): void {
    if (this.rafHandle === null) return;
    cancelAnimationFrame(this.rafHandle);
    this.rafHandle = null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const player = new AudioPlayer(editor);
