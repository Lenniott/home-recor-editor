import { describe, expect, it } from "vitest";
import { MarkerList, markersFromV2 } from "./markers";

describe("MarkerList", () => {
  it("cross-lane silence add is one mark with both lane ids", () => {
    const list = new MarkerList(["a", "b"]);
    list.add("silence", 1, 2, ["a", "b"]);
    expect(list.all()).toHaveLength(1);
    expect(list.all()[0]).toMatchObject({
      laneIds: ["a", "b"],
      start: 1,
      end: 2,
      type: "silence",
    });
  });

  it("resize start of a cross-lane silence still length 1", () => {
    const list = new MarkerList(["a", "b"]);
    list.add("silence", 1, 2, ["a", "b"]);
    list.resize(list.all()[0].id, "start", 0.5);
    expect(list.all()).toHaveLength(1);
    expect(list.all()[0]).toMatchObject({ start: 0.5, end: 2, laneIds: ["a", "b"] });
  });

  it("two one-lane silences at the same times stay two marks", () => {
    const list = new MarkerList(["a", "b"]);
    list.add("silence", 1, 2, ["a"]);
    list.add("silence", 1, 2, ["b"]);
    expect(list.all()).toHaveLength(2);
    expect(list.all().map((m) => m.laneIds)).toEqual([["a"], ["b"]]);
  });

  it("same-lane overlapping silences merge to one interval", () => {
    const list = new MarkerList(["a", "b"]);
    list.add("silence", 1, 3, ["a"]);
    list.add("silence", 2, 4, ["a"]);
    expect(list.all()).toHaveLength(1);
    expect(list.all()[0]).toMatchObject({ start: 1, end: 4, laneIds: ["a"] });
  });

  it("cut add with one lane still stores all track ids", () => {
    const list = new MarkerList(["a", "b"]);
    list.add("cut", 1, 2, ["a"]);
    expect(list.all()).toHaveLength(1);
    expect(list.all()[0]).toMatchObject({ type: "cut", start: 1, end: 2, laneIds: ["a", "b"] });
  });

  it("v2 per-track silences plus cuts open as one-lane silences and all-lane cuts", () => {
    const markers = markersFromV2(
      [
        { id: "a", manualSilences: [{ start: 1, end: 2 }] },
        { id: "b", manualSilences: [{ start: 1, end: 2 }] },
      ],
      [{ start: 3, end: 4 }],
      ["a", "b"],
    );
    expect(markers.filter((m) => m.type === "silence")).toHaveLength(2);
    expect(markers.filter((m) => m.type === "cut")).toEqual([
      expect.objectContaining({ type: "cut", start: 3, end: 4, laneIds: ["a", "b"] }),
    ]);
  });
});
