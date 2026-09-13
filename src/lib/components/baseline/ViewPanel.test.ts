// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import ViewPanel from "./ViewPanel.svelte";

let component: ReturnType<typeof mount>;
let target: HTMLDivElement;

beforeEach(() => {
  target = document.createElement("div");
  document.body.append(target);
});

afterEach(async () => {
  if (component) await unmount(component);
  target.remove();
});

describe("view panel collapse", () => {
  it("keeps the body mounted when collapsed and expands via the title", () => {
    const onexpand = vi.fn();
    component = mount(ViewPanel, {
      target,
      props: {
        title: "Transcript",
        open: false,
        collapsible: false,
        onexpand,
      },
    });
    flushSync();
    expect(target.querySelector(".collapsed")).toBeTruthy();
    expect(target.querySelector(".body")).toBeTruthy();
    const title = Array.from(target.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Transcript",
    )!;
    title.click();
    flushSync();
    expect(onexpand).toHaveBeenCalledTimes(1);
  });

  it("uses a heading when open, not an expand control", () => {
    component = mount(ViewPanel, {
      target,
      props: { title: "Audio", open: true, collapsible: false },
    });
    flushSync();
    expect(target.querySelector("h2")?.textContent).toBe("Audio");
    expect(target.querySelector(".collapsed")).toBeNull();
    expect(
      Array.from(target.querySelectorAll("button")).some(
        (button) => button.getAttribute("aria-label") === "Expand Audio",
      ),
    ).toBe(false);
  });
});
