# 05: Open, edit, and save round-trip in e2e

**What to build:** Open a virtual project, mark or cut, Save (or wait for autosave), Open again. Restored marks and transcript show in the UI. Virtual project JSON updated on disk.

**Blocked by:** 02: E2e session starts from Import recordings, not an injected editor; project-session 03: First Save, Save As, and autosave status; project-session 04: Open a saved project when recordings have moved

**Status:** done

- [x] Round-trip uses File menu / Open Project, not evaluate seeding
- [x] After reload, marks and transcript are visible in chrome
- [x] Virtual filesystem contains the updated project JSON

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
