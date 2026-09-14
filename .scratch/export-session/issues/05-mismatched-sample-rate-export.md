# 05: Two tracks at different sample rates have one clear export outcome

**What to build:** Export never silently aligns two recordings that were opened at different rates. Either export resamples with an explicit progress stage, or Export is disabled with an explanation before the folder picker. Tests lock whichever outcome is chosen.

**Blocked by:** 03: Export session owns staging; the page only picks a destination

**Status:** ready-for-agent

- [ ] Two tracks at different rates never produce a misleading shared duration file
- [ ] User sees one outcome: convert-and-export, or blocked with explanation
- [ ] A test covers the chosen behavior

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
