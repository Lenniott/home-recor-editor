import { afterEach, describe, expect, it, vi } from "vitest";
import { editor, EditorState } from "./editor.svelte";
import { AudioPlayer, player } from "./player";

const buffer = (duration = 10) =>
  ({
    duration,
    sampleRate: 16000,
    length: duration * 16000,
    numberOfChannels: 1,
    getChannelData: () => new Float32Array(duration * 16000),
    copyFromChannel() {},
    copyToChannel() {},
  }) as AudioBuffer;

function fakeAudio() {
  const starts: number[] = [];
  const stops: number[] = [];
  const sources: {
    onended: (() => void) | null;
    playbackRate: { value: number };
  }[] = [];
  const ctx = {
    currentTime: 0,
    destination: {},
    resume() {
      return Promise.resolve();
    },
    createGain() {
      return {
        gain: { value: 1, linearRampToValueAtTime() {} },
        connect() {},
        disconnect() {},
      };
    },
    createBufferSource() {
      const source = {
        buffer: null as AudioBuffer | null,
        playbackRate: { value: 1 },
        connect() {},
        disconnect() {},
        start(when = 0) {
          starts.push(when);
        },
        stop() {
          stops.push(1);
        },
        onended: null as (() => void) | null,
      };
      sources.push(source);
      return source;
    },
  };
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        return ctx;
      }
    },
  );
  let frame: FrameRequestCallback | null = null;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frame = cb;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    frame = null;
  });
  return {
    ctx,
    starts,
    stops,
    sources,
    tick() {
      frame?.(0);
    },
  };
}

afterEach(() => {
  editor.newProject();
  vi.unstubAllGlobals();
});

describe("AudioPlayer", () => {
  it("constructs AudioPlayer with a given EditorState instead of the module singleton", () => {
    const freshEditor = new EditorState();
    freshEditor.loadAudio(buffer(), "fresh.wav", new Float32Array(160000));
    editor.loadAudio(buffer(), "global.wav", new Float32Array(160000));
    editor.setPlayhead(4);

    const playback = new AudioPlayer(freshEditor);
    playback.seek(1.5);

    expect(freshEditor.playheadSec).toBe(1.5);
    expect(editor.playheadSec).toBe(4);
  });

  it("toggle, seek, and decode share one audio context", () => {
    let constructed = 0;
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          constructed += 1;
        }
      },
    );

    const playback = new AudioPlayer(new EditorState());
    const ctx = playback.getContext();
    playback.seek(0);
    playback.toggle();

    expect(playback.getContext()).toBe(ctx);
    expect(constructed).toBe(1);
  });

  it("exported player seeks and refreshes the session the UI already uses", () => {
    editor.loadAudio(buffer(), "ui.wav", new Float32Array(160000));
    player.seek(2.25);
    expect(editor.playheadSec).toBe(2.25);
    player.refreshIfPlaying();
    expect(editor.playheadSec).toBe(2.25);
    expect(editor.isPlaying).toBe(false);
  });

  it("play starts one buffer source per plan chunk for a single track", () => {
    const { starts } = fakeAudio();
    const session = new EditorState();
    session.loadAudio(buffer(2), "a.wav", new Float32Array(32000));
    const playback = new AudioPlayer(session);
    playback.play();

    expect(starts).toHaveLength(1);
    expect(starts[0]).toBe(0);
  });

  it("play with two tracks starts one source per track at the plan's first chunk time", () => {
    const { starts } = fakeAudio();
    const session = new EditorState();
    session.loadAudio(buffer(2), "a.wav", new Float32Array(32000));
    session.addTrack(buffer(2), "b.wav", new Float32Array(32000));
    const playback = new AudioPlayer(session);
    playback.play();

    expect(starts).toEqual([0, 0]);
  });

  it("pause maps playhead to source time 1.5s literal mid-chunk", () => {
    const audio = fakeAudio();
    const session = new EditorState();
    session.loadAudio(buffer(10), "a.wav", new Float32Array(160000));
    const playback = new AudioPlayer(session);
    playback.play();
    audio.ctx.currentTime = 1.5;
    playback.pause();

    expect(session.playheadSec).toBe(1.5);
    expect(session.isPlaying).toBe(false);
  });

  it("seek while playing stops then starts again", () => {
    const { starts, stops } = fakeAudio();
    const session = new EditorState();
    session.loadAudio(buffer(10), "a.wav", new Float32Array(160000));
    const playback = new AudioPlayer(session);
    playback.play();
    expect(starts).toHaveLength(1);
    playback.seek(1);

    expect(stops.length).toBeGreaterThan(0);
    expect(starts.length).toBeGreaterThan(1);
    expect(session.playheadSec).toBe(1);
    expect(session.isPlaying).toBe(true);
  });

  it("empty session does not start playback", () => {
    const { starts } = fakeAudio();
    const playback = new AudioPlayer(new EditorState());
    playback.play();

    expect(starts).toHaveLength(0);
  });

  it("playhead uses source time so a 0.5s cut does not advance displayed time across the hole", () => {
    const audio = fakeAudio();
    const session = new EditorState();
    session.loadAudio(buffer(2), "a.wav", new Float32Array(32000));
    session.addCut({ start: 0.5, end: 1.0 });
    session.setPreview("edited");
    const playback = new AudioPlayer(session);
    playback.play();
    audio.ctx.currentTime = 0.5;
    playback.pause();

    expect(session.playheadSec).toBe(1.0);
  });

  it("playhead ticks are not undoable", () => {
    const audio = fakeAudio();
    const session = new EditorState();
    session.loadAudio(buffer(2), "a.wav", new Float32Array(32000));
    const playback = new AudioPlayer(session);
    playback.play();
    audio.ctx.currentTime = 0.2;
    audio.tick();

    expect(session.playheadSec).toBeCloseTo(0.2);
    expect(session.canUndo).toBe(false);
  });

  it("elapsed past plan length stops playback", () => {
    const audio = fakeAudio();
    const session = new EditorState();
    session.loadAudio(buffer(2), "a.wav", new Float32Array(32000));
    const playback = new AudioPlayer(session);
    playback.play();
    audio.ctx.currentTime = 3;
    audio.tick();

    expect(session.isPlaying).toBe(false);
  });

  it("stale ended-callback from a previous play does not stop a newer play", () => {
    const audio = fakeAudio();
    const session = new EditorState();
    session.loadAudio(buffer(2), "a.wav", new Float32Array(32000));
    const playback = new AudioPlayer(session);
    playback.play();
    const stale = audio.sources[0].onended;
    playback.play();
    stale?.();

    expect(session.isPlaying).toBe(true);
  });

  it("refreshIfPlaying while paused does not call start", () => {
    const { starts } = fakeAudio();
    const session = new EditorState();
    session.loadAudio(buffer(2), "a.wav", new Float32Array(32000));
    const playback = new AudioPlayer(session);
    playback.refreshIfPlaying();
    expect(starts).toHaveLength(0);
  });

  it("refreshIfPlaying while playing stops then starts from the current playhead", () => {
    const { starts, stops } = fakeAudio();
    const session = new EditorState();
    session.loadAudio(buffer(2), "a.wav", new Float32Array(32000));
    const playback = new AudioPlayer(session);
    playback.play();
    const started = starts.length;
    session.setPreview("edited");
    playback.refreshIfPlaying();

    expect(stops.length).toBeGreaterThan(0);
    expect(starts.length).toBeGreaterThan(started);
    expect(session.isPlaying).toBe(true);
  });

  it("defaults to 1× playback rate", () => {
    const playback = new AudioPlayer(new EditorState());
    expect(playback.playbackRate).toBe(1);
  });

  it("at 2× sets playbackRate and halves chunk start offsets after a cut", () => {
    const audio = fakeAudio();
    const session = new EditorState();
    session.loadAudio(buffer(2), "a.wav", new Float32Array(32000));
    session.addCut({ start: 0.5, end: 1.0 });
    session.setPreview("edited");
    const playback = new AudioPlayer(session);
    playback.setRate(2);
    playback.play();

    expect(audio.sources.every((s) => s.playbackRate.value === 2)).toBe(true);
    // 1× would start chunks at 0 and 0.5; at 2× those are 0 and 0.25.
    expect(audio.starts).toEqual([0, 0.25]);
  });

  it("setRate while playing reschedules and advances playhead at the new rate", () => {
    const audio = fakeAudio();
    const session = new EditorState();
    session.loadAudio(buffer(10), "a.wav", new Float32Array(160000));
    const playback = new AudioPlayer(session);
    playback.play();
    const started = audio.starts.length;
    playback.setRate(2);

    expect(audio.stops.length).toBeGreaterThan(0);
    expect(audio.starts.length).toBeGreaterThan(started);
    expect(playback.playbackRate).toBe(2);
    expect(session.isPlaying).toBe(true);

    audio.ctx.currentTime = 1;
    audio.tick();
    expect(session.playheadSec).toBeCloseTo(2);
  });

  it("ignores rates outside the allowed presets", () => {
    const playback = new AudioPlayer(new EditorState());
    playback.setRate(1.5);
    playback.setRate(3);
    expect(playback.playbackRate).toBe(1.5);
  });
});
