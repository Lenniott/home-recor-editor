# TDD briefs — project-session

**Worker:** `.scratch/WORKER.md`  
**Tickets:** `issues/`

Seam for this area: **project session** — open recordings, open project, save, relink — with injected read/write/pick adapters. Page chrome calls it; tests never mount the page for Wave 1.

---

## 01

**Branch:** `tdd/project-session/01-import-recording-companion-project`  
**Mutex:** PAGE  
**Seam:** `openRecordings({ files, desktop })` (name may vary; one function tests call). Desktop adapter: `readAudio`, `readText`, `writeText`. Returns `{ tracks, projectPath, error, blockedSavePath }`.

**First red:** `it("imports one recording with no companion project as an empty unmarked session")`  
Expect: one track, no error, `projectPath` null, zero marks. Inject audio bytes + `readText` → not found.

**Prove red:** `npm test -- src/lib/projectSession.test.ts` (create this file with the first test). Fail: module missing.

**Next reds (one per cycle):** companion v2 restores marks and sets `projectPath`; unreadable companion sets error and `blockedSavePath`.

**Out of scope:** autosave timer, Open Project relink, real dialogs, page markup.

---

## 02

**Branch:** `tdd/project-session/02-atomic-project-writes`  
**Mutex:** RUST_IO  
**Seam:** native `write_text_file` (temp + rename). Frontend: save failure sets error and does not mark saved.

**First red:** `#[test] fn write_text_file_replaces_only_after_full_contents_are_on_disk`  
Expect: after a simulated incomplete sibling write, the original JSON is still valid JSON.

**Prove red:** `cargo test --manifest-path src-tauri/Cargo.toml write_text_file_replaces`

**Next reds:** JS test — failed `writeText` leaves dirty and surfaces save error (adapter throws).

**Out of scope:** page `$effect` debounce (ticket 03).

---

## 03

**Branch:** `tdd/project-session/03-first-save-save-as-autosave`  
**Mutex:** PAGE  
**Seam:** `saveProject` / `scheduleAutosave` on the project session module.

**First red:** `it("does not autosave until the session has a project path")`  
Expect: after import with no companion, `writeText` call count 0 after debounce.

**Prove red:** `npm test -- src/lib/projectSession.test.ts`

**Next reds:** first save writes beside recording; Save As changes path; edit during save stays dirty.

**Out of scope:** relink dialogs.

---

## 04

**Branch:** `tdd/project-session/04-open-project-relink-recordings`  
**Mutex:** PAGE  
**Seam:** `openProjectFile({ path, desktop })`.

**First red:** `it("leaves the current session unchanged when Locate is cancelled")`  
Expect: prior marks still present; no error string.

**Prove red:** `npm test -- src/lib/projectSession.test.ts`

**Next reds:** two sources found restore both; hash mismatch does not replace session.

**Out of scope:** Playwright.

---

## 05

**Branch:** `tdd/project-session/05-upgrade-legacy-companion-on-save`  
**Mutex:** PAGE  
**Seam:** same import function as 01.

**First red:** `it("refuses a legacy companion whose duration does not match the recording")`  
Expect: known error sentence from README; no marks applied.

**Prove red:** `npm test -- src/lib/projectSession.test.ts`

**Next reds:** matching duration restores marks; next `save` serializes version 2 with sha256.

**Out of scope:** Open Project entry (06).

---

## 06

**Branch:** `tdd/project-session/06-open-project-legacy-files`  
**Mutex:** PAGE  
**Decision:** Open Project rejects legacy; import is the restore path.

**First red:** `it("openProjectFile rejects a version-1 document with a message to import the recording")`  
Expect: no session replace; error mentions import.

**Prove red:** `npm test -- src/lib/projectSession.test.ts`

**Next reds:** README Verification/Projects sentence matches; current-format still opens.

**Out of scope:** changing import behavior.
