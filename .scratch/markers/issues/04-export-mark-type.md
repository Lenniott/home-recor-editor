# 04: Export mark type

**What to build:** Third type `export`: one or both lanes, overlapping export marks stay separate, no buffer, preview sound unchanged. Mark / Unmark / M with the export action uses selected lanes like silence. Opaque stacking: silence under cut under export. Persists. Does not write files.

**Blocked by:** 03: Select, list, and remove marks

**Status:** ready-for-agent

**Mutex:** MARKERS

- [ ] Two overlapping export marks both remain
- [ ] One-lane and two-lane export marks (two-lane is one synced record)
- [ ] Save/reload keeps export marks
- [ ] Silence, cut, and export may share source time in data
- [ ] README: export marks, z-order, preview ignores export type
- [ ] LOG.md one line via log-work script

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`. Do not edit `.scratch/CONTINUE.md`.
