# 01: Playwright drives a fake desktop adapter instead of a shallow invoke stub

**What to build:** Chromium e2e registers in-memory recordings and project files and returns predetermined dialog results. Import, Open Project, Save, and Export run the same handlers as production without native sheets.

**Blocked by:** project-session 01: Import one recording and restore marks from a companion project

**Status:** done

- [x] Tests register virtual files and dialog answers before visiting the editor
- [x] File operations do not depend on a one-line invoke stub that returns `1`
- [x] Existing unit tests are unchanged

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
