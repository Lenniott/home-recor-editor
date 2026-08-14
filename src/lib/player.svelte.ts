import type { EditorState } from "./editor.svelte";

/**
 * Owns the AudioContext / AudioBufferSourceNode lifecycle and keeps
 * `editor.playheadSec` moving while a take plays. Callers only ever need
 * play / pause / toggle / seek — everything about scheduling nodes and
 * polling elapsed time stays behind that interface.
 */
export class AudioPlayer {
  private readonly editor: EditorState;
  private context: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private startedAtContextTime = 0;
  private startedAtPlayheadSec = 0;
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
    this.stopSource();

    const atEnd = this.editor.playheadSec >= (this.editor.loopInOut ? this.editor.outSec : this.editor.durationSec) - 0.001;
    const startSec = atEnd ? this.editor.inSec : this.editor.playheadSec;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => {
      if (this.sourceNode === source) this.handleEnded();
    };
    source.start(0, startSec);

    this.sourceNode = source;
    this.startedAtContextTime = context.currentTime;
    this.startedAtPlayheadSec = startSec;
    this.editor.setPlayhead(startSec);
    this.editor.isPlaying = true;
    this.scheduleTick();
  }

  pause(): void {
    this.editor.setPlayhead(this.currentElapsedSec());
    this.stopSource();
    this.editor.isPlaying = false;
    this.cancelTick();
  }

  /** Relocate playback (and the playhead) to `sec`; keeps playing if it was already playing. */
  seek(sec: number): void {
    const wasPlaying = this.editor.isPlaying;
    this.stopSource();
    this.cancelTick();
    this.editor.isPlaying = false;
    this.editor.setPlayhead(sec);
    if (wasPlaying) this.play();
  }

  private currentElapsedSec(): number {
    if (!this.context || !this.sourceNode) return this.editor.playheadSec;
    return this.startedAtPlayheadSec + (this.context.currentTime - this.startedAtContextTime);
  }

  private stopSource(): void {
    if (!this.sourceNode) return;
    this.sourceNode.onended = null;
    try {
      this.sourceNode.stop();
    } catch {
      // already stopped — harmless
    }
    this.sourceNode.disconnect();
    this.sourceNode = null;
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
    if (!this.editor.isPlaying) return;

    const elapsed = this.currentElapsedSec();
    const boundary = this.editor.loopInOut ? this.editor.outSec : this.editor.durationSec;

    if (elapsed >= boundary) {
      this.stopSource();
      this.handleEnded();
      return;
    }

    this.editor.setPlayhead(elapsed);
    this.rafHandle = requestAnimationFrame(this.scheduleTick);
  };

  private cancelTick(): void {
    if (this.rafHandle === null) return;
    cancelAnimationFrame(this.rafHandle);
    this.rafHandle = null;
  }
}
