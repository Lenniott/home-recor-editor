# 04: Open a saved project when recordings have moved

**What to build:** User opens a project file. Each missing recording prompts Locate. The correct file restores the full session. Cancel leaves the previous session unchanged. A file whose SHA-256 or duration does not match is rejected before replacing the current project.

**Blocked by:** 01: Import one recording and restore marks from a companion project

**Status:** ready-for-agent

- [ ] All sources present → two-track session restored with marks and transcripts
- [ ] Cancel on Locate → prior session unchanged, no spurious error
- [ ] Wrong file (hash or duration mismatch) → clear error; current project not replaced
- [ ] Relink picker is injected in tests (no native sheet)

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
