// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { editor } from "../editor.svelte";
import MarksList from "./MarksList.svelte";

vi.mock("../player", () => ({ player: { refreshIfPlaying: vi.fn() } }));

const buffer = (duration = 10) => ({ duration, sampleRate: 16000 }) as AudioBuffer;

let component: ReturnType<typeof mount>;
let target: HTMLDivElement;

beforeEach(() => {
  editor.newProject();
  editor.loadAudio(buffer(), "a.wav", new Float32Array(160000), "/rec/a.wav", "a".repeat(64));
  editor.addTrack(buffer(), "b.wav", new Float32Array(160000), "/rec/b.wav", "b".repeat(64));
  editor.setBufferMs(0, editor.tracks[0]);
  editor.setBufferMs(0, editor.tracks[1]);
  target = document.createElement("div");
  document.body.append(target);
});

afterEach(async () => {
  await unmount(component);
  target.remove();
});

describe("marks list", () => {
  it("list shows all current marks", () => {
    editor.setSelection(1, 2);
    editor.markSelection(editor.tracks[0]);
    editor.addCut({ start: 5, end: 6 });
    component = mount(MarksList, { target });
    flushSync();
    expect(target.textContent).toContain("silence");
    expect(target.textContent).toContain("1.0");
    expect(target.textContent).toContain("2.0");
    expect(target.textContent).toContain("cut");
    expect(target.textContent).toContain("5.0");
    expect(target.textContent).toContain("6.0");
  });

  it("Backspace with a mark selected deletes", () => {
    editor.setSelection(1, 2);
    editor.markSelection(editor.tracks[0]);
    const id = editor.markerList.all()[0].id;
    editor.selectMarks([id]);
    component = mount(MarksList, { target });
    flushSync();
    const list = target.querySelector<HTMLElement>("[data-marks-list]");
    list?.focus();
    list?.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
    flushSync();
    expect(editor.markerList.all()).toEqual([]);
    expect(target.querySelectorAll('[role="option"]')).toHaveLength(0);
  });

  it("Change to cut applies to every selected mark", () => {
    editor.setSelection(1, 2);
    editor.markSelection(editor.tracks[0]);
    editor.setSelection(4, 5);
    editor.markSelection(editor.tracks[0]);
    editor.selectMarks(editor.markerList.all().map((marker) => marker.id));
    component = mount(MarksList, { target });
    flushSync();
    Array.from(target.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Change to cut")
      ?.click();
    flushSync();
    expect(editor.markerList.all().every((marker) => marker.type === "cut")).toBe(true);
    const options = [...target.querySelectorAll('[role="option"]')].map((el) => el.textContent ?? "");
    expect(options).toHaveLength(2);
    expect(options.every((text) => text.includes("cut"))).toBe(true);
    expect(options.some((text) => text.includes("silence"))).toBe(false);
  });
});

it("pastes markers, reports errors, and keeps typing shortcuts away from selected marks", () => {
  editor.addCut({ start: 1, end: 2 });
  const before = editor.markerList.all();
  editor.selectMarks([before[0].id]);
  component = mount(MarksList, { target });
  flushSync();
  const textarea = target.querySelector("textarea")!;
  textarea.focus();
  textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
  textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true }));
  expect(editor.markerList.all()).toEqual(before);
  const add = [...target.querySelectorAll("button")].find(button => button.textContent?.trim() === "Add markers")!;
  textarea.value = "invalid";
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
  add.click();
  flushSync();
  expect(target.querySelector('[role="alert"]')?.textContent).toContain("Invalid JSON");
  expect(textarea.value).toBe("invalid");
  textarea.value = JSON.stringify({ markers: [{ type: "export", start: "00:03.0", end: "00:04.0", speakers: [editor.tracks[1].speaker] }] });
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
  add.click();
  flushSync();
  expect(target.querySelector('[role="alert"]')).toBeNull();
  expect(textarea.value).toBe("");
  expect(editor.markerList.all()).toHaveLength(2);
  editor.undo();
  expect(editor.markerList.all()).toEqual(before);
});
