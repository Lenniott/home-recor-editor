import type { NavDirection } from "./audio/markerNav";
import { buildPlaybackPlan, type PlaybackPlan } from "./audio/playbackPlan";
import { editor, type EditorState, type TrackState } from "./editor.svelte";

/**
 * Owns the AudioContext / AudioBufferSourceNode lifecycle and keeps
 * `editor.playheadSec` moving while a project plays. Callers only ever
 * need play / pause / toggle / seek — everything about scheduling nodes,
 * skipping cut spans, ducking each track's silenced regions, and polling
 * elapsed time stays behind that interface.
 *
 * Every loaded track is scheduled against the same plan (see
 * `buildPlaybackPlan`), so one clock drives both lanes and a cut takes
 * the same seconds out of each.
 */
export class AudioPlayer {
  private readonly editor: EditorState;
  private context: AudioContext | null = null;
  private sourceNodes: AudioBufferSourceNode[] = [];
  private gainNodes: GainNode[] = [];
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
    const tracks = this.editor.tracks.filter((track): track is TrackState & { audioBuffer: AudioBuffer } =>
      track.audioBuffer !== null,
    );
    if (tracks.length === 0) return;

    const context = this.getContext();
    void context.resume();
    this.stopSources();

    const boundary = this.editor.loopInOut ? this.editor.outSec : this.editor.durationSec;
    const atEnd = this.editor.playheadSec >= boundary - 0.001;
    const startSec = atEnd ? this.editor.inSec : this.editor.playheadSec;

    // Two tracks playing at once each contribute half, matching the
    // combined export mix — see the plan's export section.
    const gain = 1 / tracks.length;
    const plan = buildPlaybackPlan(
      this.editor.timelineSpans,
      startSec,
      boundary,
      tracks.map((track) => ({ mutedIntervals: this.editor.mutedIntervalsFor(track), gain })),
    );

    if (plan.chunks.length === 0) {
      // Nothing kept to play from here (e.g. everything ahead is cut).
      this.editor.setPlayhead(startSec);
      this.editor.isPlaying = false;
      return;
    }

    const contextStart = context.currentTime;
    const sources: AudioBufferSourceNode[] = [];
    const gains: GainNode[] = [];

    tracks.forEach((track, index) => {
      const gainNode = context.createGain();
      gainNode.gain.value = plan.tracks[index].gain;
      gainNode.connect(context.destination);
      for (const event of plan.tracks[index].gainEvents) {
        gainNode.gain.linearRampToValueAtTime(event.value, contextStart + event.time);
      }
      gains.push(gainNode);

      for (const chunk of plan.chunks) {
        // A shorter track simply has no audio out here — its missing tail
        // is silence, and the shared timeline still runs (see `cutSuggestions`).
        if (chunk.sourceStart >= track.audioBuffer.duration) continue;
        const source = context.createBufferSource();
        source.buffer = track.audioBuffer;
        source.connect(gainNode);
        const length = Math.min(chunk.sourceEnd, track.audioBuffer.duration) - chunk.sourceStart;
        source.start(contextStart + chunk.playAt, chunk.sourceStart, length);
        sources.push(source);
      }
    });

    if (sources.length === 0) {
      this.editor.setPlayhead(startSec);
      this.editor.isPlaying = false;
      return;
    }

    const lastSource = sources[sources.length - 1];
    lastSource.onended = () => {
      if (this.sourceNodes[this.sourceNodes.length - 1] === lastSource) this.handleEnded();
    };

    this.gainNodes = gains;
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
   * the view filter, the preview mode, the cuts, or the marked regions
   * while a project is playing — none of those invalidate the
   * AudioBuffers, only what's already been scheduled from them, so a
   * plain re-seek is enough to pick them up.
   */
  refreshIfPlaying(): void {
    if (this.editor.isPlaying) this.seek(this.editor.playheadSec);
  }

  /**
   * Zoom to a range, loop it, and start playing there — how a cut
   * suggestion is auditioned before accepting or dismissing it.
   */
  audition(range: { start: number; end: number }): void {
    this.editor.beginEdit();
    this.seek(this.editor.focusRange(range));
    this.editor.endEdit();
    if (!this.editor.isPlaying) this.play();
  }

  /**
   * Step to the next/prev marked region and land there: reset the view
   * filter, zoom to fit (`EditorState.goToAdjacentMarkedRegion`), then
   * seek the playhead. Wrapped in one `beginEdit`/`endEdit` transaction —
   * same pattern as a waveform click-seek — so the filter reset, the
   * zoom, and the playhead move undo together as a single step. No-op
   * when there are no marked regions.
   */
  goToAdjacentMarkedRegion(direction: NavDirection): void {
    this.editor.beginEdit();
    const inSec = this.editor.goToAdjacentMarkedRegion(direction);
    if (inSec !== null) this.seek(inSec);
    this.editor.endEdit();
  }

  /** Elapsed context time since the current plan started, converted back to a source-buffer position. */
  private currentSourceSec(): number {
    if (!this.context || !this.plan) return this.editor.playheadSec;
    const elapsed = clamp(this.context.currentTime - this.planContextStart, 0, this.plan.totalSec);
    return this.sourceSecAtElapsed(elapsed);
  }

  /** Maps a point on the plan's own (gapless) timeline back to where that is in the source recordings. */
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
    for (const gain of this.gainNodes) gain.disconnect();
    this.gainNodes = [];
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

    // Every animation frame during playback, not a user gesture — must
    // never become (or interrupt) an undo step. Contrast with `seek`'s
    // `setPlayhead` call, which backs an undoable click-seek from the
    // waveform and stays outside this wrapper.
    this.editor.withoutHistory(() => this.editor.setPlayhead(this.sourceSecAtElapsed(elapsed)));
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
