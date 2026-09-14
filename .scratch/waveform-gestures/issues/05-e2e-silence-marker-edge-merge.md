# 05: E2e silence-marker edge drag merges neighbors

**What to build:** In the editor, mark two nearby silences, drag an edge past the merge threshold, see one merged marker. Undo restores two if undo is exposed. Distinct from the existing shared-cut handle drag.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Flow is distinct from cut-handle drag
- [ ] Marker count does not jump mid-drag (merge only on release)
- [ ] Runs on a two-track seeded (or imported) project like the other editor e2e

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
