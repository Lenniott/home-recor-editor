# 01: Reload does not shrink silence marks when a buffer is set

**What to build:** Saving a project with a non-zero silence buffer and reopening it shows the same mark times the user saw before save. Disk shape keeps the current-format convention so buffers are not applied twice.

**Blocked by:** None (can start immediately)

**Status:** done

- [ ] Known marks plus buffer 150ms survive save → reload unchanged
- [ ] On-disk detected vs manual silences match the current-format convention

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
