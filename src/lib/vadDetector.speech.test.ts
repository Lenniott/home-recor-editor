import { readFile } from "node:fs/promises";
import path from "node:path";
import { NonRealTimeVAD } from "@ricky0123/vad-web";
import { expect, it } from "vitest";
import { vadDetectOptions } from "./audio/sileroThresholds";

function decodeMono16Wav(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let sampleRate = 0;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") sampleRate = view.getUint32(offset + 12, true);
    if (id === "data") {
      dataOffset = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size + (size & 1);
  }
  if (dataOffset < 0 || sampleRate <= 0) throw new Error("speech.wav is not 16-bit PCM");
  const samples = new Float32Array(dataSize / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(dataOffset + i * 2, true) / 0x8000;
  return { samples, sampleRate };
}

async function detect(samples: Float32Array, sampleRate: number) {
  const options = vadDetectOptions(0.5);
  const assets = path.join(process.cwd(), "static/vad-assets");
  const model = await readFile(path.join(assets, "silero_vad_legacy.onnx"));
  const vad = await NonRealTimeVAD.new({
    positiveSpeechThreshold: options.positiveSpeechThreshold,
    negativeSpeechThreshold: options.negativeSpeechThreshold,
    redemptionMs: 192,
    preSpeechPadMs: 0,
    minSpeechMs: 192,
    modelURL: path.join(assets, "silero_vad_legacy.onnx"),
    modelFetcher: async () =>
      model.buffer.slice(model.byteOffset, model.byteOffset + model.byteLength),
    ortConfig: (ort) => {
      ort.env.wasm.wasmPaths = `${assets}/`;
      ort.env.wasm.numThreads = 1;
    },
  });
  const segments: { start: number; end: number }[] = [];
  for await (const { start, end } of vad.run(samples, sampleRate)) {
    segments.push({ start: start / 1000, end: end / 1000 });
  }
  return segments;
}

it("bundled VAD identifies speech, excludes silence, and serializes concurrent callers", async () => {
  const fixture = await readFile(new URL("../../e2e/fixtures/speech.wav", import.meta.url));
  const { samples: speech, sampleRate } = decodeMono16Wav(fixture);
  const padded = new Float32Array(speech.length + sampleRate * 8);
  padded.set(speech, sampleRate * 4);
  const [found, silence] = await Promise.all([
    detect(padded, sampleRate),
    detect(new Float32Array(sampleRate * 4), sampleRate),
  ]);
  expect(found.length).toBeGreaterThan(0);
  expect(found[0].start).toBeGreaterThan(3);
  expect(found.at(-1)!.end).toBeLessThan(speech.length / sampleRate + 5);
  expect(silence).toEqual([]);
}, 60_000);
