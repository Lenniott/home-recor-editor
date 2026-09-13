/**
 * Linear undo/redo stack over cloned snapshots of a caller-defined state
 * shape. No Svelte, no editor — the caller decides what a snapshot
 * contains and how to clone/compare it, so this module stays reusable
 * and independently testable (see `EditorState.beginEdit`/`endEdit` for
 * the transaction wrapper that turns a gesture into one snapshot).
 */

/** Snapshots older than this many steps back are dropped so a long session doesn't grow the stack unbounded. */
const DEFAULT_MAX_ENTRIES = 100;

export class EditHistory<T> {
  private readonly clone: (state: T) => T;
  private readonly maxEntries: number;
  private undoStack: T[] = [];
  private redoStack: T[] = [];

  constructor(clone: (state: T) => T, maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.clone = clone;
    this.maxEntries = maxEntries;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Push a clone of `state` as the step to return to if the caller undoes
   * whatever happens next, and drop any redo history — a fresh edit
   * invalidates the branch that was undone.
   */
  checkpoint(state: T): void {
    this.undoStack.push(this.clone(state));
    if (this.undoStack.length > this.maxEntries) this.undoStack.shift();
    this.redoStack = [];
  }

  /**
   * Pop the most recent checkpoint if `state` has not diverged from it —
   * e.g. a pointerdown/pointerup gesture that never actually moved
   * anything. Keeps every no-op click from consuming an undo step.
   * Returns whether the checkpoint was discarded, so callers can tell a
   * real edit from a no-op gesture (see `EditorState.endEdit`'s dirty tracking).
   */
  discardIfUnchanged(state: T, equal: (a: T, b: T) => boolean): boolean {
    const last = this.undoStack[this.undoStack.length - 1];
    if (last !== undefined && equal(last, state)) {
      this.undoStack.pop();
      return true;
    }
    return false;
  }

  /**
   * Move `current` onto the redo stack and return the clone to restore,
   * or `null` if there is nothing to undo.
   */
  undo(current: T): T | null {
    const previous = this.undoStack.pop();
    if (previous === undefined) return null;
    this.redoStack.push(this.clone(current));
    return previous;
  }

  /**
   * Move `current` onto the undo stack and return the clone to restore,
   * or `null` if there is nothing to redo.
   */
  redo(current: T): T | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(this.clone(current));
    return next;
  }

  /** Drop all history — call after loading a new document (see `EditorState.loadAudio`). */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
