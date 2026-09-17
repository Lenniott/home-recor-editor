# 05: Upgrade a legacy companion project on next save

**What to build:** User imports a recording whose companion is the old marks-only format. Matching duration restores marks and settings. Next Save writes the current format with SHA-256 and duration on the source. Mismatched duration refuses the legacy marks and asks for the original recording.

**Blocked by:** 01: Import one recording and restore marks from a companion project

**Status:** done

- [ ] Duration mismatch → legacy error; session not given those marks
- [ ] Duration match → marks, view, and settings restored; transcript missing
- [ ] Next save is current format with source hash and duration fields

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
