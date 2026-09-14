# 03: Applying a project never paints marks onto the wrong recording

**What to build:** If saved track count or order does not match loaded lanes, apply either fails safe or follows an explicit rule. Transcripts never attach to a recording with a different SHA-256 or duration.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Two saved tracks vs one loaded lane: no silent wrong-lane marks
- [ ] Chosen fail-safe or partial-apply rule is locked by a test
- [ ] Transcript does not attach to a mismatched source identity

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
