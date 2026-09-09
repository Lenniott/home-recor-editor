import { encodeWav } from "./encodeWav";

/** Avoid Whisper hallucinations on digital silence; run in the encoding worker. */
export function prepareTranscriptionWav(samples: Float32Array): Uint8Array | null {
  if (!samples.some(sample => Math.abs(sample) > 1e-5)) return null;
  return encodeWav([samples], 16000);
}
