# 04: Optional sidecar smoke: tiny WAV completes offline

**What to build:** A documented or CI-optional smoke: minimal WAV → start transcription → complete with non-empty words, on one target OS. Cancel and timeout remain covered by existing native tests. Not required for day-to-day frontend work.

**Blocked by:** 01: Progress phases are a shared contract; bundled whisper-cli and model cache on the runner

**Status:** blocked-external

Skip script `npm run test:whisper-smoke` is in `package.json` and exits 0 unless `WHISPER_SMOKE=1`. Live smoke needs the sidecar binary under `src-tauri/binaries` (not present on this machine).

- [x] One-OS smoke is documented (CI optional)
- [ ] Complete event includes non-empty transcription
- [x] Existing cancel tests remain the fast gate

---

**Agent:** Follow `.scratch/WORKER.md`. Use this area's `TDD.md` section matching this ticket number for seam, first red, prove-red command, and out of scope. Orchestration and branch names: `.scratch/DELIVERY.md`.
