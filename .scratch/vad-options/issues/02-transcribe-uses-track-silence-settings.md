# 02: Transcribe uses the active speaker’s silence-threshold setting

**What to build:** Changing the VAD threshold in Cleanup before Transcribe all changes the speech windows sent to Whisper the same way Detect uses that setting.

**Blocked by:** 01: Shared Silero threshold helper for cleanup and transcription

**Status:** done

- [ ] UI threshold change before transcribe shows up in the VAD detect arguments
- [ ] Same track, same setting → same thresholds as silence detection

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
