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

  const mono = new Float32Array(buffer.length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      mono[i] += data[i] / buffer.numberOfChannels;
    }
  }
  return mono;
}
