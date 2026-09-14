# 01: Edited render matches preview at silence and cut boundaries

**What to build:** Export of a recording with silences and shared cuts matches the Web Audio preview at those boundaries, including stereo and “nothing left to export” when cuts cover the whole project. This lives in the unit suite, not the browser e2e spec.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Sample-level cases: muted spans, shared cuts, overlapping mute and cut, stereo channels
- [ ] Cuts covering the whole duration produce the empty-export outcome
- [ ] Existing browser parity check still passes or is deleted once this suite owns the oracle

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
