import { prepareTranscriptionWav } from "./transcriptionAudio";

self.onmessage = (event: MessageEvent<Float32Array>) => {
  try {
    const bytes = prepareTranscriptionWav(event.data);
    if (bytes) self.postMessage({ bytes }, { transfer: [bytes.buffer] });
    else self.postMessage({ silent: true });
  } catch (error) { self.postMessage({ error: String(error) }); }
};
