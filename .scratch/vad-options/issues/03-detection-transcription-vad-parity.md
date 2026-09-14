# 03: Cleanup detection and transcription pass identical VAD options

**What to build:** Given one speaker’s settings, Detect and Transcribe call VAD with the same option object, including the negative threshold.

**Blocked by:** 01: Shared Silero threshold helper for cleanup and transcription

**Status:** ready-for-agent

- [ ] Mocked detect: one invocation each, options deep-equal
- [ ] Includes negativeSpeechThreshold derived from the helper

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
