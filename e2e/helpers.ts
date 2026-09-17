import { expect, type Page } from "@playwright/test";

export const ALEX = "/virtual/Alex.wav";
export const SAM = "/virtual/Sam.wav";
export const PROJECT = "/virtual/show.hre.json";
export const DURATION_SEC = 10;

type TestDesktopIo = {
  files: Record<string, Uint8Array | string>;
  pickFiles?: string[] | null;
  pickFile?: string | null;
  pickSave?: string | null;
  pickDirectory?: string | null;
};

export async function installDesktop(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let callback = 0;
    Object.assign(window, {
      __HRE_TEST__: { files: {} },
      __TAURI_INTERNALS__: {
        transformCallback: () => ++callback,
        invoke: async (cmd: string) => (cmd === "transcription_model_status" ? true : 1),
      },
    });
  });
}

export async function gotoEditor(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Transcribe all tracks", exact: true })).toBeVisible();
}

async function registerShow(page: Page): Promise<void> {
  await page.evaluate(
    ({ alexPath, samPath, projectPath, durationSec }) => {
      const pcmWav = (frequency: number) => {
        const sampleRate = 16000;
        const frames = durationSec * sampleRate;
        const dataSize = frames * 2;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);
        const ascii = (offset: number, text: string) => {
          for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
        };
        ascii(0, "RIFF");
        view.setUint32(4, 36 + dataSize, true);
        ascii(8, "WAVE");
        ascii(12, "fmt ");
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        ascii(36, "data");
        view.setUint32(40, dataSize, true);
        for (let i = 0; i < frames; i++) {
          const s =
            Math.sin((i * frequency) / sampleRate) * 0.55 * Math.max(0, Math.sin((i / sampleRate) * 2));
          view.setInt16(44 + i * 2, Math.round(s * 0x7fff), true);
        }
        return new Uint8Array(buffer);
      };
      const io = (window as unknown as { __HRE_TEST__: TestDesktopIo }).__HRE_TEST__;
      io.files[alexPath] = pcmWav(220);
      io.files[samPath] = pcmWav(330);
      io.files[projectPath] = JSON.stringify({
        version: 2,
        name: "show",
        sampleRate: 16000,
        tracks: [
          {
            id: "t1",
            speaker: "Alex",
            source: { path: "Alex.wav", name: "Alex.wav", sha256: "pending", duration: durationSec },
            settings: { positiveSpeechThreshold: 0.5, minSilenceMs: 1200, bufferMs: 150, quietThresholdDb: -40 },
            detected: [],
            manualSilences: [],
            restored: [],
            transcript: {
              status: "complete",
              words: [
                { text: "Welcome", start: 1, end: 1.5 },
                { text: "to", start: 1.6, end: 1.8 },
                { text: "the podcast.", start: 1.9, end: 2.8 },
                { text: "How was your week?", start: 5, end: 6.5 },
              ],
            },
          },
          {
            id: "t2",
            speaker: "Sam",
            source: { path: "Sam.wav", name: "Sam.wav", sha256: "pending", duration: durationSec },
            settings: { positiveSpeechThreshold: 0.5, minSilenceMs: 1200, bufferMs: 150, quietThresholdDb: -40 },
            detected: [],
            manualSilences: [],
            restored: [],
            transcript: {
              status: "complete",
              words: [
                { text: "Thanks for having me.", start: 3, end: 4.5 },
                { text: "Really good!", start: 6, end: 7.5 },
              ],
            },
          },
        ],
        cuts: [],
        dismissed: [],
        workspace: {
          activeTrackId: "t1",
          preview: "original",
          tab: "transcript",
          sidebarWidth: 320,
          sidebarOpen: true,
          viewStartSec: 0,
          viewDurationSec: durationSec,
          inSec: 0,
          outSec: durationSec,
          loop: false,
          viewFilter: "all",
          muteMarked: false,
        },
      });
    },
    { alexPath: ALEX, samPath: SAM, projectPath: PROJECT, durationSec: DURATION_SEC },
  );

  await page.evaluate(async ({ alexPath, samPath, projectPath }) => {
    const hex = async (bytes: Uint8Array) =>
      [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    const io = (window as unknown as { __HRE_TEST__: TestDesktopIo }).__HRE_TEST__;
    const alex = io.files[alexPath] as Uint8Array;
    const sam = io.files[samPath] as Uint8Array;
    const project = JSON.parse(io.files[projectPath] as string);
    project.tracks[0].source.sha256 = await hex(alex);
    project.tracks[1].source.sha256 = await hex(sam);
    io.files[projectPath] = JSON.stringify(project);
  }, { alexPath: ALEX, samPath: SAM, projectPath: PROJECT });
}

export async function setPicks(
  page: Page,
  picks: Partial<Pick<TestDesktopIo, "pickFiles" | "pickFile" | "pickSave" | "pickDirectory">>,
): Promise<void> {
  await page.evaluate((next) => {
    const io = (window as unknown as { __HRE_TEST__: TestDesktopIo }).__HRE_TEST__;
    Object.assign(io, next);
  }, picks);
}

export async function fileMenu(page: Page, item: string): Promise<void> {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

export async function importPaths(page: Page, files: string[]): Promise<void> {
  await setPicks(page, { pickFiles: files });
  await fileMenu(page, "Import");
}

export async function openProject(page: Page, path: string): Promise<void> {
  await setPicks(page, { pickFile: path });
  await fileMenu(page, "Open");
}

export async function seed(page: Page): Promise<void> {
  await installDesktop(page);
  await gotoEditor(page);
  await registerShow(page);
  await importPaths(page, [ALEX, SAM]);
  await expect(page.locator("[data-track-lane]")).toHaveCount(2);
  await openProject(page, PROJECT);
  await expect(page.locator("[data-track-lane]")).toHaveCount(2);
  await expect(page.locator("[data-word]").first()).toBeVisible();
}

export async function importOneVirtualWav(page: Page): Promise<void> {
  await installDesktop(page);
  await gotoEditor(page);
  await registerShow(page);
  await importPaths(page, [ALEX]);
}

export async function virtualText(page: Page, path: string): Promise<string | null> {
  return page.evaluate((filePath) => {
    const data = (window as unknown as { __HRE_TEST__: TestDesktopIo }).__HRE_TEST__.files[filePath];
    return typeof data === "string" ? data : null;
  }, path);
}

export async function virtualBytes(page: Page, path: string): Promise<number[] | null> {
  return page.evaluate((filePath) => {
    const data = (window as unknown as { __HRE_TEST__: TestDesktopIo }).__HRE_TEST__.files[filePath];
    return data instanceof Uint8Array ? [...data] : null;
  }, path);
}

export async function registerLongTranscript(page: Page): Promise<void> {
  await page.evaluate(({ projectPath }) => {
    const io = (window as unknown as { __HRE_TEST__: TestDesktopIo }).__HRE_TEST__;
    const project = JSON.parse(io.files[projectPath] as string);
    project.tracks[0].transcript.words = Array.from({ length: 5000 }, (_, i) => ({
      text: `word${i}`,
      start: i * 0.001,
      end: i * 0.001 + 0.0008,
    }));
    project.tracks[1].transcript.words = [];
    io.files[projectPath] = JSON.stringify(project);
  }, { projectPath: PROJECT });
}
