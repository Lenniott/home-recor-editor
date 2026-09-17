# 03: Play, pause, and seek against a fake audio context

**What to build:** Transport schedules the same chunks and gains the playback plan describes, without a real audio device. Pause maps playhead to source time. Seek updates playhead and reschedules if already playing.

**Blocked by:** 02: Construct playback from a session, not a module-load singleton

**Status:** done

- [x] Fake context records buffer sources, start/stop, gain ramps, and currentTime
- [x] Play with one and two tracks matches a known plan’s chunk start times and gains
- [x] Pause sets playhead to mapped source time and clears nodes
- [x] Seek while playing reschedules from the new position; empty session does not start playback

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
