# 04: Transcript txt through runExport

**What to build:** Same export module can write `{stem}-transcript.txt` with or without audio. Dialog: Audio and Transcript checkboxes. File → Export transcript… and a control on the transcript pane open that dialog with only Transcript on. Apply edits on/off (default on). On: omit cut and silenced words; remap clocks for cuts. Clips + transcript = words overlapping export marks. Never clobber txt.

**Blocked by:** 03: Export dialog flags

**Status:** ready-for-agent

**Mutex:** EXPORT

- [ ] Transcript-only: txt written, zero wav
- [ ] Apply edits off keeps cut words; on drops them and remaps later clocks
- [ ] Silenced words dropped only when apply edits is on
- [ ] Clips scope filters words to export marks
- [ ] Existing txt path: error, no clobber
- [ ] Menu + transcript-pane control share the dialog
- [ ] README
- [ ] LOG.md one line via log-work script

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`. Do not edit `.scratch/CONTINUE.md`.
