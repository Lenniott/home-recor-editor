# 04: Transcript dirty state matches undo policy

**What to build:** Transcribe no longer leaves Unsaved changes with nothing to undo, unless transcripts are added to undo. Either machine transcripts are undoable, or they do not bump dirty until the user saves them as part of a later edit. Save/reload of transcripts stays as today.

**Blocked by:** 01: Completed transcripts write through one session method

**Status:** ready-for-agent

- [ ] Transcribe then Undo does not leave a dirty project with an empty history (one consistent outcome)
- [ ] Save and reload still restore words
- [ ] Mark/cut undo is unchanged

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
