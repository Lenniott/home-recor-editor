# 04: Preview-vs-export and bundled VAD leave Playwright

**What to build:** Sample-level preview/export parity and real VAD inference on the fixture WAV run in the unit suite. Playwright keeps user-facing flows only. Verification docs match.

**Blocked by:** export-session 01: Edited render matches preview at silence and cut boundaries

**Status:** done

- [x] `npm test` covers preview/export sample parity and VAD on the speech fixture
- [x] Playwright no longer hosts those two logic tests
- [x] README Verification list matches what e2e actually automates

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
