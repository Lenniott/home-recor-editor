# 02: Combined mix matches dual-track preview

**What to build:** Combined mix export follows the same equal-gain stereo rules as listening to both tracks: mono sources centred, stereo preserved, tail silence for shorter tracks, peaks clamped to full scale.

**Blocked by:** 01: Edited render matches preview at silence and cut boundaries

**Status:** ready-for-agent

- [ ] Documented max error bound vs a dual-track OfflineAudio preview
- [ ] Cases: two mono tracks, mixed mono+stereo, unequal lengths
- [ ] Two full-scale sources clamp to 1 rather than wrapping

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
