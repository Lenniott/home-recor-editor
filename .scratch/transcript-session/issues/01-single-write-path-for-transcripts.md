# 01: Completed transcripts write through one session method

**What to build:** Whisper results attach words and status to the track that started the job, even if the user switched active speaker mid-queue. Identical words and status do not mark the project dirty again. Direct field writes from the transcript pane stop.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Queued job updates the track that started it, not only the active lane
- [x] Re-applying identical words and status does not bump dirty
- [x] Replacing audio still rejects stale results

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
