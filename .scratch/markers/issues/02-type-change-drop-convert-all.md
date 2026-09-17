# 02: Type change; drop convert-all

**What to build:** A mark can change type. The new type’s lane rule applies (anything → cut covers all tracks, then same-type merge). Convert all silences to shared cuts is gone; changing selected silences to cut is the replacement (selection UI may still be single-mark until 03). One undo step per type change.

**Blocked by:** 01: Unified silence and cut marks

**Status:** ready-for-agent

**Mutex:** MARKERS

- [ ] Silence on one lane → cut expands to all tracks
- [ ] Cut → silence stays on all tracks (synced mute)
- [ ] Overlapping silences set to cut become one cut
- [ ] Convert-all control and README bullet are gone
- [ ] Type change undoes in one step
- [ ] LOG.md one line via log-work script

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`. Do not edit `.scratch/CONTINUE.md`.
