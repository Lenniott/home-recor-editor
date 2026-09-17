// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import FileMenu from "./FileMenu.svelte";

HTMLDialogElement.prototype.showModal = function showModal() {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function close() {
  this.removeAttribute("open");
};

let component: ReturnType<typeof mount>;
let target: HTMLDivElement;

function noop(): void {}
async function noopExport(): Promise<void> {}

afterEach(async () => {
  await unmount(component);
  target.remove();
});

describe("FileMenu export", () => {
  it("File menu says Merge not Mix", () => {
    target = document.createElement("div");
    document.body.append(target);
    component = mount(FileMenu, {
      target,
      props: {
        twoTrack: true,
        canExport: true,
        open: true,
        onSave: noop,
        onSaveAs: noop,
        onOpen: noop,
        onNew: noop,
        onImport: noop,
        onAddRecording: noop,
        onExport: noopExport,
        onExportReset: noop,
      },
    });
    flushSync();
    const exportItem = Array.from(target.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Export",
    );
    exportItem?.click();
    flushSync();
    expect(target.textContent).toContain("Combined merge");
    expect(target.textContent).not.toMatch(/mix/i);
  });

  it("clips control is disabled when exportMarkCount is 0", () => {
    target = document.createElement("div");
    document.body.append(target);
    component = mount(FileMenu, {
      target,
      props: {
        twoTrack: true,
        canExport: true,
        exportMarkCount: 0,
        open: true,
        onSave: noop,
        onSaveAs: noop,
        onOpen: noop,
        onNew: noop,
        onImport: noop,
        onAddRecording: noop,
        onExport: noopExport,
        onExportReset: noop,
      },
    });
    flushSync();
    Array.from(target.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Export")
      ?.click();
    flushSync();
    const clips = target.querySelector<HTMLInputElement>('[name="export-scope"][value="clips"]')
      ?? Array.from(target.querySelectorAll("button,input,label")).find((el) =>
        /clips/i.test(el.textContent ?? el.getAttribute("aria-label") ?? ""),
      );
    expect(clips).toBeTruthy();
    if (clips instanceof HTMLButtonElement || clips instanceof HTMLInputElement) {
      expect(clips.disabled).toBe(true);
    } else {
      expect(clips?.closest("button,label")?.querySelector("input")?.disabled).toBe(true);
    }
  });

  it("clips enabled when count is at least 1", () => {
    target = document.createElement("div");
    document.body.append(target);
    component = mount(FileMenu, {
      target,
      props: {
        twoTrack: true,
        canExport: true,
        exportMarkCount: 1,
        open: true,
        onSave: noop,
        onSaveAs: noop,
        onOpen: noop,
        onNew: noop,
        onImport: noop,
        onAddRecording: noop,
        onExport: noopExport,
        onExportReset: noop,
      },
    });
    flushSync();
    Array.from(target.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Export")
      ?.click();
    flushSync();
    const clips = target.querySelector<HTMLInputElement>('[name="export-scope"][value="clips"]');
    expect(clips?.disabled).toBe(false);
  });

  it("onExport receives scope, layout, and channels", async () => {
    const received: unknown[] = [];
    target = document.createElement("div");
    document.body.append(target);
    component = mount(FileMenu, {
      target,
      props: {
        twoTrack: true,
        canExport: true,
        exportMarkCount: 2,
        open: true,
        onSave: noop,
        onSaveAs: noop,
        onOpen: noop,
        onNew: noop,
        onImport: noop,
        onAddRecording: noop,
        onExport: async (request) => {
          received.push(request);
        },
        onExportReset: noop,
      },
    });
    flushSync();
    Array.from(target.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Export")
      ?.click();
    flushSync();
    target.querySelector<HTMLInputElement>('[name="export-scope"][value="clips"]')?.click();
    target.querySelector<HTMLInputElement>('[name="export-channels"][value="mono"]')?.click();
    flushSync();
    Array.from(target.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Combined merge")
      ?.click();
    flushSync();
    await Promise.resolve();
    expect(received).toEqual([
      { scope: "clips", layout: "merge", channels: "mono", includeAudio: true, includeTranscript: false, applyEdits: true },
    ]);
  });

  it("disabled clips does not open a destination picker", async () => {
    const received: unknown[] = [];
    target = document.createElement("div");
    document.body.append(target);
    component = mount(FileMenu, {
      target,
      props: {
        twoTrack: true,
        canExport: true,
        exportMarkCount: 0,
        open: true,
        onSave: noop,
        onSaveAs: noop,
        onOpen: noop,
        onNew: noop,
        onImport: noop,
        onAddRecording: noop,
        onExport: async (request) => {
          received.push(request);
        },
        onExportReset: noop,
      },
    });
    flushSync();
    Array.from(target.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Export")
      ?.click();
    flushSync();
    target.querySelector<HTMLInputElement>('[name="export-scope"][value="clips"]')?.click();
    flushSync();
    Array.from(target.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Combined merge")
      ?.click();
    flushSync();
    await Promise.resolve();
    expect(received).toEqual([
      { scope: "all", layout: "merge", channels: "stereo", includeAudio: true, includeTranscript: false, applyEdits: true },
    ]);
  });

  it("File → Export transcript opens the same dialog with Audio off", () => {
    target = document.createElement("div");
    document.body.append(target);
    component = mount(FileMenu, {
      target,
      props: {
        twoTrack: true,
        canExport: true,
        open: true,
        onSave: noop,
        onSaveAs: noop,
        onOpen: noop,
        onNew: noop,
        onImport: noop,
        onAddRecording: noop,
        onExport: noopExport,
        onExportReset: noop,
      },
    });
    flushSync();
    Array.from(target.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Export transcript…")
      ?.click();
    flushSync();
    const audio = target.querySelector<HTMLInputElement>('[name="export-include-audio"]');
    const transcript = target.querySelector<HTMLInputElement>('[name="export-include-transcript"]');
    expect(audio?.checked).toBe(false);
    expect(transcript?.checked).toBe(true);
    expect(target.querySelector("#export-title")).toBeTruthy();
  });

  it("openAsTranscript opens the same dialog with Audio off", () => {
    target = document.createElement("div");
    document.body.append(target);
    component = mount(FileMenu, {
      target,
      props: {
        twoTrack: true,
        canExport: true,
        openAsTranscript: true,
        onSave: noop,
        onSaveAs: noop,
        onOpen: noop,
        onNew: noop,
        onImport: noop,
        onAddRecording: noop,
        onExport: noopExport,
        onExportReset: noop,
      },
    });
    flushSync();
    const audio = target.querySelector<HTMLInputElement>('[name="export-include-audio"]');
    const transcript = target.querySelector<HTMLInputElement>('[name="export-include-transcript"]');
    expect(audio?.checked).toBe(false);
    expect(transcript?.checked).toBe(true);
  });
});
