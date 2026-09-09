// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { editor } from "../editor.svelte";
import { player } from "../player";
import type { PodcastProject } from "../projectV2";
import TranscriptPanel from "./TranscriptPanel.svelte";

vi.mock("../player", () => ({ player: { refreshIfPlaying: vi.fn(), seek: vi.fn() } }));
// Exposed via vi.hoisted so tests can spy on its prototype (see "project-provided transcript" below).
const TranscriptionMock = vi.hoisted(() => class {
  words = [
    { text: "Hello,", start: 1, end: 1.5 },
    { text: "world!", start: 1.6, end: 2.2 },
    { text: "Next", start: 4, end: 4.4 },
  ];
  modelChecked = true; modelReady = true; connected = true; busy = false;
  error = null; completed = true; invalidated = false;
  init() {} dispose() {} setAudio() {}
  restore(words: { text: string; start: number; end: number }[], completed: boolean) { this.words = words; this.completed = completed; }
});
vi.mock("../transcription.svelte", () => ({ Transcription: TranscriptionMock }));

let component: ReturnType<typeof mount>;
let target: HTMLDivElement;
function button(text: string): HTMLButtonElement {
  return Array.from(target.querySelectorAll("button")).find(b => b.textContent?.includes(text))!;
}
function pointer(element: Element) { element.dispatchEvent(new Event("pointerup", { bubbles: true })); flushSync(); }
function key(element: Element, key: string, shiftKey = false) {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true })); flushSync();
}
beforeEach(() => {
  vi.mocked(player.seek).mockImplementation(sec => editor.setPlayhead(sec));
  vi.mocked(player.seek).mockClear();
  vi.mocked(player.refreshIfPlaying).mockClear();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  editor.loadAudio({ duration: 10, sampleRate: 16000 } as AudioBuffer, "test.wav", new Float32Array(160000));
  target = document.createElement("div"); document.body.append(target);
  component = mount(TranscriptPanel, { target }); flushSync();
  button("Edit by text").click(); flushSync();
});
afterEach(async () => { window.getSelection()?.removeAllRanges(); await unmount(component); target.remove(); });

describe("transcript panel selection", () => {
  it("moves the playhead on a word click", () => {
    pointer(target.querySelector('[data-word="1"]')!);
    expect(editor.playheadSec).toBe(1.6);
  });
  it("a new word click replaces a browser highlight that has not collapsed yet", () => {
    const first = target.querySelector('[data-word="0"]')!.firstChild!;
    const last = target.querySelector('[data-word="2"]')!.firstChild!;
    window.getSelection()!.setBaseAndExtent(first, 0, last, 2);
    document.dispatchEvent(new Event("selectionchange")); flushSync();
    const word = target.querySelector('[data-word="1"]')!;
    word.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 }));
    word.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 10, clientY: 10 })); flushSync();
    expect([editor.selectionStartSec, editor.selectionEndSec]).toEqual([1.6, 2.2]);
    expect(editor.playheadSec).toBe(1.6);
  });
  it("updates the audio range on selectionchange without another click", () => {
    const first = target.querySelector('[data-word="0"]')!.firstChild!;
    const last = target.querySelector('[data-word="2"]')!.firstChild!;
    window.getSelection()!.setBaseAndExtent(first, 2, last, 2);
    document.dispatchEvent(new Event("selectionchange")); flushSync();
    expect([editor.selectionStartSec, editor.selectionEndSec]).toEqual([1, 4.4]);
    button("Mark selection").click(); flushSync();
    expect(editor.rawMarkers).toEqual([{ start: 1, end: 4.4 }]);
  });
  it("finalizes a drag on release without turning it into a word click", () => {
    const first = target.querySelector('[data-word="0"]')!;
    const last = target.querySelector('[data-word="2"]')!;
    first.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 }));
    last.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 80, clientY: 30 }));
    window.getSelection()!.setBaseAndExtent(first.firstChild!, 0, last.firstChild!, 2);
    document.dispatchEvent(new Event("selectionchange")); flushSync();
    last.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 80, clientY: 30 })); flushSync();
    expect([editor.selectionStartSec, editor.selectionEndSec]).toEqual([1, 4.4]);
    expect(player.seek).not.toHaveBeenCalled();
  });
  it("keeps the range available when Mark takes focus and the browser selection collapses", () => {
    const first = target.querySelector('[data-word="0"]')!.firstChild!;
    const last = target.querySelector('[data-word="2"]')!.firstChild!;
    target.querySelector('.words')!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    window.getSelection()!.setBaseAndExtent(first, 0, last, 2);
    document.dispatchEvent(new Event("selectionchange")); flushSync();
    const mark = button("Mark selection");
    mark.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    mark.focus(); window.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange")); flushSync();
    mark.click(); flushSync();
    expect(editor.rawMarkers).toEqual([{ start: 1, end: 4.4 }]);
  });
  it("updates a drag without seeking or rebuilding playback on each change", () => {
    editor.isPlaying = true;
    const first = target.querySelector('[data-word="0"]')!.firstChild!;
    for (const index of [1, 2]) {
      const last = target.querySelector(`[data-word="${index}"]`)!.firstChild!;
      window.getSelection()!.setBaseAndExtent(first, 0, last, 2);
      document.dispatchEvent(new Event("selectionchange")); flushSync();
    }
    expect(editor.selectionEndSec).toBe(4.4);
    expect(player.seek).not.toHaveBeenCalled();
    expect(player.refreshIfPlaying).not.toHaveBeenCalled();
  });
  it("clears a selection when clicking transcript whitespace", () => {
    pointer(target.querySelector('[data-word="1"]')!);
    window.getSelection()?.removeAllRanges();
    pointer(target.querySelector('.words p')!);
    expect(editor.hasSelection).toBe(false);
  });
  it("highlights the current word as the playhead moves and clears it in gaps", () => {
    editor.setPlayhead(1.2); flushSync();
    expect(target.querySelector('[data-word="0"]')?.getAttribute("aria-current")).toBe("true");
    editor.setPlayhead(1.8); flushSync();
    expect(target.querySelector('[data-word="1"]')?.getAttribute("aria-current")).toBe("true");
    expect(target.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
    editor.setPlayhead(3); flushSync();
    expect(target.querySelectorAll('[aria-current="true"]')).toHaveLength(0);
  });
  it("selects a word without marking, reveals the full timeline and marks only on request", () => {
    editor.setSelection(0, 5); editor.markSelection(); editor.setViewFilter("hideMarked"); editor.clearSelection();
    const span = target.querySelector('[data-word="1"]')!;
    pointer(span);
    expect(editor.viewFilter).toBe("all");
    expect([editor.selectionStartSec, editor.selectionEndSec]).toEqual([1.6, 2.2]);
    expect(editor.rawMarkers).toEqual([{ start: 0, end: 5 }]);
    button("Unmark selection").click(); flushSync();
    expect(editor.rawMarkers).toEqual([{ start: 0, end: 1.6 }, { start: 2.2, end: 5 }]);
    editor.undo(); expect(editor.rawMarkers).toEqual([{ start: 0, end: 5 }]);
  });
  it("maps a reverse native text selection across paragraphs and partial words", () => {
    const first = target.querySelector('[data-word="0"]')!.firstChild!;
    const last = target.querySelector('[data-word="2"]')!.firstChild!;
    window.getSelection()!.setBaseAndExtent(last, 2, first, 3);
    pointer(target.querySelector('[data-word="0"]')!);
    expect([editor.selectionStartSec, editor.selectionEndSec]).toEqual([1, 4.4]);
    expect(editor.rawMarkers).toEqual([]);
    button("Mark selection").click(); flushSync();
    expect(editor.rawMarkers).toEqual([{ start: 1, end: 4.4 }]);
    expect(target.querySelectorAll(".marked")).toHaveLength(3);
  });
  it("extends keyboard selection and supports clearing without stale native reselection", () => {
    const root = target.querySelector('[role="textbox"]')!;
    pointer(target.querySelector('[data-word="0"]')!);
    key(root, "ArrowRight", true);
    expect([editor.selectionStartSec, editor.selectionEndSec]).toEqual([1, 2.2]);
    key(root, "End", true);
    expect([editor.selectionStartSec, editor.selectionEndSec]).toEqual([1, 4.4]);
    button("Clear").click(); flushSync();
    expect(editor.hasSelection).toBe(false);
    key(root, "Home"); expect([editor.selectionStartSec, editor.selectionEndSec]).toEqual([1, 1.5]);
  });
  it("preserves the anchor when extending a reverse drag with the keyboard", () => {
    const first = target.querySelector('[data-word="1"]')!.firstChild!;
    const last = target.querySelector('[data-word="2"]')!.firstChild!;
    window.getSelection()!.setBaseAndExtent(last, 2, first, 3);
    pointer(target.querySelector('[data-word="1"]')!);
    key(target.querySelector('[role="textbox"]')!, "ArrowLeft", true);
    expect([editor.selectionStartSec, editor.selectionEndSec]).toEqual([1, 4.4]);
  });
  it("does not include a word when native selection ends exactly at its start", () => {
    const first = target.querySelector('[data-word="0"]')!.firstChild!;
    const second = target.querySelector('[data-word="1"]')!.firstChild!;
    window.getSelection()!.setBaseAndExtent(first, 2, second, 0);
    pointer(target.querySelector('[data-word="1"]')!);
    expect([editor.selectionStartSec, editor.selectionEndSec]).toEqual([1, 1.5]);
  });
});

describe("project-provided transcript", () => {
  it("mirrors a completed transcription into the project for saving", () => {
    // The mocked runner starts already `completed: true` — mounting alone
    // exercises the mirror effect (see TranscriptPanel's second `$effect`).
    expect(editor.transcriptStatus).toBe("complete");
    expect(editor.transcriptWords).toEqual([
      { text: "Hello,", start: 1, end: 1.5 },
      { text: "world!", start: 1.6, end: 2.2 },
      { text: "Next", start: 4, end: 4.4 },
    ]);
  });

  it("seeds the job runner from a project's saved transcript on load, without starting a new job", async () => {
    await unmount(component);
    editor.loadAudio(
      { duration: 10, sampleRate: 16000 } as AudioBuffer,
      "restored.wav",
      new Float32Array(160000),
      "/x/restored.wav",
      "a".repeat(64), // matches the project's stored source.sha256 below — a genuine identity match, not a relink.
    );
    const restoredWords = [{ text: "Restored", start: 0, end: 0.6 }];
    const project: PodcastProject = {
      version: 2,
      name: "restored",
      sampleRate: 16000,
      tracks: [{
        id: "t1",
        speaker: "Speaker 1",
        source: { path: "restored.wav", name: "restored.wav", sha256: "a".repeat(64), duration: 10 },
        settings: { positiveSpeechThreshold: 0.5, minSilenceMs: 1200, bufferMs: 150, quietThresholdDb: -40 },
        detected: [],
        manualSilences: [],
        restored: [],
        transcript: { status: "complete", words: restoredWords },
      }],
      cuts: [],
      dismissed: [],
      workspace: {
        activeTrackId: "t1", preview: "edited", tab: "transcript", sidebarWidth: 320, sidebarOpen: true,
        viewStartSec: 0, viewDurationSec: 10, inSec: 0, outSec: 10, loop: false, viewFilter: "all", muteMarked: false,
      },
    };
    editor.applyProjectV2(project, "/x/restored.hre.json");

    // The fake job runner's fields aren't reactive (unlike the real
    // `Transcription`), so its DOM never re-renders off a later mutation —
    // assert on the call itself rather than on rendered words.
    const restoreSpy = vi.spyOn(TranscriptionMock.prototype, "restore");
    target = document.createElement("div"); document.body.append(target);
    component = mount(TranscriptPanel, { target }); flushSync();

    expect(restoreSpy).toHaveBeenCalledWith(editor.transcriptWords, true);
    expect(editor.transcriptWords).toEqual(restoredWords);
    restoreSpy.mockRestore();
  });
});
