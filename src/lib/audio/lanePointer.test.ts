import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EditorState } from "../editor.svelte";
import { trackIdsForPointerY } from "./lanePointer";

const two = [
  { id: "a", top: 0, bottom: 10 },
  { id: "b", top: 10, bottom: 20 },
];

describe("trackIdsForPointerY", () => {
  it("selects both lanes when the pointer Y sits in the second lane", () => {
    expect(trackIdsForPointerY({ lanes: two, originId: "a", clientY: 15 })).toEqual(["a", "b"]);
  });

  it("selects both lanes when dragging bottom-to-top", () => {
    expect(trackIdsForPointerY({ lanes: two, originId: "b", clientY: 5 })).toEqual(["a", "b"]);
  });

  it("keeps the origin lane when Y sits outside all lanes", () => {
    expect(trackIdsForPointerY({ lanes: two, originId: "a", clientY: 40 })).toEqual(["a"]);
  });

  it("returns only the origin when there is one lane", () => {
    expect(
      trackIdsForPointerY({
        lanes: [{ id: "a", top: 0, bottom: 10 }],
        originId: "a",
        clientY: 5,
      }),
    ).toEqual(["a"]);
  });

  it("selects the contiguous middle span across three lanes", () => {
    const lanes = [
      { id: "a", top: 0, bottom: 10 },
      { id: "b", top: 10, bottom: 20 },
      { id: "c", top: 20, bottom: 30 },
    ];
    expect(trackIdsForPointerY({ lanes, originId: "a", clientY: 25 })).toEqual(["a", "b", "c"]);
  });

  it("cross-lane ids still enable Mark", () => {
    const editor = new EditorState();
    editor.loadAudio(
      { duration: 10, sampleRate: 16000 } as AudioBuffer,
      "a.wav",
      new Float32Array(160000),
    );
    editor.addTrack(
      { duration: 10, sampleRate: 16000 } as AudioBuffer,
      "b.wav",
      new Float32Array(160000),
    );
    const ids = trackIdsForPointerY({
      lanes: [
        { id: editor.tracks[0].id, top: 0, bottom: 10 },
        { id: editor.tracks[1].id, top: 10, bottom: 20 },
      ],
      originId: editor.tracks[0].id,
      clientY: 15,
    });
    editor.setSelection(1, 2, ids);
    expect(editor.hasSelection).toBe(true);
    expect(editor.selectionTrackIds).toEqual(ids);
  });

  it("Waveform pointer-move does not query the document for track lanes", () => {
    const src = readFileSync(new URL("../components/Waveform.svelte", import.meta.url), "utf8");
    expect(src).toContain("trackIdsForPointerY");
    expect(src).not.toMatch(/querySelectorAll/);
  });
});
