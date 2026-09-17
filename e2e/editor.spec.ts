import { test, expect } from "@playwright/test";
import {
  ALEX,
  PROJECT,
  DURATION_SEC,
  seed,
  importOneVirtualWav,
  fileMenu,
  setPicks,
  openProject,
  virtualText,
  virtualBytes,
  registerLongTranscript,
} from "./helpers";

test("import recordings uses registered virtual wav", async ({ page }) => {
  await importOneVirtualWav(page);
  await expect(page.locator("[data-track-lane]")).toHaveCount(1);
});

test("one-lane selection, cross-lane selection, and pending cuts", async ({ page }) => {
  await seed(page);
  const canvases = page.locator("[data-track-lane] canvas");
  const a = (await canvases.nth(0).boundingBox())!;
  const b = (await canvases.nth(1).boundingBox())!;
  await page.mouse.move(a.x + a.width * 0.3, a.y + a.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width * 0.45, a.y + a.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Mark", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Mark", exact: true }).click();
  await expect(page.locator("[data-silence-mark]")).toHaveCount(1);
  await page.mouse.move(a.x + a.width * 0.6, a.y + a.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.75, b.y + b.height * 0.5, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Mark", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Cut", exact: true }).click();
  await page.getByRole("button", { name: "Mark", exact: true }).click();
  const time = page.locator('[title="Position and length with shared cuts removed"]');
  await expect(time).toContainText(`00:${DURATION_SEC.toFixed(1).padStart(4, "0")}`);
  await expect(page.locator(".mark.cut")).toHaveCount(1);
  await page.screenshot({ path: "/tmp/hre-editor-default.png" });
  await page.getByRole("button", { name: "Preview edits", exact: true }).click();
  await expect(time).not.toContainText(`00:${DURATION_SEC.toFixed(1).padStart(4, "0")}`);
});

test("merged text selection seeks, updates immediately, and layout fits minimum size", async ({ page }) => {
  await seed(page);
  await page.locator('[data-word="4"]').click();
  await expect(page.locator('[data-word="4"]')).toHaveAttribute("aria-current", "true");
  const first = page.locator('[data-word="0"]');
  const last = page.locator('[data-word="3"]');
  const a = (await first.boundingBox())!;
  const b = (await last.boundingBox())!;
  await page.mouse.move(a.x + 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 2, b.y + b.height / 2, { steps: 12 });
  await expect(page.getByRole("button", { name: "Mark", exact: true })).toBeEnabled();
  await page.mouse.up();
  await page.setViewportSize({ width: 860, height: 560 });
  await expect(page.locator("aside")).toBeHidden();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Mark", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  const actionBox = (await page.locator(".selection-bar").boundingBox())!;
  const lastLane = (await page.locator("[data-track-lane] canvas").last().boundingBox())!;
  expect(lastLane.y + lastLane.height).toBeLessThanOrEqual(actionBox.y);
  await page.getByRole("button", { name: "Cut", exact: true }).click();
  await page.getByRole("button", { name: "Mark", exact: true }).click();
  await expect(page.locator(".mark.cut")).toHaveCount(1);
  await page.screenshot({ path: "/tmp/hre-editor-minimum.png" });
});

test("long transcript selection stays responsive", async ({ page }) => {
  await seed(page);
  await registerLongTranscript(page);
  await openProject(page, PROJECT);
  await expect(page.locator("[data-word]")).toHaveCount(5000);
  const elapsed = await page.evaluate(async () => {
    const first = document.querySelector('[data-word="0"]')!.firstChild!;
    const last = document.querySelector('[data-word="20"]')!.firstChild!;
    const start = performance.now();
    window.getSelection()!.setBaseAndExtent(first, 1, last, 2);
    document.dispatchEvent(new Event("selectionchange"));
    await new Promise(requestAnimationFrame);
    return performance.now() - start;
  });
  expect(elapsed).toBeLessThan(500);
  const first = page.locator('[data-word="0"]');
  const last = page.locator('[data-word="20"]');
  await first.dragTo(last);
  await expect(page.getByRole("button", { name: "Mark", exact: true })).toBeEnabled();
});

test("Cmd zoom and cut handles use the shared timeline", async ({ page }) => {
  await seed(page);
  await page.keyboard.press("Meta+=");
  await page.keyboard.press("Meta+-");
  const canvas = (await page.locator("[data-track-lane] canvas").first().boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width * 0.2, canvas.y + canvas.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.4, canvas.y + canvas.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Cut", exact: true }).click();
  await page.getByRole("button", { name: "Mark", exact: true }).click();
  const band = (await page.locator(".mark.cut").boundingBox())!;
  await page.mouse.move(band.x + band.width - 2, band.y + band.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(band.x + band.width + 40, band.y + band.height * 0.5, { steps: 8 });
  await page.mouse.up();
  const widened = (await page.locator(".mark.cut").boundingBox())!;
  expect(widened.width).toBeGreaterThan(band.width + 30);
  await page.locator(".mark.cut").click({ position: { x: widened.width / 2, y: 10 } });
  await page.getByRole("button", { name: "Unmark", exact: true }).click();
  await expect(page.locator(".mark.cut")).toHaveCount(0);
  await page.keyboard.press("Meta+z");
  await expect(page.locator(".mark.cut")).toHaveCount(1);
});

test("single-view layout keeps a compact tweak strip", async ({ page }) => {
  await seed(page);
  await page.getByRole("radiogroup", { name: "View" }).getByRole("button", { name: "Audio", exact: true }).click();
  await expect(page.getByRole("region", { name: "Transcript caption" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Transcribe all tracks", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Seek on time ruler" })).toBeVisible();
  await page.locator('[data-word="1"]').click();
  await expect(page.locator('[data-word="1"]')).toHaveAttribute("aria-current", "true");

  await page.getByRole("radiogroup", { name: "View" }).getByRole("button", { name: "Transcript", exact: true }).click();
  await expect(page.getByRole("button", { name: "Transcribe all again", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Seek on time ruler" })).toHaveCount(0);
  await expect(page.locator("[data-track-lane] canvas")).toHaveCount(2);
  await expect(page.getByRole("slider", { name: "Waveform vertical zoom" })).toHaveCount(0);
});

test("cleanup mode, deep dB scale, bulk conversion, and simplified transport", async ({ page }) => {
  await seed(page);
  await expect(page.getByText("Loop IN–OUT")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "IN", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Show aside" }).click();
  await page.getByRole("button", { name: "cleanup", exact: true }).click();
  const vad = page.getByRole("checkbox", { name: /Use speech detection/ });
  await expect(vad).toBeChecked();
  await vad.uncheck();
  await expect(page.getByRole("button", { name: "Run silence floor only · all tracks" })).toBeVisible();
  const dbScale = page.getByRole("slider", { name: "Waveform vertical zoom" }).first();
  await expect(page.getByText("−12", { exact: true }).first()).toBeVisible();
  await dbScale.hover();
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -100);
  await expect(page.getByText("−60", { exact: true }).first()).toBeVisible();
  await dbScale.dblclick();
  await expect(dbScale).toHaveAttribute("aria-valuenow", "0");

  const canvases = page.locator("[data-track-lane] canvas");
  const a = (await canvases.nth(0).boundingBox())!;
  const b = (await canvases.nth(1).boundingBox())!;
  await page.mouse.move(a.x + a.width * 0.1, a.y + a.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width * 0.3, a.y + a.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Mark", exact: true }).click();
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Mark", exact: true }).click();
  await page.getByRole("button", { name: "edits", exact: true }).click();
  await page.getByRole("button", { name: "Convert all silences to shared cuts" }).click();
  await expect(page.locator(".mark.cut")).toHaveCount(1);
});

test("save then open restores a silence mark in the timeline", async ({ page }) => {
  await seed(page);
  const canvas = (await page.locator("[data-track-lane] canvas").first().boundingBox())!;
  const y = canvas.y + canvas.height * 0.5;
  await page.mouse.move(canvas.x + canvas.width * 0.1, y);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.2, y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Mark", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Mark", exact: true }).click();
  await expect(page.locator("[data-silence-mark]")).toHaveCount(1);
  await fileMenu(page, "Save");
  const saved = JSON.parse((await virtualText(page, PROJECT))!);
  const marked = saved.tracks[0].manualSilences[0];
  expect(marked.start).toBeCloseTo(1, 1);
  expect(marked.end).toBeCloseTo(2, 1);
  await fileMenu(page, "New");
  await expect(page.locator("[data-track-lane]")).toHaveCount(0);
  await openProject(page, PROJECT);
  await expect(page.locator("[data-silence-mark]")).toHaveCount(1);
  await expect(page.locator(".mark.cut")).toHaveCount(0);
});

test("export mix writes a stereo wav to the virtual folder", async ({ page }) => {
  await seed(page);
  await fileMenu(page, "Export");
  await setPicks(page, { pickDirectory: "/virtual/out" });
  await page.getByRole("button", { name: "Combined mix" }).click();
  await expect(page.getByText("Exported")).toBeVisible({ timeout: 30000 });
  const bytes = await virtualBytes(page, "/virtual/out/Alex-mix.wav");
  expect(bytes).not.toBeNull();
  const channels = new DataView(new Uint8Array(bytes!).buffer).getUint16(22, true);
  expect(channels).toBe(2);
});

test("dragging a silence edge into a neighbor merges on pointer up", async ({ page }) => {
  await seed(page);
  const canvas = page.locator("[data-track-lane] canvas").first();
  const box = (await canvas.boundingBox())!;
  const y = box.y + box.height * 0.5;
  await page.mouse.move(box.x + box.width * 0.2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.35, y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Mark", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Mark", exact: true }).click();
  await page.mouse.move(box.x + box.width * 0.4, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Mark", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Mark", exact: true }).click();
  const marks = page.locator("[data-silence-mark]");
  await expect(marks).toHaveCount(2);
  const second = (await marks.nth(1).boundingBox())!;
  await page.mouse.move(second.x + 2, y);
  await page.mouse.down();
  await expect(marks).toHaveCount(2);
  await page.mouse.move(second.x - box.width * 0.2, y, { steps: 12 });
  await expect(marks).toHaveCount(2);
  await page.mouse.up();
  await expect(page.locator("[data-silence-mark]")).toHaveCount(1);
  await expect(page.locator(".mark.cut")).toHaveCount(0);
});
