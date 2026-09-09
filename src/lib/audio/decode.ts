/**
 * Bytes-to-AudioBuffer boundary. Isolated so the rest of the app deals in
 * `AudioBuffer` / `Float32Array` and never touches `decodeAudioData`'s
 * quirks (detaching the input buffer, needing a fresh copy per call).
 */

export async function decodeAudioFile(
  bytes: Uint8Array,
  audioContext: AudioContext,
): Promise<AudioBuffer> {
  // decodeAudioData detaches the whole ArrayBuffer it's given (ignoring
  // byteOffset/byteLength), and takes ownership of it. When `bytes` already
  // spans its entire backing buffer — true for a freshly read file — pass
  // it straight through rather than copying; for an hour-long recording
  // that's the difference between one allocation and two of several
  // hundred MB. Only copy defensively when `bytes` is a narrower view.
  // Callers should not reuse `bytes` after this call.
  const spansWholeBuffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
  const arrayBuffer = spansWholeBuffer ? bytes.buffer : bytes.slice().buffer;
  return audioContext.decodeAudioData(arrayBuffer);
}

/**
 * Average all channels down to one, for silence analysis and mono waveform
 * painting. Always returns a fresh Float32Array — for a mono file,
 * `getChannelData(0)` would otherwise hand back the AudioBuffer's own
 * backing storage, and anything that later transfers `monoSamples` (e.g. a
 * zero-copy postMessage) would detach the AudioBuffer's memory along with
 * it, silently blanking playback and the waveform.
 */
export function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0).slice();
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, ch) => buffer.getChannelData(ch));
  return averageChannels(channels);
}

/**
 * Average two or more equal-length channels down to one — the shared core
 * behind `mixToMono` above (an `AudioBuffer`'s channels) and
 * `downmixToMono` in `exportMix.ts` (raw arrays from a rendered export, no
 * `AudioBuffer` involved). Always a fresh array. Callers with exactly one
 * channel should skip this and copy it directly instead — averaging a
 * single channel with itself is just a slower way to do the same thing.
 */
export function averageChannels(channels: Float32Array[]): Float32Array {
  const length = channels.reduce((longest, data) => Math.max(longest, data.length), 0);
  const mono = new Float32Array(length);
  for (const data of channels) {
    for (let i = 0; i < data.length; i++) mono[i] += data[i] / channels.length;
  }
  return mono;
}
