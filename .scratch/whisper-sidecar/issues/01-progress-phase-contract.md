# 01: Progress phases are a shared contract

**What to build:** Frontend and native job runner agree on progress phase names. Unknown phases are ignored safely. Job-id filtering stays as today.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Canonical phases: downloading, verifying, detecting, transcribing, transcribing-cpu, complete, error, cancelled
- [x] Frontend ignores unknown phases without dropping the job
- [x] Native tests emit expected phases for success, cancel, and error

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
