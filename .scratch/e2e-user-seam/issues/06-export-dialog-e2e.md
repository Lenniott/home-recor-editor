# 06: Export through the export dialog in e2e

**What to build:** User clicks Export, chooses a mode, virtual destination is accepted. Progress completes. Virtual WAV(s) exist with expected duration and channel layout.

**Blocked by:** 02: E2e session starts from Import recordings, not an injected editor; export-session 03: Export session owns staging; the page only picks a destination

**Status:** ready-for-agent

- [ ] At least one two-track mode (mix or separate) completes from the dialog
- [ ] Spec does not import render helpers inside the browser
- [ ] README no longer implies export is untested; native sheets remain out of scope

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
