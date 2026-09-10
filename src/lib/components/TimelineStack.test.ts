// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { editor } from "../editor.svelte";
import TimelineStack from "./TimelineStack.svelte";

vi.mock("../player", () => ({
  player: { seek: vi.fn(), refreshIfPlaying: vi.fn(), pause: vi.fn() },
}));

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  },
);

HTMLCanvasElement.prototype.getContext = () =>
  ({
    setTransform() {},
    clearRect() {},
    fillRect() {},
    fill() {},
    stroke() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    strokeRect() {},
    save() {},
    restore() {},
    clip() {},
    rect() {},
    scale() {},
  }) as unknown as CanvasRenderingContext2D;

let component: ReturnType<typeof mount>;
let target: HTMLDivElement;

beforeEach(() => {
  editor.loadAudio(
    { duration: 10, sampleRate: 16000 } as AudioBuffer,
    "a.wav",
    new Float32Array(160000),
  );
  editor.addTrack(
    { duration: 10, sampleRate: 16000 } as AudioBuffer,
    "b.wav",
    new Float32Array(160000),
  );
  target = document.createElement("div");
  document.body.append(target);
});

afterEach(async () => {
  await unmount(component);
  target.remove();
});

describe("compact audio strip", () => {
  it("drops ruler, cut lane and lane chrome while keeping the waveforms", () => {
    component = mount(TimelineStack, { target, props: { compact: true } });
    flushSync();
    expect(target.querySelector(".stage")?.classList.contains("compact")).toBe(true);
    expect(target.querySelector('[aria-label="Seek on time ruler"]')).toBeNull();
    expect(target.querySelector(".cut-lane")).toBeNull();
    expect(target.querySelector('[aria-label="Waveform vertical zoom"]')).toBeNull();
    expect(target.querySelectorAll("[data-track-lane]")).toHaveLength(2);
    expect(target.querySelectorAll("canvas.tweak")).toHaveLength(2);
    expect(target.textContent).toContain(editor.tracks[0].speaker);
  });

  it("keeps the full arrange chrome when it is the main view", () => {
    component = mount(TimelineStack, { target, props: { compact: false } });
    flushSync();
    expect(target.querySelector('[aria-label="Seek on time ruler"]')).toBeTruthy();
    expect(target.querySelector(".cut-lane")).toBeTruthy();
    expect(target.querySelectorAll('[aria-label="Waveform vertical zoom"]')).toHaveLength(2);
    expect(target.querySelector("canvas.tweak")).toBeNull();
  });
});
