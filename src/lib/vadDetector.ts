import type { VadOptions } from "./audio/vad";
import type { VadWorkerResponse } from "./audio/vadWorker";
import type { SpeechSegment } from "./audio/silence";

/**
 * Runs Silero VAD in a dedicated Web Worker so scanning an hour-long take
 * never blocks the UI thread. The worker — and the ~15MB onnxruntime-web
 * WASM binary it loads — is created lazily on first use and then reused.
 */
export class VadDetector {
  private worker: Worker | null = null;
  private pending: Promise<unknown> = Promise.resolve();

  detect(
    samples: Float32Array,
    sampleRate: number,
    options: VadOptions,
    onProgress?: (fraction: number) => void,
    signal?: AbortSignal,
  ): Promise<SpeechSegment[]> {
    const task = this.pending.then(() => this.run(samples, sampleRate, options, onProgress, signal));
    this.pending = task.catch(() => {});
    return task;
  }

  private run(samples: Float32Array, sampleRate: number, options: VadOptions, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<SpeechSegment[]> {
    if (signal?.aborted) return Promise.reject(new Error("Cancelled"));
    const worker = this.getWorker();
    return new Promise((resolve, reject) => {
      const handleMessage = (event: MessageEvent<VadWorkerResponse>) => {
        const msg = event.data;
        if (msg.type === "progress") {
          onProgress?.(msg.fraction);
        } else if (msg.type === "done") {
          cleanup();
          resolve(msg.segments);
        } else {
          cleanup();
          reject(new Error(msg.message));
        }
      };
      const handleError = (event: ErrorEvent) => {
        cleanup();
        reject(event.error ?? new Error(event.message));
      };
      const abort = (): void => {
        cleanup();
        worker.terminate();
        if (this.worker === worker) this.worker = null;
        reject(new Error("Cancelled"));
      };
      const cleanup = (): void => {
        signal?.removeEventListener("abort", abort);
        worker.removeEventListener("message", handleMessage);
        worker.removeEventListener("error", handleError);
      };

      signal?.addEventListener("abort", abort, {once:true});
      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", handleError);
      // Not transferred: the caller (editor state) still needs `samples`
      // afterwards for the waveform and playback, so this is a structured-
      // clone copy rather than a zero-copy transfer.
      worker.postMessage({ samples, sampleRate, options });
    });
  }

  /**
   * Create the worker ahead of time, before the user ever clicks Detect.
   * In dev, spinning it up is what makes Vite discover and pre-bundle
   * @ricky0123/vad-web — if that first happens mid-session (e.g. right
   * after loading a take), the resulting dependency-optimize reload wipes
   * the app's in-memory state. Calling this once at app start moves that
   * cost to boot time, before there's anything loaded to lose.
   */
  warmUp(): void {
    this.getWorker();
  }

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL("./audio/vadWorker.ts", import.meta.url), {
        type: "module",
      });
    }
    return this.worker;
  }
}

export const vadDetector = new VadDetector();
