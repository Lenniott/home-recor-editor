# 01: Find phrase in the transcript

**What to build:** A find bar on the transcript pane. Literal phrase, case-insensitive, highlight matches, next/prev with wrap, Cmd/Ctrl+F focuses the field. Clicking a hit selects that audio and seeks like clicking a word today. Includes cut and silence-styled words. Disabled when there is no complete transcript. Query is not saved in the project.

**Blocked by:** None (can start immediately). Orchestrator: do not run while MARKERS holds `TranscriptPanel` / `TranscriptPanel.test.ts`.

**Status:** ready-for-agent

**Mutex:** TRANSCRIPT

- [ ] Query `hello` highlights both `Hello` and `hello` in a known fixture
- [ ] Next/prev wrap
- [ ] Empty query clears highlights
- [ ] Disabled when transcript missing
- [ ] Click hit = existing select + seek
- [ ] README find in Edit by text
- [ ] LOG.md one line via log-work script

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`. Do not edit `.scratch/CONTINUE.md`.
