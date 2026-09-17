# 04: Playhead clock follows source time and does not pollute undo

**What to build:** While playing, the playhead tracks source time across a cut join. Reaching the end stops playback. Playhead ticks are not undo steps. A leftover ended-callback from a previous play is ignored.

**Blocked by:** 03: Play, pause, and seek against a fake audio context

**Status:** done

- [x] Advancing fake time moves playhead across a cut in source time, not raw elapsed
- [x] Playhead ticks are not undoable
- [x] Elapsed past plan length stops playback
- [x] Stale ended-callback from a previous play does not stop a newer play

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
