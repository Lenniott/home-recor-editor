import { describe, expect, it } from "vitest";
import { encodeWav } from "./encodeWav";

function readAscii(view: DataView, offset: number, length: number): string {
  let text = "";
  for (let i = 0; i < length; i++) text += String.fromCharCode(view.getUint8(offset + i));
  return text;
}

describe("encodeWav", () => {
  it("writes a valid RIFF/WAVE/fmt/data header for mono", () => {
    const bytes = encodeWav([new Float32Array([0, 0.5, -0.5, 1, -1])], 44100);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(readAscii(view, 0, 4)).toBe("RIFF");
    expect(readAscii(view, 8, 4)).toBe("WAVE");
    expect(readAscii(view, 12, 4)).toBe("fmt ");
    expect(view.getUint32(16, true)).toBe(16); // fmt chunk size
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(44100); // sample rate
    expect(view.getUint16(32, true)).toBe(2); // block align (1 channel * 2 bytes)
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(readAscii(view, 36, 4)).toBe("data");

    const dataSize = 5 * 2;
    expect(view.getUint32(40, true)).toBe(dataSize);
    expect(view.getUint32(4, true)).toBe(36 + dataSize); // RIFF chunk size
    expect(bytes.length).toBe(44 + dataSize);
  });

  it("encodes known PCM values, including full-scale clamping", () => {
    const bytes = encodeWav([new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2])], 8000);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const values = Array.from({ length: 7 }, (_, i) => view.getInt16(44 + i * 2, true));

    expect(values[0]).toBe(0);
    expect(values[1]).toBe(Math.round(0.5 * 0x7fff));
    expect(values[2]).toBe(Math.round(-0.5 * 0x8000));
    expect(values[3]).toBe(0x7fff);
    expect(values[4]).toBe(-0x8000);
    expect(values[5]).toBe(0x7fff); // clamped
    expect(values[6]).toBe(-0x8000); // clamped
  });

  it("interleaves stereo channels left/right per frame", () => {
    const left = new Float32Array([1, -1]);
    const right = new Float32Array([0.5, -0.5]);
    const bytes = encodeWav([left, right], 48000);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(view.getUint16(22, true)).toBe(2); // channel count
    expect(view.getUint16(32, true)).toBe(4); // block align (2 channels * 2 bytes)

    const samples = Array.from({ length: 4 }, (_, i) => view.getInt16(44 + i * 2, true));
    expect(samples).toEqual([0x7fff, Math.round(0.5 * 0x7fff), -0x8000, Math.round(-0.5 * 0x8000)]);
  });

  it("handles an empty buffer", () => {
    const bytes = encodeWav([new Float32Array(0)], 44100);
    expect(bytes.length).toBe(44);
  });
});
