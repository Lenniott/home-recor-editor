# 02: Pointer-up after a select drag has one documented finish policy

**What to build:** Either overlapping a marked region by the shared merge fraction auto-marks/merges on pointer-up, or selection stays pending until Mark/Unmark/Cut. Comments, tests, and the waveform all describe the same behavior.

**Blocked by:** None (can start immediately)

**Status:** done

- [ ] One documented pointer-up behavior for a finished select drag
- [ ] Unit tests lock overlap above vs below the merge fraction if auto-merge ships; otherwise they lock pending-only
- [ ] Existing one-lane and cross-lane e2e still pass, or assert auto-merge if that is the chosen policy

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
