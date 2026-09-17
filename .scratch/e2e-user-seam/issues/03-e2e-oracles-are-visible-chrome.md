# 03: E2e oracles are visible chrome, not session fields

**What to build:** Assertions use time readouts, marker count in the timeline, Preview edits state, selection bar, and layout. Failures describe what a user would see.

**Blocked by:** 02: E2e session starts from Import recordings, not an injected editor

**Status:** done

- [x] Spec does not read playhead, kept duration, raw markers, or zoom duration from the session module
- [x] Cross-lane mark, preview, zoom, and cut-handle tests still catch the same regressions via UI

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
