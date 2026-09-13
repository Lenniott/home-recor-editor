import { expect, it } from "vitest";
import { prepareTranscriptionWav } from "./transcriptionAudio";

it("skips digital silence so the recognizer cannot invent speech", () => {
  expect(prepareTranscriptionWav(new Float32Array(16000))).toBeNull();
  expect(prepareTranscriptionWav(new Float32Array([1e-8, -1e-8]))).toBeNull();
});

it("encodes non-silent audio at 16 kHz mono without modifying the samples", () => {
  const samples = new Float32Array([0, 0.5, -0.5, 0]);
  const before = samples.slice();
  const bytes = prepareTranscriptionWav(samples)!;
  const header = new DataView(bytes.buffer);
  expect(header.getUint32(24, true)).toBe(16000);
  expect(header.getUint16(22, true)).toBe(1);
  expect(header.getUint32(40, true)).toBe(8);
  expect(samples).toEqual(before);
});
