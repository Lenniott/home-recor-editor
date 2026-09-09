import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { parseTranscript, type TranscriptWord } from "./transcript";

interface Progress { jobId: string; phase: string; percent: number | null; result: unknown; error: string | null }

export class Transcription {
  words: TranscriptWord[] = $state([]);
  phase = $state("idle");
  percent: number | null = $state(null);
  error: string | null = $state(null);
  modelReady = $state(false);
  modelChecked = $state(false);
  connected = $state(false);
  completed = $state(false);
  invalidated = $state(false);
  readonly busy = $derived(!["idle", "error", "complete"].includes(this.phase));
  private jobId: string | null = null;
  private kind: "download" | "transcribe" | null = null;
  private audio: AudioBuffer | null = null;
  private unlisten: UnlistenFn | null = null;
  private disposed = false;
  private encodingWorker: Worker | null = null;
  private rejectEncoding: ((reason: Error) => void) | null = null;

  async init(): Promise<void> {
    this.error = null;
    this.modelChecked = false;
    this.connected = false;
    try {
      this.unlisten?.();
      const unlisten = await listen<Progress>("transcription-progress", e => this.receive(e.payload));
      if (this.disposed) { unlisten(); return; }
      this.unlisten = unlisten;
      this.modelReady = await invoke<boolean>("transcription_model_status");
      this.connected = true;
    } catch (e) { this.error = String(e); }
    finally { this.modelChecked = true; }
  }

  setAudio(audio: AudioBuffer | null): void {
    if (audio === this.audio) return;
    this.invalidated = this.audio !== null;
    if (this.kind === "transcribe") void this.cancel();
    this.audio = audio;
    this.words = [];
    this.completed = false;
    this.error = null;
    if (!this.jobId) this.phase = "idle";
  }

  /**
   * Seed already-known results — e.g. a transcript restored from a saved
   * project — without running a job. Call after `setAudio` for the audio
   * these words belong to; skips the update if nothing would change, so
   * a caller re-applying the same restored transcript doesn't bounce
   * reactive consumers (see `TranscriptPanel.svelte`'s restore effect).
   */
  restore(words: TranscriptWord[], completed: boolean): void {
    if (this.words === words && this.completed === completed) return;
    this.words = words;
    this.completed = completed;
    this.invalidated = false;
  }

  private receive(event: Progress): void {
    if (event.jobId !== this.jobId || this.disposed) return;
    if (this.phase === "cancelling" && !["complete", "error", "cancelled"].includes(event.phase)) return;
    const cancelled = this.phase === "cancelling" || event.phase === "cancelled";
    if (["complete", "error", "cancelled"].includes(event.phase)) {
      if (!cancelled && event.phase === "complete") {
        if (this.kind === "download") this.modelReady = true;
        else {
          this.words = parseTranscript(event.result, this.audio?.duration ?? 0);
          this.completed = true;
          this.invalidated = false;
        }
      }
      this.error = cancelled ? null : event.error;
      this.phase = this.error ? "error" : "idle";
      this.jobId = null;
      this.kind = null;
    } else this.phase = event.phase;
    this.percent = event.percent;
  }

  async download(): Promise<void> {
    if (this.busy || !this.connected) return;
    this.jobId = crypto.randomUUID();
    this.kind = "download";
    this.phase = "downloading";
    this.percent = null;
    this.error = null;
    try { await invoke("download_transcription_model", { jobId: this.jobId }); }
    catch (e) { this.fail(e); }
  }

  async transcribe(): Promise<void> {
    const audio = this.audio;
    if (!audio || this.busy || !this.modelReady) return;
    const id = crypto.randomUUID();
    this.jobId = id;
    this.kind = "transcribe";
    this.phase = "preparing";
    this.percent = null;
    this.error = null;
    try {
      // Web Audio resamples off the main thread; explicit averaging matches the editor's mono analysis.
      const context = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * 16000)), 16000);
      const source = context.createBufferSource();
      source.buffer = audio;
      const split = context.createChannelSplitter(audio.numberOfChannels);
      source.connect(split);
      for (let i = 0; i < audio.numberOfChannels; i++) {
        const gain = context.createGain();
        gain.gain.value = 1 / audio.numberOfChannels;
        split.connect(gain, i);
        gain.connect(context.destination);
      }
      source.start();
      const mono = await context.startRendering();
      if (this.jobId !== id || this.audio !== audio || this.disposed) return;
      const bytes = await this.encode(mono.getChannelData(0));
      if (this.jobId !== id || this.audio !== audio || this.disposed) return;
      if (!bytes) {
        this.receive({ jobId: id, phase: "complete", percent: 100, result: { transcription: [] }, error: null });
        return;
      }
      this.phase = "transcribing";
      await invoke("start_transcription", bytes, { headers: { "x-job-id": id } });
    } catch (e) { if (this.jobId === id) this.fail(e); }
  }

  async cancel(): Promise<void> {
    const id = this.jobId;
    if (!id) return;
    if (this.phase === "preparing") {
      this.jobId = null;
      this.kind = null;
      this.phase = "idle";
      this.encodingWorker?.terminate();
      this.encodingWorker = null;
      this.rejectEncoding?.(new Error("Cancelled"));
      this.rejectEncoding = null;
      return;
    }
    this.phase = "cancelling";
    try { await invoke("cancel_transcription", { jobId: id }); }
    catch (e) { this.fail(e); }
  }

  private encode(samples: Float32Array): Promise<Uint8Array | null> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./audio/transcriptionWorker.ts", import.meta.url), { type: "module" });
      this.encodingWorker = worker;
      this.rejectEncoding = reject;
      const finish = () => { worker.terminate(); this.encodingWorker = null; this.rejectEncoding = null; };
      worker.onmessage = (event: MessageEvent<{ bytes?: Uint8Array; silent?: boolean; error?: string }>) => {
        finish();
        if (event.data.silent) resolve(null);
        else if (event.data.bytes) resolve(event.data.bytes);
        else reject(new Error(event.data.error ?? "Audio preparation failed"));
      };
      worker.onerror = () => { finish(); reject(new Error("Audio preparation failed")); };
      // Only transfer the offline render, never the live recording's samples.
      worker.postMessage(samples, [samples.buffer]);
    });
  }

  private fail(error: unknown): void {
    this.encodingWorker?.terminate();
    this.encodingWorker = null;
    this.rejectEncoding = null;
    this.error = String(error);
    this.phase = "error";
    this.jobId = null;
    this.kind = null;
  }

  dispose(): void {
    this.disposed = true;
    void this.cancel();
    this.unlisten?.();
  }
}
