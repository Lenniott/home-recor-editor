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

1. Open a recording and expand **Edit by text** below the waveform.
2. Click **Download English model · 142 MB** once. The app downloads `base.en` over HTTPS, verifies its pinned checksum, and caches it under the app's cache directory. Cancelled or failed downloads are discarded.
3. Click **Transcribe**. The current audio is converted to 16 kHz mono and processed locally. After model setup, no network connection is needed and no audio is uploaded.
4. Click a word to select its audio and move the playhead to its start. The current word highlights as playback moves. Drag across text to update the audio selection immediately; click transcript whitespace to clear it. With the transcript focused, use arrow keys to move by word, Shift to extend, and Home/End to reach the first/last word.
5. Use **Mark selection**, **Unmark selection**, or **M**. Escape clears selection; existing undo/redo and waveform controls continue to work.

Word timestamps are approximate. Audition the range and adjust its edges in the waveform when needed. Marks follow the editor's existing edge-buffer settings. Selecting text shows the full timeline so hidden audio can be selected too.

Transcripts save with the project and reload with it — no re-transcribing after a save/reopen. Opening a different recording or applying an audio removal/mute clears the current transcript; click **Transcribe again** for updated timings. Text cannot be changed or deleted directly, and this version does not automatically find filler words.

## Projects

**Save**/Cmd+S writes next to the recording the first time (`<name>.hre.json`) and to that same file afterward; **Save As…** picks a different location, independent of where the recording lives. **Open Project…** opens a `.hre.json` directly — if its recording has moved, you're prompted to locate it. Once a project has a save location, edits (including a finished transcript) autosave shortly after you stop making them; the toolbar shows Saving…/Saved/Unsaved changes. Writes are atomic, so an interrupted save never leaves a corrupt project file.

Each project records its recording's content hash (SHA-256) and duration. Reopening against a file whose bytes have changed clamps marks to the new duration and drops the transcript — its word timestamps can't be trusted against audio that's no longer the same. Project files predating this format (version 1, marks/settings only, no transcript) still open and upgrade to the current format on next save.

## Transcription implementation

The Rust backend owns one cancellable job at a time. `transcription_model_status`, `download_transcription_model`, `start_transcription`, and `cancel_transcription` expose setup and processing. The start command accepts a binary WAV body with an `x-job-id` header; progress/completion arrives on `transcription-progress` with the matching job ID. Cancelled and outdated results never replace the active transcript. Temporary WAV/JSON files are removed after success, failure, or cancellation.

The source archive is pinned by SHA-256 in `scripts/build-whisper.sh`. The model's SHA-1 is pinned to the value published in the upstream model manifest. Network transfers use the macOS system curl; model verification uses system shasum. See [whisper.cpp](https://github.com/ggml-org/whisper.cpp/tree/v1.7.6) for engine source and its experimental word-timestamp support.
