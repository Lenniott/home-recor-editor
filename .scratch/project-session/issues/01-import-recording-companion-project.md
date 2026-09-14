# 01: Import one recording and restore marks from a companion project

**What to build:** User imports a single recording. If a valid companion project sits beside it, marks, settings, and transcript restore without using Open Project. Missing companion stays a blank session. Unreadable companion shows an error, blocks Save to that path, and still allows Save As.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Missing companion file → empty session, no error
- [x] Valid current-format companion → marks (and transcript if present) restored; save location is that companion file
- [x] Unreadable companion → error plus Save blocked to that location; Save As still writes a new file
- [x] Orchestration is testable with injected read/write/pick adapters (no real dialogs)

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
