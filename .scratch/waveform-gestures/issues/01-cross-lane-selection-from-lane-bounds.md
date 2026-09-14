# 01: Cross-lane selection from lane bounds, not a document query on move

**What to build:** Dragging vertically across speaker lanes still selects a contiguous set of tracks. The mapping is a pure function of ordered lane bounds and pointer Y, supplied by the timeline stack. Pointer-move no longer walks the whole document for lane nodes.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Unit tests: top-to-bottom, bottom-to-top, Y outside lanes, one lane, three lanes
- [ ] Cross-lane drag still enables Mark
- [ ] Pointer-move path does not query the document for track lanes

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
