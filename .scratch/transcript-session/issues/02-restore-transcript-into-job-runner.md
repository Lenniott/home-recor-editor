# 02: Restored transcripts seed the job runner without wiping tracks

**What to build:** After Open or Import, empty-state copy does not tell the user to transcribe again when saved words already exist. Switching speaker updates runner completed/invalidated for that lane. Restore does not write back into tracks or loop.

**Blocked by:** 01: Completed transcripts write through one session method

**Status:** done

- [x] Project load with saved words does not show “transcribe again” empty-state
- [x] Lane switch updates runner status for that speaker’s audio
- [x] Restoring the same payload is a no-op on the runner
- [x] Token bump with the pane unmounted does not corrupt track data

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
