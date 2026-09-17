# 01: Merge layout and mono/stereo

**What to build:** Combined export is named **merge** (same summing as today’s mix). Every written WAV is stereo by default (mono sources copied L and R). A layout toggle can request mono (downmix). Full-timeline separate / merge / both / single-recording still work. No clips yet.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Mutex:** EXPORT

- [ ] `merge` writes `{stem}-merge.wav`; tests and menu use merge not mix
- [ ] Default stereo: one-channel source → two channels, L equals R
- [ ] Mono option → one channel
- [ ] Sample-rate mismatch still refuses before any write
- [ ] README export bullets match
- [ ] LOG.md one line via log-work script

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`. Do not edit `.scratch/CONTINUE.md`.
