# 05: Transcribe all skips complete tracks unless the user asks again

**What to build:** Transcribe all runs speakers that are missing a transcript. An explicit again-run reprocesses the chosen scope. Duplicate clicks while busy do not start a second queue.

**Blocked by:** 03: One track failing transcription does not drop the rest of the queue

**Status:** done

- [ ] Two complete tracks and one missing → only the missing track runs
- [ ] Again-run reprocesses the chosen scope and dirty rules match tickets 01 and 04
- [ ] Busy state ignores a second start; cancel still matches ticket 03

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
