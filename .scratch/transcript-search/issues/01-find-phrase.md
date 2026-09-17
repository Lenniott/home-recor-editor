# 01: Find phrase in the transcript

**What to build:** A find bar on the transcript pane. Literal phrase, case-insensitive, highlight matches, next/prev with wrap, Cmd/Ctrl+F focuses the field. Clicking a hit selects that audio and seeks like clicking a word today. Includes cut and silence-styled words. Disabled when there is no complete transcript. Query is not saved in the project.

**Blocked by:** None (can start immediately). Orchestrator: do not run while MARKERS holds `TranscriptPanel` / `TranscriptPanel.test.ts`.

**Status:** done

**Mutex:** TRANSCRIPT

- [x] Query `hello` highlights both `Hello` and `hello` in a known fixture
- [x] Next/prev wrap
- [x] Empty query clears highlights
- [x] Disabled when transcript missing
- [x] Click hit = existing select + seek
- [x] README find in Edit by text
- [x] LOG.md one line via log-work script

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`. Do not edit `.scratch/CONTINUE.md`.
