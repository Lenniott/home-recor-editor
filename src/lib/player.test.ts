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
});
