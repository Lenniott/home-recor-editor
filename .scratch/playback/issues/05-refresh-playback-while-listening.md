# 05: Refresh playback when preview or marks change while listening

**What to build:** Preview edits, view filter, mark, and unmark while playing rebuild the schedule from the current playhead. Refresh while paused is a no-op.

**Blocked by:** 03: Play, pause, and seek against a fake audio context

**Status:** done

- [x] Switching to Preview edits while “playing” reschedules from the current playhead
- [x] Refresh while paused does not start playback
- [x] Mark/unmark while playing yields a schedule consistent with the current timeline

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
