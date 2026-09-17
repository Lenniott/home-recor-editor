# 02: Clips scope on runExport

**What to build:** `runExport` can write **clips** from export marks instead of the whole timeline. Nested silences mute and cuts splice inside each mark. Two-lane mark follows merge/separate/both; one-lane mark is always one file. Zero marks → error and no writes. Empty-after-cuts clip skipped. Never overwrite. Names `{stem}-clip-{n}.wav` in start-time order; separate adds speaker.

**Blocked by:** 01: Merge layout and mono/stereo; `.scratch/markers/issues/04-export-mark-type.md`

**Status:** ready-for-agent

**Mutex:** EXPORT

- [ ] Two-lane merge clip → one `{stem}-clip-1.wav`
- [ ] One-lane mark → one file for separate, merge, and both
- [ ] Two-lane separate → two speaker-suffixed clip files
- [ ] Zero marks: error, zero writes
- [ ] Skip clip with no samples left; write the rest
- [ ] Existing destination file: error, no clobber
- [ ] Silence inside the mark is audible in the PCM as mute (literal)
- [ ] LOG.md one line via log-work script

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`. Do not edit `.scratch/CONTINUE.md`.
