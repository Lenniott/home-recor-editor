import { NonRealTimeVAD } from "@ricky0123/vad-web";
import type { SpeechSegment } from "./silence";

/**
 * Where the Silero ONNX model and onnxruntime-web's WASM binary are served
 * from — copied into static/vad-assets from node_modules (see the README
 * there) so detection works fully offline, with no CDN fetch at runtime.
 */
const VAD_ASSET_PATH = "/vad-assets/";

export interface VadOptions {
  /** Silero output at or above this counts as speech. Higher = less sensitive. */
  positiveSpeechThreshold: number;
  /** Silero output below this (once speech has started) counts as non-speech again. */
  negativeSpeechThreshold: number;
}

/**
 * Run Silero VAD over a full recording and return the speech segments it
 * finds, in seconds. This only touches fetch/WebAssembly — no Web Audio
 * API — so it's safe to call from a Web Worker, which is what keeps an
 * hour-long take from freezing the UI while it's analyzed.
 */
export async function detectSpeechSegments(
  samples: Float32Array,
  sampleRate: number,
  options: VadOptions,
  onProgress?: (fraction: number) => void,
): Promise<SpeechSegment[]> {
  const vad = await NonRealTimeVAD.new({
    positiveSpeechThreshold: options.positiveSpeechThreshold,
    negativeSpeechThreshold: options.negativeSpeechThreshold,
    // Editor boundaries need short pauses, not the library's 1.4s conversation hangover.
    // Speech protection and transcription context are added explicitly by their callers.
    redemptionMs: 192,
    preSpeechPadMs: 0,
    minSpeechMs: 192,
    modelURL: `${VAD_ASSET_PATH}silero_vad_legacy.onnx`,
    ortConfig: (ort) => {
      ort.env.wasm.wasmPaths = VAD_ASSET_PATH;
      // The Tauri webview isn't cross-origin isolated, so multi-threaded
      // wasm (which needs SharedArrayBuffer) isn't available — stick to one.
      ort.env.wasm.numThreads = 1;
    },
  });

  const durationSec = sampleRate > 0 ? samples.length / sampleRate : 0;
  const segments: SpeechSegment[] = [];
  for await (const { start, end } of vad.run(samples, sampleRate)) {
    segments.push({ start: start / 1000, end: end / 1000 });
    if (onProgress && durationSec > 0) {
      onProgress(Math.min(1, end / 1000 / durationSec));
    }
  }
  onProgress?.(1);
  return segments;
}
