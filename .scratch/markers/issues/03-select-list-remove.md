# 03: Select, list, and remove marks

**What to build:** Marks are selectable on the timeline and in a simple all-types list. Cmd/Ctrl-click adds to the selection. Cmd/Ctrl+A with a lane or the list focused selects every mark. Backspace/Delete or a Remove button deletes the selection in one undo step. No filter/hidden chrome.

**Blocked by:** 02: Type change; drop convert-all

**Status:** ready-for-agent

**Mutex:** MARKERS

- [ ] Multi-select then Remove/Backspace clears those ids; undo restores them
- [ ] Cmd/Ctrl+A selects all marks when a lane or the list is focused
- [ ] List shows every current mark (type + time is enough)
- [ ] Type change from 02 works on the selection when more than one mark is selected
- [ ] README: select, select-all, delete
- [ ] LOG.md one line via log-work script

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`. Do not edit `.scratch/CONTINUE.md`.
