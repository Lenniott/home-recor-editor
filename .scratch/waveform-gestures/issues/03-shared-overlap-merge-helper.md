# 03: One overlap-merge helper for marker edges and (if any) selection finish

**What to build:** Dragging a silence-marker edge into a neighbor still merges at pointer-up using the shared overlap fraction. The same helper is used if selection-drag finish also merges. Merge does not happen on every move.

**Blocked by:** 02: Pointer-up after a select drag has one documented finish policy

**Status:** ready-for-agent

- [ ] Existing marker-drag merge behavior is preserved
- [ ] Merge does not run on pointer-move, only on finish
- [ ] Overlap-fraction constant has one home

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
