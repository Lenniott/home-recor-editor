# 01: Unified silence and cut marks

**What to build:** Silence and cut are rows in one marker list. Dragging silence across both lanes creates **one** mark with both `laneIds`; dragging an edge moves that single interval. One-lane silences stay one-lane (including opened v2 projects). Cuts always include every track. Mark / Unmark / cut suggestions / undo keep working. Convert-all still exists until 02.

**Blocked by:** None (can start immediately)

**Status:** done

**Mutex:** MARKERS

- [x] Cross-lane silence is one mark; resize does not desync lanes
- [x] Same-time one-lane silences on two tracks remain two marks
- [x] Same-lane overlapping silences still merge; cuts still merge
- [x] Cut stored with all track ids even if the user selected one lane
- [x] v2 projects open; v3 (or current version bump) save round-trips two-lane silence as one record
- [x] Editor Mark on both selected lanes uses the list (one id)
- [x] Cut suggestions still appear for overlapping displayed silences
- [x] README describes synced multi-lane silence (not “independent copies”)
- [x] LOG.md one line via log-work script

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`. Do not edit `.scratch/CONTINUE.md`.
