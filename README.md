# Home Recor Editor

A Tauri + Svelte desktop audio editor with waveform selection, silence detection, and local text-based editing.

## Development on Apple Silicon macOS

Install Node.js, Rust, Xcode Command Line Tools, and CMake, then run:

```sh
npm install
npm run tauri dev
```

The Tauri development/build hooks compile the pinned **whisper.cpp v1.7.6** sidecar the first time. This requires internet access to download the checksum-verified source archive; later runs reuse the binary. The executable statically links whisper/ggml and embeds its Metal library, with only macOS system-library dependencies. The first version targets `aarch64-apple-darwin`.

```sh
npm run check
npm test
npm run tauri -- build --bundles app
```

`npm run build:whisper` rebuilds the engine when missing. Remove `src-tauri/binaries/whisper-cli-aarch64-apple-darwin` to force a rebuild. Engine binaries and build products are ignored by Git; the build hook recreates them for a clean checkout. The bundled engine license is in `src-tauri/binaries/whisper-LICENSE`.

## Edit by text

1. Open a recording, add the second synced speaker track if needed, and use the **Transcript** tab in the left pane.
2. Click **Download English model · 142 MB** once. The app downloads `base.en` over HTTPS, verifies its pinned checksum, and caches it under the app's cache directory. Cancelled or failed downloads are discarded.
3. Click **Transcribe all tracks**. Both recordings are processed sequentially and merged into one speaker-labelled conversation. VAD first identifies speech; only padded speech windows are converted to 16 kHz mono and sent to Whisper. Returned timestamps are mapped back to the original recording. No-speech recordings skip Whisper entirely. This reduces silence-driven hallucinations but cannot guarantee transcription accuracy. After model setup, no network connection is needed and no audio is uploaded.
4. Click a word to select its audio and move the playhead to its start. The current word highlights as playback moves. Drag across text to update the audio selection immediately; click transcript whitespace to clear it. With the transcript focused, use arrow keys to move by word, Shift to extend, and Home/End to reach the first/last word.
5. Choose **Silence selected tracks** or **Cut both tracks** in the fixed action picker, then use **Mark**, **Unmark**, or **M**. Escape clears selection; existing undo/redo and waveform controls continue to work.

Word timestamps are approximate. Audition the range and adjust its edges in the waveform when needed. Marks follow the editor's existing edge-buffer settings. Selecting text shows the full timeline so hidden audio can be selected too.

Transcripts save with the project and reload with it — no re-transcribing after a save/reopen. Silence and cut markers preserve original word timestamps. Cut passages stay visible with strikethrough and remain recoverable with undo or Unmark. Text cannot be changed or deleted directly, and this version does not automatically find filler words.

## Projects

**Save**/Cmd+S writes next to the recording the first time (`<name>.hre.json`) and to that same file afterward; **Save As…** picks a different location, independent of where the recording lives. **Open Project…** opens a `.hre.json` directly — if its recording has moved, you're prompted to locate it. Once a project has a save location, edits (including a finished transcript) autosave shortly after you stop making them; the toolbar shows Saving…/Saved/Unsaved changes. Writes are atomic, so an interrupted save never leaves a corrupt project file.

Each project records its recording's content hash (SHA-256) and duration. Opening a project requires all referenced recordings and matching source identities. Missing sources can be relinked; changed sources are rejected before replacing the current project. Legacy duration mismatches require the original recording. Project files predating this format (version 1, marks/settings only, no transcript) still open and upgrade to the current format on next save.

## Cleanup workflow

- Drag within one waveform to select that speaker; drag across both lanes to select both. Silence marks affect only the selected lanes. Selecting alone never applies a mark.
- Both marker actions use the same selection, Mark/Unmark, click-to-select, draggable edges, and undo workflow. A cut always spans both tracks and remains a pending marker until preview/export. Cut edges can also be dragged in the shared marker lane.
- Cleanup can run **VAD + silence floor** or the **silence floor only** across all tracks. Settings belong to the active speaker. Audio below the quiet floor is included even if it contains quiet speech. Scroll over a lane's dB ruler to amplify quiet detail down to −60 dB; scroll back out or double-click to restore the normal 0/−6/−12 view. The selected floor is drawn across each lane.
- **Silence gap** controls the minimum detected pause and the pause between transcript paragraphs. Speaker changes also start a new paragraph.
- **Cmd/Ctrl + +/−** zooms the shared timeline using the same zoom calculation as scrolling.
- **Edits** reviews overlap suggestions and existing markers. Audition includes one second of context on either side.
- **Convert all silences to shared cuts** changes every per-track silence marker into a project-wide cut in one undoable operation.
- **Original** plays the sources; **Preview edits** auditions all silence and cut markers. Only **Export** renders those edits into new audio files.
- Export shows its render, mix, encode, and file-writing progress in the export dialog after you choose what to write.
- Separate WAVs keep their channel layouts and share one rate and duration. The combined mix is stereo, with each track at half gain and mono sources centred.

## Verification

```sh
npm test
npm run check
cargo test --manifest-path src-tauri/Cargo.toml
npx playwright install chromium
npm run test:e2e
npm run tauri -- build --bundles app
```

Playwright tests the Svelte interface in Chromium with synthetic audio and a mocked Tauri bridge. It covers one/two-lane dragging, immediate transcript selection, pending cuts, default/minimum window layout, Cmd zoom, cut-edge dragging, actual bundled VAD inference on synthesized speech/silence, and an OfflineAudioContext comparison of preview versus exported samples. It does **not** automate the native macOS webview, file dialogs, or whisper executable.

The Rust suite covers transcript parsing, cancellation/process cleanup, interrupted model cleanup, and path decoding. Native acceptance still includes running both real speaker recordings through the downloaded model offline, saving/reopening their transcripts, and listening to preview and exported audio in the packaged app.

## Transcription implementation

Cleanup and transcription share a serialized VAD worker queue. Cancelling a running transcription VAD scan terminates that worker; subsequent requests create a fresh worker. Speech windows retain 200 ms of context and exclude long non-speaking gaps. Transcription reuses each track's mono analysis buffer so long recordings are not copied again before VAD.

The Rust backend owns one cancellable recognition/download job at a time. `transcription_model_status`, `download_transcription_model`, `start_transcription`, and `cancel_transcription` expose setup and processing. The start command accepts a binary WAV body with an `x-job-id` header; progress/completion arrives on `transcription-progress` with the matching job ID. Whisper starts with Metal acceleration and automatically retries the same job on CPU when Metal initialization fails. Cancelled and outdated results never replace the active transcript. Temporary WAV/JSON files are removed after success, failure, or cancellation.

The source archive is pinned by SHA-256 in `scripts/build-whisper.sh`. The model's SHA-1 is pinned to the value published in the upstream model manifest. Network transfers use the macOS system curl; model verification uses system shasum. See [whisper.cpp](https://github.com/ggml-org/whisper.cpp/tree/v1.7.6) for engine source and its experimental word-timestamp support.
