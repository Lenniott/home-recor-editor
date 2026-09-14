# 02: Construct playback from a session, not a module-load singleton

**What to build:** Playback is created with the editing session at bootstrap (or equivalent context). Tests can construct playback against a fresh session without importing a pre-wired global pair.

**Blocked by:** 01: Remove the unused single-track player

**Status:** ready-for-agent

- [ ] Toggle, seek, and decode still share one audio context in the app
- [ ] Tests can construct playback against a test session
- [ ] UI still plays, seeks, and refreshes after edits

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
