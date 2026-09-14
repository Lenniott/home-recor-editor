# 03: One track failing transcription does not drop the rest of the queue

**What to build:** User Cancel stops the whole run. A per-track error leaves that track missing or with prior words and continues the remaining speakers.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Track A succeeds, B errors → A kept; remaining tracks still run
- [ ] Cancel → no further transcribe calls; queue empty
- [ ] Removing the running track still cancels
- [ ] Test covers three tracks with a middle failure

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
