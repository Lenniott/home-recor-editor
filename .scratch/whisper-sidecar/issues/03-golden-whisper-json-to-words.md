# 03: Golden Whisper JSON parses to expected word times

**What to build:** A checked-in fixture from the pinned engine’s JSON output parses to known word start/end times after speech-window restore. A breaking engine format fails this test.

**Blocked by:** Sample JSON fixture from the pinned whisper-cli `-oj` output

**Status:** ready-for-agent

- [ ] Fixture matches the bundled engine version
- [ ] Parse + restore yields expected word times
- [ ] Failure message names a format break, not a generic assertion

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
