// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { editor } from "../editor.svelte";
import { player } from "../player";
import CutLane from "./CutLane.svelte";

vi.mock("../player", () => ({ player: { audition: vi.fn(), refreshIfPlaying: vi.fn() } }));

// `bind:clientWidth` observes the strip; jsdom reports 0 for every box, which
// is fine here — this exercises the review actions, not the pixel layout.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  },
);

const buffer = (duration = 10) => ({ duration, sampleRate: 16000 }) as AudioBuffer;

let component: ReturnType<typeof mount>;
let target: HTMLDivElement;

function button(text: string): HTMLButtonElement {
  return Array.from(target.querySelectorAll("button")).find((b) => b.textContent?.trim() === text)!;
}
function labelled(name: string): HTMLButtonElement {
  return target.querySelector(`button[aria-label="${name}"]`)!;
}
function click(element: Element): void {
  (element as HTMLElement).click();
  flushSync();
}
function mark(trackIndex: number, start: number, end: number): void {
  editor.setSelection(start, end);
  editor.markSelection(editor.tracks[trackIndex]);
}

beforeEach(() => {
  vi.mocked(player.audition).mockClear();
  vi.mocked(player.refreshIfPlaying).mockClear();
  // Two synced takes, both quiet 3–6s and both quiet again 8–10s.
  editor.loadAudio(buffer(), "a.wav", new Float32Array(160000), "/rec/a.wav", "a".repeat(64));
  editor.addTrack(buffer(), "b.wav", new Float32Array(160000), "/rec/b.wav", "b".repeat(64));
  editor.setBufferMs(0, editor.tracks[0]);
  editor.setBufferMs(0, editor.tracks[1]);
  mark(0, 2, 6);
  mark(0, 8, 10);
  mark(1, 3, 7);
  mark(1, 8, 10);

  target = document.createElement("div");
  document.body.append(target);
  component = mount(CutLane, { target });
  flushSync();
});

afterEach(async () => {
  await unmount(component);
  target.remove();
});

describe("cut lane review", () => {
  it("counts the suggestions where both tracks are silent", () => {
    expect(editor.cutSuggestionList).toEqual([{ start: 3, end: 6 }, { start: 8, end: 10 }]);
    expect(target.textContent).toContain("1 / 2");
  });

  it("steps through suggestions and auditions each one", () => {
    click(labelled("Next suggestion"));
    expect(target.textContent).toContain("2 / 2");
    expect(player.audition).toHaveBeenCalledWith({ start: 8, end: 10 });

    click(labelled("Previous suggestion"));
    expect(target.textContent).toContain("1 / 2");
    expect(player.audition).toHaveBeenLastCalledWith({ start: 3, end: 6 });
  });

  it("accepts the current suggestion into the shared cuts", () => {
    click(button("Mark cut"));

    expect(editor.cuts).toEqual([{ start: 3, end: 6 }]);
    expect(editor.cutSuggestionList).toEqual([{ start: 8, end: 10 }]);
    expect(editor.displayKeptDuration).toBe(10);
    expect(target.textContent).toContain("1 cut");
  });

  it("dismisses the current suggestion without removing anything", () => {
    click(button("Dismiss"));

    expect(editor.cuts).toEqual([]);
    expect(editor.dismissed).toEqual([{ start: 3, end: 6 }]);
    expect(editor.cutSuggestionList).toEqual([{ start: 8, end: 10 }]);
    expect(editor.displayKeptDuration).toBe(10);
  });

  it("accepts every suggestion at once", () => {
    click(button("Mark all suggestions"));

    expect(editor.cuts).toEqual([{ start: 3, end: 6 }, { start: 8, end: 10 }]);
    expect(target.textContent).toContain("0 / 0");
  });

  it("selects a cut for the shared Unmark action when its band is clicked", () => {
    click(button("Mark cut"));
    const cutBand = target.querySelector<HTMLButtonElement>(".mark.cut")!;
    click(cutBand);
    expect(editor.markerAction).toBe("cut");
    expect(editor.selectionRange).toEqual({start:3,end:6});
    editor.unmarkAction();
    expect(editor.cuts).toEqual([]);
    expect(editor.displayKeptDuration).toBe(10);
  });
});
