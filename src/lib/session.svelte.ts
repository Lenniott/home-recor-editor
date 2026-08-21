/**
 * Coordinates any number of independently-loaded `EditorState` tracks (a
 * multi-mic recording session — no fixed count, no "host"/"guest" concept)
 * for the operations that only make sense *across* tracks: joint "nobody
 * is speaking" detection, joint apply, a synced multi-channel export, and
 * which track keyboard shortcuts currently target. Every per-track
 * operation (detect, cycle markers, apply, export, undo) stays exactly as
 * it works today on a plain `EditorState` — this class never touches a
 * track's own `rawMarkers`/undo history except through the public
 * `applyMarkedRegions` it already exposes for exactly this purpose. The
 * actual region/encoding math lives in `audio/jointSession.ts`, kept plain
 * so it's unit testable without Svelte runes.
 */

import { encodeJointTracks, shiftRegions, toTrackTime } from "./audio/jointSession";
import { intersectRegions, type RawMarker } from "./audio/silence";
import { EditorState } from "./editor.svelte";
import { AudioPlayer } from "./player";

/** A loaded track plus the player that plays it back — always created together, see `SessionState.addTrack`. */
export interface Track {
  editor: EditorState;
  player: AudioPlayer;
}

export class SessionState {
  tracks: Track[] = $state([]);

  /**
   * Which track keyboard shortcuts (space, undo, marker nav, mark/unmark)
   * currently target — set by clicking a track row or its waveform (see
   * `+page.svelte`'s `onKeydown`). Null when no track has been focused
   * yet (e.g. nothing loaded).
   */
  focusedIndex: number | null = $state(null);

  /**
   * Regions where *no* track's VAD detected speech, in shared session time
   * (each track's own timeline shifted by its `offsetSec`) — see
   * `detectJointSilence`. Kept separate from any track's own `rawMarkers`
   * so per-track and joint detection never clobber each other.
   */
  jointRegions: RawMarker[] = $state([]);

  /**
   * Shared timeline window (in seconds), read/written by every track row's
   * `Waveform` — the standard DAW pattern of one ruler and one scroll/zoom
   * position for every stacked track (see `Timeline.svelte`), instead of
   * each track scrolling independently. `viewDurationSec === 0` means
   * "not yet sized" — `addTrack` fits it to the first track loaded.
   */
  viewStartSec: number = $state(0);
  viewDurationSec: number = $state(0);

  readonly focusedTrack = $derived(this.focusedIndex !== null ? (this.tracks[this.focusedIndex] ?? null) : null);

  /** Cross-track operations need at least two tracks to mean anything. */
  readonly canJoin = $derived(this.tracks.length >= 2);

  /** Longest loaded track — the bound the shared view window can't scroll/zoom past. */
  readonly maxDurationSec = $derived(this.tracks.reduce((max, t) => Math.max(max, t.editor.durationSec), 0));

  /** Load a new track and give it keyboard focus — the natural place to look right after adding it. */
  addTrack(editor: EditorState): Track {
    const track: Track = { editor, player: new AudioPlayer(editor) };
    this.tracks = [...this.tracks, track];
    this.focusedIndex = this.tracks.length - 1;
    this.jointRegions = [];
    if (this.viewDurationSec === 0) this.setView(0, editor.durationSec);
    return track;
  }

  /** `startSec`/`durationSec` are plain source seconds — clamped to the longest loaded track. */
  setView(startSec: number, durationSec: number): void {
    const total = this.maxDurationSec;
    const maxStart = Math.max(0, total - durationSec);
    this.viewStartSec = clamp(startSec, 0, maxStart);
    this.viewDurationSec = clamp(durationSec, 0, total || durationSec);
  }

  removeTrack(track: Track): void {
    track.player.pause();
    const index = this.tracks.indexOf(track);
    this.tracks = this.tracks.filter((t) => t !== track);
    this.jointRegions = [];
    if (this.focusedIndex === null || index === -1) return;
    if (this.tracks.length === 0) this.focusedIndex = null;
    else this.focusedIndex = Math.min(this.focusedIndex, this.tracks.length - 1);
  }

  focus(track: Track): void {
    const index = this.tracks.indexOf(track);
    if (index !== -1) this.focusedIndex = index;
  }

  /** True while any track is playing — every `play()`/`pause()` call below starts/stops all of them together, so this is really "is the session playing." */
  readonly isPlaying = $derived(this.tracks.some((t) => t.editor.isPlaying));

  /**
   * The session's shared playhead, in session time — each track keeps
   * ticking its own `playheadSec` independently once started (separate
   * `AudioContext`s, no single shared clock), so this reads track 0's
   * position and translates it onto session time via its offset. Good
   * enough for a synced multitrack preview; not sample-accurate across
   * tracks long-term (see `play`'s docstring).
   */
  readonly playheadSec = $derived(this.tracks[0] ? this.tracks[0].editor.playheadSec + this.tracks[0].editor.offsetSec : 0);

  /**
   * Universal transport: play/pause/seek act on every loaded track
   * together, not just the focused one — "play" has one meaning in a
   * multitrack session (see `focus`/`focusedIndex` for the separate,
   * single-track concept of which track's marker edits keyboard shortcuts
   * target). Each track's own `AudioPlayer` still owns its own
   * `AudioContext` and schedules independently; starting them within the
   * same synchronous pass keeps them close enough for a synced preview,
   * though (as with any multi-context setup) they can drift by a few
   * milliseconds over a long take — acceptable for editing, not for a
   * sample-accurate mixdown (which happens offline via `exportJoint`,
   * not through this playback path at all).
   */
  play(): void {
    const sessionSec = this.playheadSec;
    for (const { editor } of this.tracks) editor.withoutHistory(() => editor.setPlayhead(sessionSec - editor.offsetSec));
    for (const { player } of this.tracks) player.play();
  }

  pause(): void {
    for (const { player } of this.tracks) player.pause();
  }

  toggle(): void {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  /** Relocate every track to `sessionSec` (translated through each one's own offset); keeps playing if it already was. */
  seek(sessionSec: number): void {
    for (const { player, editor } of this.tracks) player.seek(sessionSec - editor.offsetSec);
  }

  /**
   * Run VAD on every track that doesn't already have markers (so
   * re-running joint detect after nudging an offset doesn't force a
   * redundant model pass on tracks already detected), then intersect all
   * of their not-speaking regions in session time — "nobody is speaking",
   * generalized across however many tracks are loaded. A barking dog or
   * passing car isn't quiet, but VAD still knows it isn't anyone talking.
   */
  async detectJointSilence(): Promise<void> {
    if (!this.canJoin) return;
    await Promise.all(this.tracks.filter((t) => t.editor.rawMarkers.length === 0).map((t) => t.editor.runSilenceDetection()));

    const sessionRegions = this.tracks.map((t) => shiftRegions(t.editor.rawMarkers, t.editor.offsetSec));
    this.jointRegions = sessionRegions.reduce((acc, regions) => intersectRegions(acc, regions));
  }

  /** Bake the current joint regions into every track as a mute (fade to silence, duration unchanged). */
  applyJointSilence(): void {
    this.applyJoint("silence");
  }

  /** Bake the current joint regions into every track as a cut (concatenate the kept spans, duration shortens). */
  applyJointRemove(): void {
    this.applyJoint("remove");
  }

  private applyJoint(mode: "silence" | "remove"): void {
    if (!this.canJoin || this.jointRegions.length === 0) return;
    this.pause();
    for (const { editor } of this.tracks) {
      editor.applyMarkedRegions(toTrackTime(this.jointRegions, editor.offsetSec, editor.durationSec), mode);
    }
    this.jointRegions = [];
  }

  /**
   * Encode every loaded track as one multi-channel WAV, in track order,
   * aligned by each track's manual `offsetSec` and truncated to whichever
   * ends up shortest. Throws instead of resampling on a sample-rate
   * mismatch (per the locked-in decision: mismatched rates from
   * separately-recorded devices should be surfaced, not silently altered).
   */
  exportJoint(): { bytes: Uint8Array; sampleRate: number } {
    if (this.tracks.length === 0) throw new Error("Load at least one track before exporting.");
    const withAudio = this.tracks.filter((t) => t.editor.audioBuffer);
    if (withAudio.length !== this.tracks.length) throw new Error("Every track must have audio loaded.");

    const bytes = encodeJointTracks(
      withAudio.map(({ editor }) => ({
        channel: editor.audioBuffer!.getChannelData(0),
        sampleRate: editor.sampleRate,
        offsetSec: editor.offsetSec,
      })),
    );
    return { bytes, sampleRate: withAudio[0].editor.sampleRate };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const session = new SessionState();
