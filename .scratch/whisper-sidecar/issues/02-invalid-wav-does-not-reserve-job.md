# 02: Invalid Whisper job bodies never occupy the job slot

**What to build:** Start transcription rejects missing job id or invalid WAV (not RIFF/WAVE, too short) with a stable error and does not reserve the single in-flight job.

**Blocked by:** None (can start immediately)

**Status:** done

- [ ] Invalid payloads return stable errors
- [ ] Job slot remains free for a following valid start
- [ ] Valid minimal WAV still proceeds to the engine spawn path (engine may be mocked)

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
