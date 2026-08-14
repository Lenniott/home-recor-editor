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

  detect(
    samples: Float32Array,
    sampleRate: number,
    options: VadOptions,
    onProgress?: (fraction: number) => void,
  ): Promise<SpeechSegment[]> {
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
      const cleanup = (): void => {
        worker.removeEventListener("message", handleMessage);
        worker.removeEventListener("error", handleError);
      };

      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", handleError);
      // Not transferred: the caller (editor state) still needs `samples`
      // afterwards for the waveform and playback, so this is a structured-
      // clone copy rather than a zero-copy transfer.
      worker.postMessage({ samples, sampleRate, options });
    });
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
