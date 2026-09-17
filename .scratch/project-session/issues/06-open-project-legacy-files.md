# 06: Open Project and legacy files agree with the documented workflow

**What to build:** Opening an old-format file via Open Project has one documented outcome: either it opens and upgrades like import, or the user gets a single message that legacy files restore by importing the recording beside them. README and product behavior match.

**Blocked by:** 05: Upgrade a legacy companion project on next save

**Status:** done

- [ ] Current-format files still open with relink
- [ ] Old-format file via Open Project: either migrates on open, or one actionable message pointing at import
- [ ] Chosen behavior is covered by a test so the two entry points cannot drift

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
