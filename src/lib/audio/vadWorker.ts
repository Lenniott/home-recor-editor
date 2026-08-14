import { detectSpeechSegments, type VadOptions } from "./vad";
import type { SpeechSegment } from "./silence";

export interface VadWorkerRequest {
  samples: Float32Array;
  sampleRate: number;
  options: VadOptions;
}

export type VadWorkerResponse =
  | { type: "progress"; fraction: number }
  | { type: "done"; segments: SpeechSegment[] }
  | { type: "error"; message: string };

self.onmessage = async (event: MessageEvent<VadWorkerRequest>) => {
  const { samples, sampleRate, options } = event.data;
  try {
    const segments = await detectSpeechSegments(samples, sampleRate, options, (fraction) => {
      self.postMessage({ type: "progress", fraction } satisfies VadWorkerResponse);
    });
    self.postMessage({ type: "done", segments } satisfies VadWorkerResponse);
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    } satisfies VadWorkerResponse);
  }
};
