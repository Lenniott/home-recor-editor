# 03: Export dialog flags

**What to build:** File → Export collects all vs clips, merge/separate/both, and mono/stereo, then the page only picks a destination and calls `runExport`. Clips is disabled when there are no export marks (no picker). Error string from the module still shows if clips is invoked with none.

**Blocked by:** 02: Clips scope on runExport

**Status:** ready-for-agent

**Mutex:** EXPORT

- [ ] Clips disabled at count 0; enabled at count ≥ 1
- [ ] Handler receives scope, layout, and channels the user chose
- [ ] Disabled clips does not open a destination picker
- [ ] README: all vs clips, merge, stereo toggle
- [ ] LOG.md one line via log-work script

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`. Do not edit `.scratch/CONTINUE.md`.
