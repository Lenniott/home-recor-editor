# 02: E2e session starts from Import recordings, not an injected editor

**What to build:** The shared e2e setup loads two speakers and transcripts the way a user would: Import (and companion project if needed) against virtual files. Specs no longer dynamically import the session module.

**Blocked by:** 01: Playwright drives a fake desktop adapter instead of a shallow invoke stub

**Status:** ready-for-agent

- [ ] Two lanes and transcript words appear from chrome after setup
- [ ] Spec contains no dynamic import of the session module
- [ ] Existing gesture and layout tests still pass after the new setup

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
