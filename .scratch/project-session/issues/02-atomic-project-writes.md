# 02: Atomic project writes survive an interrupted save

**What to build:** An interrupted autosave or Save never leaves a truncated project file. A failed write shows a save error and pauses autosave until the user retries.

**Blocked by:** None (can start immediately)

**Status:** done

- [ ] Native write test: interrupt mid-write leaves the previous complete file or the new complete file, never partial JSON
- [ ] Failed write surfaces a save error in the session chrome
- [ ] Autosave does not keep retrying into a known-bad destination until the user saves again

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
