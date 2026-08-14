import { describe, expect, it } from "vitest";
import { EditHistory } from "./editHistory";

interface Snapshot {
  n: number;
}

function clone(state: Snapshot): Snapshot {
  return { ...state };
}

describe("undo/redo", () => {
  it("restores the checkpointed state and moves current onto the redo stack", () => {
    const history = new EditHistory<Snapshot>(clone);
    const state: Snapshot = { n: 1 };
    history.checkpoint(state);
    state.n = 2;

    const restored = history.undo(state);

    expect(restored).toEqual({ n: 1 });
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
  });

  it("redo restores the state that was undone", () => {
    const history = new EditHistory<Snapshot>(clone);
    const state: Snapshot = { n: 1 };
    history.checkpoint(state);
    state.n = 2;

    history.undo(state);
    const restored = history.redo({ n: 1 });

    expect(restored).toEqual({ n: 2 });
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
  });
});

describe("checkpoint", () => {
  it("clears the redo stack, since a new edit invalidates the undone branch", () => {
    const history = new EditHistory<Snapshot>(clone);
    const state: Snapshot = { n: 1 };
    history.checkpoint(state);
    state.n = 2;
    history.undo(state);
    expect(history.canRedo).toBe(true);

    history.checkpoint({ n: 2 });

    expect(history.canRedo).toBe(false);
  });
});

describe("empty stack", () => {
  it("undo on an empty stack returns null and leaves canUndo/canRedo false", () => {
    const history = new EditHistory<Snapshot>(clone);

    expect(history.undo({ n: 1 })).toBeNull();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it("redo on an empty stack returns null", () => {
    const history = new EditHistory<Snapshot>(clone);

    expect(history.redo({ n: 1 })).toBeNull();
    expect(history.canRedo).toBe(false);
  });
});

describe("cap", () => {
  it("drops the oldest checkpoint once maxEntries is exceeded", () => {
    const history = new EditHistory<Snapshot>(clone, 2);
    history.checkpoint({ n: 0 });
    history.checkpoint({ n: 1 });
    history.checkpoint({ n: 2 });

    const state: Snapshot = { n: 3 };
    expect(history.undo(state)).toEqual({ n: 2 });
    expect(history.undo({ n: 2 })).toEqual({ n: 1 });
    // The n: 0 checkpoint was evicted, so a third undo has nothing left.
    expect(history.undo({ n: 1 })).toBeNull();
  });
});

describe("discardIfUnchanged", () => {
  it("pops the last checkpoint when the state matches it (a no-op gesture)", () => {
    const history = new EditHistory<Snapshot>(clone);
    const state: Snapshot = { n: 1 };
    history.checkpoint(state);

    history.discardIfUnchanged({ n: 1 }, (a, b) => a.n === b.n);

    expect(history.canUndo).toBe(false);
  });

  it("keeps the last checkpoint when the state has diverged", () => {
    const history = new EditHistory<Snapshot>(clone);
    history.checkpoint({ n: 1 });

    history.discardIfUnchanged({ n: 2 }, (a, b) => a.n === b.n);

    expect(history.canUndo).toBe(true);
  });
});

describe("clone isolation", () => {
  it("undo returns a clone that further mutation does not feed back into history", () => {
    const history = new EditHistory<Snapshot>(clone);
    const state: Snapshot = { n: 1 };
    history.checkpoint(state);
    state.n = 2;

    const restored = history.undo(state);
    restored!.n = 999;

    // Redo must still hand back the pre-mutation value, not the tampered clone.
    expect(history.redo({ n: 1 })).toEqual({ n: 2 });
  });
});
