# 04: Lane layout round-trips gutter clicks and collapsed-marker edges

**What to build:** Pixel ↔ kept-time mapping at gutter boundaries, with hidden spans in view, stays stable. Zero width or zero view duration does not throw.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Round-trip cases for gutter, hidden spans, and max gutter budget
- [ ] Zero view duration or zero width: no throw, documented fallback

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
