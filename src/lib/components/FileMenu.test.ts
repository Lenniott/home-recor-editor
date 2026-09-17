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
});
