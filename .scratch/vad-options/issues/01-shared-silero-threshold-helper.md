# 01: Shared Silero threshold helper for cleanup and transcription

**What to build:** Cleanup silence detection and transcription VAD use the same positive→negative threshold rule. Changing the margin in one place updates both.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Both call sites use one helper
- [ ] Magic 0.15 is gone from the transcription path
- [ ] Unit cases: 0.5 → 0.35, 0.1 → 0, 0.9 → 0.75

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
