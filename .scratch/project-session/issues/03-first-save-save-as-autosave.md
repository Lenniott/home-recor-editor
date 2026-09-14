# 03: First Save, Save As, and autosave status

**What to build:** Cmd+S writes beside the recording the first time. Save As writes elsewhere. Footer shows Saving / Saved / Unsaved changes. After a save location exists, edits autosave once the user pauses. Autosave does not run before the first save.

**Blocked by:** 01: Import one recording and restore marks from a companion project

**Status:** ready-for-agent

- [ ] Fresh import with no companion stays unsaved; autosave does not fire
- [ ] After first Save, an edit autosaves once after the debounce
- [ ] Save As updates the save location; later autosaves go there
- [ ] An edit during an in-flight save leaves the project dirty after the write finishes

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
