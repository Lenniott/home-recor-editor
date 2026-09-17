# 04: Export writes succeed for Unicode and long speaker names

**What to build:** A destination path with non-ASCII characters and speaker-derived file names round-trips through the write path and produces a valid WAV. Truncated or invalid encodings fail with a clear error instead of a silent bad path.

**Blocked by:** 03: Export session owns staging; the page only picks a destination

**Status:** done

- [ ] Written file exists and is a valid WAV
- [ ] Decoded destination matches the original path
- [ ] Invalid percent-encoding or invalid UTF-8 returns a clear error

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
