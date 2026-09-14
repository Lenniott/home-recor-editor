# 03: Export session owns staging; the page only picks a destination

**What to build:** Choosing Export still writes the same files (edited recording, separate tracks, mix, or both) with the same progress stages. Staging, naming, encoding, and writes live behind one interface the page calls after the user picks a file or folder.

**Blocked by:** 01: Edited render matches preview at silence and cut boundaries

**Status:** ready-for-agent

- [ ] Single-track Export edited recording still writes one WAV with existing naming
- [ ] Two-track Separate / Mix / Both still write the same set of files
- [ ] Progress stages still paint (prepare, render, write, complete)
- [ ] Unit tests of render/mix/names do not go through the page

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
