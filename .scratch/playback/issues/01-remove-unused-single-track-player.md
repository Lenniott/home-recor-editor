# 01: Remove the unused single-track player

**What to build:** There is one playback owner. The unused duplicate player is gone. Listening, seeking, and decode sharing a context are unchanged.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] No remaining references to the unused player
- [ ] App builds; existing tests pass
- [ ] No change to live playback behavior

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
