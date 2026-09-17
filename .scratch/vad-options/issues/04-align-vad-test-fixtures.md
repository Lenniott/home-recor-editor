# 04: VAD fixtures derive the negative threshold from the helper

**What to build:** Unit and e2e VAD option objects use the shared helper instead of duplicated 0.5 / 0.35 literals so a margin change updates expected values in one place.

**Blocked by:** 01: Shared Silero threshold helper for cleanup and transcription

**Status:** done

- [ ] Detector tests and VAD e2e (if still present) use the helper
- [ ] Changing the margin constant does not require hunting duplicated literals

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
