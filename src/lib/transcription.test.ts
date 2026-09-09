import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ invoke: vi.fn(), listener: null as null | ((event: { payload: unknown }) => void) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocked.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async (_event, callback) => { mocked.listener = callback; return vi.fn(); }) }));
import { Transcription } from "./transcription.svelte";
import { EditorState } from "./editor.svelte";
import { selectedWordRange } from "./transcript";

const audio = () => ({ duration: 10, sampleRate: 16000, length: 160000, numberOfChannels: 1, getChannelData: () => new Float32Array(160000), copyFromChannel() {}, copyToChannel() {} }) as AudioBuffer;
const result = { transcription: [{ text: " hello", offsets: { from: 1000, to: 2000 } }] };
function event(jobId: string, phase: string, extra = {}) { mocked.listener?.({ payload: { jobId, phase, percent: null, error: null, result: null, ...extra } }); }
beforeEach(() => {
  mocked.invoke.mockReset().mockResolvedValue(true);
  vi.stubGlobal("Worker", class {
    onmessage?: (event: unknown) => void;
    postMessage() { queueMicrotask(() => this.onmessage?.({ data: { bytes: new Uint8Array(44) } })); }
    terminate() {}
  });
  vi.stubGlobal("OfflineAudioContext", class {
    destination = {};
    createBufferSource() { return { connect() {}, start() {} }; }
    createChannelSplitter() { return { connect() {} }; }
    createGain() { return { gain: { value: 1 }, connect() {} }; }
    async startRendering() { return audio(); }
  });
});

describe("transcription lifecycle", () => {
  it("accepts only the active job and clears results when audio is replaced", async () => {
    const state = new Transcription(); await state.init(); state.setAudio(audio());
    await state.transcribe();
    const id = mocked.invoke.mock.calls.find(c => c[0] === "start_transcription")![2].headers["x-job-id"];
    event("old-job", "complete", { result }); expect(state.words).toEqual([]);
    event(id, "complete", { result }); expect(state.words).toHaveLength(1);
    state.setAudio(audio()); expect(state.words).toEqual([]); expect(state.invalidated).toBe(true);
  });
  it("ignores completion after cancellation and permits a retry once finished", async () => {
    const state = new Transcription(); await state.init(); state.setAudio(audio()); await state.transcribe();
    const id = mocked.invoke.mock.calls.find(c => c[0] === "start_transcription")![2].headers["x-job-id"];
    state.setAudio(audio());
    expect(state.phase).toBe("cancelling");
    event(id, "complete", { result }); expect(state.words).toEqual([]); expect(state.busy).toBe(false);
    await state.transcribe(); expect(state.busy).toBe(true);
  });
  it("reports download failure and supports retry, interruption and successful setup", async () => {
    mocked.invoke.mockResolvedValue(false);
    const state = new Transcription(); await state.init(); await state.download();
    let id = mocked.invoke.mock.calls.at(-1)![1].jobId;
    event(id, "error", { error: "Network unavailable" });
    expect(state.error).toBe("Network unavailable"); expect(state.modelReady).toBe(false);
    await state.download(); id = mocked.invoke.mock.calls.at(-1)![1].jobId;
    await state.cancel(); event(id, "cancelled"); expect(state.modelReady).toBe(false);
    await state.download(); id = mocked.invoke.mock.calls.at(-1)![1].jobId;
    event(id, "complete"); expect(state.modelReady).toBe(true);
  });
  it("discards audio preparation that finishes after cancellation", async () => {
    let complete!: (buffer: AudioBuffer) => void;
    vi.stubGlobal("OfflineAudioContext", class {
      destination = {};
      createBufferSource() { return { connect() {}, start() {} }; }
      createChannelSplitter() { return { connect() {} }; }
      createGain() { return { gain: { value: 1 }, connect() {} }; }
      startRendering() { return new Promise<AudioBuffer>(resolve => complete = resolve); }
    });
    const state = new Transcription(); await state.init(); state.setAudio(audio());
    const pending = state.transcribe();
    await state.cancel(); complete(audio()); await pending;
    expect(state.busy).toBe(false);
    expect(mocked.invoke.mock.calls.some(c => c[0] === "start_transcription")).toBe(false);
  });
  it("surfaces a failed start and lets the user retry", async () => {
    const state = new Transcription(); await state.init(); state.setAudio(audio());
    mocked.invoke.mockRejectedValueOnce(new Error("Engine unavailable"));
    await state.transcribe(); expect(state.error).toContain("Engine unavailable"); expect(state.busy).toBe(false);
    await state.transcribe(); expect(state.busy).toBe(true); expect(state.error).toBeNull();
  });
  it("finishes silent audio without starting the recognizer", async () => {
    vi.stubGlobal("Worker", class {
      onmessage?: (event: unknown) => void;
      postMessage() { queueMicrotask(() => this.onmessage?.({ data: { silent: true } })); }
      terminate() {}
    });
    const state = new Transcription(); await state.init(); state.setAudio(audio()); await state.transcribe();
    expect(state.completed).toBe(true); expect(state.busy).toBe(false); expect(state.words).toEqual([]);
    expect(mocked.invoke.mock.calls.some(c => c[0] === "start_transcription")).toBe(false);
  });
  it("handles empty speech output without presenting an error", async () => {
    const state = new Transcription(); await state.init(); state.setAudio(audio()); await state.transcribe();
    const id = mocked.invoke.mock.calls.find(c => c[0] === "start_transcription")![2].headers["x-job-id"];
    event(id, "complete", { result: { transcription: [] } });
    expect(state.completed).toBe(true); expect(state.error).toBeNull(); expect(state.words).toEqual([]);
  });
});

describe("text ranges in the real editor", () => {
  it("marks, merges, unmasks and undoes a word range using existing buffer semantics", () => {
    const editor = new EditorState(); editor.loadAudio(audio(), "test.wav", new Float32Array(160000));
    const range = selectedWordRange([{ text: "hello", start: 1, end: 2 }, { text: "world", start: 2.2, end: 3 }], 0, 1)!;
    editor.setSelection(range.start, range.end); editor.markSelection();
    expect(editor.rawMarkers).toEqual([{ start: 1, end: 3 }]);
    expect(editor.markedIntervals[0].start).toBeGreaterThanOrEqual(1);
    expect(editor.markedIntervals[0].end).toBeLessThanOrEqual(3);
    editor.setSelection(2.5, 4); editor.markSelection(); expect(editor.rawMarkers).toEqual([{ start: 1, end: 4 }]);
    editor.undo(); expect(editor.rawMarkers).toEqual([{ start: 1, end: 3 }]);
    editor.redo(); expect(editor.rawMarkers).toEqual([{ start: 1, end: 4 }]);
    editor.setSelection(2, 3); editor.unmarkSelection(); expect(editor.rawMarkers).toEqual([{ start: 1, end: 2 }, { start: 3, end: 4 }]);
  });
});
