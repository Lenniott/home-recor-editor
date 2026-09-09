<script lang="ts">
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import { renderEdited } from "$lib/audio/applyEdits";
  import { decodeAudioFile, mixToMono } from "$lib/audio/decode";
  import { encodeWav } from "$lib/audio/encodeWav";
  import { editor } from "$lib/editor.svelte";
  import { sha256Hex } from "$lib/hash";
  import { player } from "$lib/player";
  import { parseProjectFile, sidecarPath } from "$lib/projectFile";
  import { parsePodcastProject, resolveSourcePath, serializePodcastProject, type PodcastProject } from "$lib/projectV2";
  import { vadDetector } from "$lib/vadDetector";
  import TrackLane from "$lib/components/TrackLane.svelte";
  import SilenceControls from "$lib/components/SilenceControls.svelte";
  import TranscriptPanel from "$lib/components/TranscriptPanel.svelte";
  import Transport from "$lib/components/Transport.svelte";

  // Spin up the VAD worker at app start rather than waiting for the first
  // Detect click — see vadDetector.warmUp() for why that timing matters.
  vadDetector.warmUp();

  const AUDIO_FILTER = [{ name: "Audio", extensions: ["wav", "mp3", "m4a", "aac", "flac", "ogg", "aiff"] }];
  const PROJECT_FILTER = [{ name: "Recor Project", extensions: ["json"] }];
  /** Debounce so a run of quick edits (a drag, a settings slider) writes once, not on every intermediate tick. */
  const AUTOSAVE_DELAY_MS = 1500;

  interface LoadedAudio {
    buffer: AudioBuffer;
    mono: Float32Array;
    sha256: string;
    path: string;
    name: string;
  }

  let isLoading = $state(false);
  let loadError: string | null = $state(null);
  let isSaving = $state(false);
  let saveError: string | null = $state(null);
  let isExporting = $state(false);
  let exportError: string | null = $state(null);
  let exportStatus: string | null = $state(null);
  let exportStatusTimeout: ReturnType<typeof setTimeout> | undefined;
  let autosaveTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Read, hash, and decode a recording in that order: `decodeAudioFile`
   * takes ownership of (detaches) `bytes`' backing buffer, so hashing has
   * to see the raw bytes first — see `hash.ts`/`decode.ts`.
   */
  async function readAndHashAudio(path: string): Promise<LoadedAudio> {
    // The command returns a raw ipc::Response, which invoke() surfaces as an
    // ArrayBuffer. Falls back to a plain number array on platforms where that
    // isn't supported, matching how @tauri-apps/plugin-fs handles the same case.
    const raw = await invoke<ArrayBuffer | number[]>("read_audio_file", { path });
    const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : Uint8Array.from(raw);
    const sha256 = await sha256Hex(bytes);
    const buffer = await decodeAudioFile(bytes, player.getContext());
    return { buffer, mono: mixToMono(buffer), sha256, path, name: path.split(/[\\/]/).pop() ?? path };
  }

  async function pickAudio(title?: string): Promise<string | null> {
    const selected = await open({ multiple: false, title, filters: AUDIO_FILTER });
    return selected && !Array.isArray(selected) ? selected : null;
  }

  /** Open a recording as a new single-track project, restoring its saved project if there is one. */
  async function openRecording(): Promise<void> {
    loadError = null;

    let selected: string | null;
    try {
      selected = await pickAudio();
    } catch (err) {
      loadError = describeError(err);
      return;
    }
    if (!selected) return;

    isLoading = true;
    saveError = null;
    try {
      const loaded = await readAndHashAudio(selected);
      editor.loadAudio(loaded.buffer, loaded.name, loaded.mono, loaded.path, loaded.sha256);
      await loadProjectIfPresent(loaded);
    } catch (err) {
      loadError = describeError(err);
    } finally {
      isLoading = false;
    }
  }

  /**
   * Add a second, already-synced recording as its own lane. Same start
   * time is assumed (no alignment UI); a different length is fine — the
   * shorter track's missing tail simply counts as silence.
   */
  async function addTrack(): Promise<void> {
    loadError = null;
    let selected: string | null;
    try {
      selected = await pickAudio("Open second track");
    } catch (err) {
      loadError = describeError(err);
      return;
    }
    if (!selected) return;

    isLoading = true;
    try {
      const loaded = await readAndHashAudio(selected);
      player.pause();
      editor.addTrack(loaded.buffer, loaded.name, loaded.mono, loaded.path, loaded.sha256);
    } catch (err) {
      loadError = describeError(err);
    } finally {
      isLoading = false;
    }
  }

  /**
   * Restore a previously saved sidecar for a just-opened recording, if one
   * exists. A missing or unreadable sidecar is the normal first-open case,
   * so it silently leaves the freshly-loaded (empty) marks in place rather
   * than surfacing an error.
   */
  async function loadProjectIfPresent(loaded: LoadedAudio): Promise<void> {
    const path = sidecarPath(loaded.path);
    try {
      const text = await invoke<string | null>("read_text_file", { path });
      if (text) await applyProjectText(text, path, loaded);
    } catch {
      // Sidecar read failed (permissions, corrupt file, etc.) — keep going with empty marks.
    }
  }

  /**
   * Apply a loaded project's text against a just-opened recording, trying
   * the current (version 2) format first and falling back to a version-1
   * sidecar from before `projectV2.ts` existed. Silently leaves the
   * freshly-loaded (empty) marks in place if neither format parses — a
   * corrupt sidecar should never block opening the audio itself.
   */
  async function applyProjectText(text: string, path: string, preloaded: LoadedAudio): Promise<void> {
    let project: PodcastProject;
    try {
      project = parsePodcastProject(text);
    } catch {
      // Not a valid version-2 project — fall through to the legacy format.
      const legacy = parseProjectFile(text);
      if (legacy) editor.applyLegacyProject(legacy, path);
      return;
    }
    await openParsedProject(project, path, preloaded, false);
  }

  /**
   * Load every track a parsed project references and hand them to the
   * editor in the project's own order, so each saved track lines up with
   * the recording decoded for it (see `EditorState.applyProjectV2`).
   * `preloaded` is a recording that's already open, so opening a project
   * from its own audio doesn't decode that file twice. With `allowRelink`,
   * a source that has moved prompts for its new location; otherwise a
   * second track that can't be read is simply left out rather than
   * blocking the rest of the project.
   */
  async function openParsedProject(
    project: PodcastProject,
    projectPath: string,
    preloaded: LoadedAudio | null,
    allowRelink: boolean,
  ): Promise<void> {
    const loaded: LoadedAudio[] = [];
    for (const [index, track] of project.tracks.entries()) {
      if (index === 0 && preloaded) {
        loaded.push(preloaded);
        continue;
      }
      const resolved = resolveSourcePath(projectPath, track.source.path);
      try {
        loaded.push(await readAndHashAudio(resolved));
        continue;
      } catch (err) {
        if (!allowRelink) {
          // Nothing to prompt with (this project came along for the ride
          // with an audio file the user opened): keep whatever loaded.
          if (index === 0) throw err;
          break;
        }
      }
      // Moved or renamed since the project was saved — ask where it went.
      const relocated = await pickAudio(`Locate "${track.source.name}"`);
      if (!relocated) {
        if (index === 0) return;
        break;
      }
      loaded.push(await readAndHashAudio(relocated));
    }
    if (loaded.length === 0) return;

    const [first, ...rest] = loaded;
    editor.loadAudio(first.buffer, first.name, first.mono, first.path, first.sha256);
    for (const track of rest) editor.addTrack(track.buffer, track.name, track.mono, track.path, track.sha256);
    editor.applyProjectV2(project, projectPath);
  }

  /**
   * Open a `.hre.json` project file directly, without opening its
   * recordings first — for a project saved somewhere other than next to
   * its audio (see `saveProjectAs`). `editor.applyProjectV2` verifies each
   * resolved file's actual identity against what the project remembers
   * before reusing any of its marks or transcript timestamps.
   */
  async function openProject(): Promise<void> {
    loadError = null;
    saveError = null;

    let selected: string | string[] | null;
    try {
      selected = await open({ multiple: false, filters: PROJECT_FILTER });
    } catch (err) {
      loadError = describeError(err);
      return;
    }
    if (!selected || Array.isArray(selected)) return;

    isLoading = true;
    try {
      const text = await invoke<string | null>("read_text_file", { path: selected });
      if (!text) throw new Error("Project file not found.");
      let project: PodcastProject;
      try {
        project = parsePodcastProject(text);
      } catch (err) {
        throw new Error(`Not a valid project file: ${describeError(err)}`);
      }
      await openParsedProject(project, selected, null, true);
    } catch (err) {
      loadError = describeError(err);
    } finally {
      isLoading = false;
    }
  }

  /**
   * Write the project. `destination` picks a new save location (see
   * `saveProjectAs`); otherwise reuses `editor.projectPath` if the
   * project has one, or falls back to the sidecar convention on first
   * save. Captures `editor.revision` before building/writing the
   * snapshot so a save only marks itself clean through the edits it
   * actually captured — see `EditorState.markSaved`.
   */
  async function saveProject(destination?: string): Promise<void> {
    if (!editor.filePath || isSaving) return;
    const path = destination ?? editor.projectPath ?? sidecarPath(editor.filePath);
    isSaving = true;
    saveError = null;
    const revision = editor.revision;
    try {
      const contents = serializePodcastProject(editor.toProjectV2(path));
      await invoke("write_text_file", { path, contents });
      editor.projectPath = path;
      editor.markSaved(revision);
    } catch (err) {
      saveError = describeError(err);
    } finally {
      isSaving = false;
    }
  }

  /** Choose a new location for the project file, independent of where its recordings live. */
  async function saveProjectAs(): Promise<void> {
    if (!editor.filePath || isSaving) return;
    const stem = (editor.fileName ?? "project").replace(/\.[^./\\]+$/, "");
    let destination: string | null;
    try {
      destination = await save({ defaultPath: `${stem}.hre.json`, filters: PROJECT_FILTER });
    } catch (err) {
      saveError = describeError(err);
      return;
    }
    if (!destination) return;
    await saveProject(destination);
  }

  // Autosave: once the project has a save location, write it shortly
  // after each change rather than requiring a manual Cmd+S every time —
  // see `editor.dirty`. Re-evaluates whenever `dirty` or `projectPath`
  // change, including right after a save completes (which is what stops
  // the loop once there's nothing left to write).
  $effect(() => {
    const dirty = editor.dirty;
    const path = editor.projectPath;
    clearTimeout(autosaveTimer);
    if (dirty && path) autosaveTimer = setTimeout(() => void saveProject(), AUTOSAVE_DELAY_MS);
  });

  /**
   * Render the active track the way the edited preview sounds it — its
   * own silences muted in place, the shared cuts spliced out (see
   * `renderEdited`) — and write it to a user-chosen path. Nothing is
   * baked into the loaded audio, so exporting is repeatable and the
   * project stays editable. Separate/combined two-track export is a
   * follow-up; for now this exports whichever lane is active.
   *
   * `write_audio_file` takes the encoded bytes as a raw binary IPC body
   * rather than a JSON args object — see its Rust-side comment — so
   * `wavBytes` is passed directly as `invoke`'s args and the destination
   * path rides along as a header instead.
   */
  async function exportRecording(): Promise<void> {
    const track = editor.activeTrack;
    const buffer = track?.audioBuffer;
    if (!track || !buffer || isExporting) return;

    exportError = null;
    const stem = (track.fileName ?? "export").replace(/\.[^./\\]+$/, "");
    let destination: string | null;
    try {
      destination = await save({
        defaultPath: `${stem}-edited.wav`,
        filters: [{ name: "WAV", extensions: ["wav"] }],
      });
    } catch (err) {
      exportError = describeError(err);
      return;
    }
    if (!destination) return;

    isExporting = true;
    exportStatus = null;
    try {
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
      const edited = renderEdited(channels, buffer.sampleRate, track.markedIntervals, editor.cuts);
      const wavBytes = encodeWav(edited, buffer.sampleRate);
      await invoke("write_audio_file", wavBytes, { headers: { path: destination } });
      exportStatus = "Exported";
      clearTimeout(exportStatusTimeout);
      exportStatusTimeout = setTimeout(() => (exportStatus = null), 3000);
    } catch (err) {
      exportError = describeError(err);
    } finally {
      isExporting = false;
    }
  }

  function describeError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  function onKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    const isFormField = !!target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    const key = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && key === "s") {
      // Always take over Cmd/Ctrl+S, even in form fields, so the browser's
      // "save page" dialog never has a chance to appear.
      e.preventDefault();
      saveProject();
    } else if ((e.metaKey || e.ctrlKey) && key === "z") {
      // Same takeover as Cmd/Ctrl+S above, even while a slider has focus —
      // otherwise the webview's own text-field undo could swallow the key.
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
      player.refreshIfPlaying();
    } else if ((e.metaKey || e.ctrlKey) && key === "y") {
      // Windows/Linux redo convention, alongside Cmd/Ctrl+Shift+Z above.
      e.preventDefault();
      editor.redo();
      player.refreshIfPlaying();
    } else if (e.code === "Space" && !isFormField) {
      e.preventDefault();
      player.toggle();
    } else if (e.code === "Escape" && editor.hasSelection) {
      editor.clearSelection();
      window.getSelection()?.removeAllRanges();
    } else if (key === "m" && !isFormField && editor.hasSelection) {
      e.preventDefault();
      editor.toggleSelectionMark();
      window.getSelection()?.removeAllRanges();
      player.refreshIfPlaying();
    } else if (key === "]" && !isFormField) {
      e.preventDefault();
      player.goToAdjacentMarkedRegion("next");
    } else if (key === "[" && !isFormField) {
      e.preventDefault();
      player.goToAdjacentMarkedRegion("prev");
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<main class="app">
  <header class="toolbar">
    <div class="file-controls">
      <button class="open" onclick={openRecording} disabled={isLoading}>
        {isLoading ? "Opening…" : "Open Recording"}
      </button>
      <button class="open" onclick={addTrack} disabled={isLoading || !editor.canAddTrack} title="Add a second, already-synced recording as its own lane">
        Open Track 2…
      </button>
      <button class="open" onclick={openProject} disabled={isLoading}>Open Project…</button>
      <button class="save" onclick={() => saveProject()} disabled={!editor.filePath || isSaving}>
        {isSaving ? "Saving…" : "Save"}
      </button>
      <button class="save" onclick={saveProjectAs} disabled={!editor.filePath || isSaving}>Save As…</button>
      <button
        class="export"
        onclick={exportRecording}
        disabled={!editor.hasAudio || isExporting}
        title={editor.tracks.length > 1 ? "Export the active track with its silences and the shared cuts applied" : "Export with silences and cuts applied"}
      >
        {isExporting ? "Exporting…" : editor.tracks.length > 1 ? "Export Track" : "Export"}
      </button>
      <span class="filename">{editor.fileName ?? "No recording loaded"}</span>
      {#if saveError}
        <span class="save-status error">Save failed: {saveError}</span>
      {:else if isSaving}
        <span class="save-status">Saving…</span>
      {:else if editor.projectPath}
        <span class="save-status">{editor.dirty ? "Unsaved changes" : "Saved"}</span>
      {/if}
      {#if exportStatus}
        <span class="save-status">{exportStatus}</span>
      {/if}
    </div>
    <SilenceControls />
  </header>

  <section class="stage">
    {#if editor.tracks.length === 0}
      <div class="empty">
        <p>No recording loaded</p>
        <p class="hint">Open a recording to see its waveform.</p>
      </div>
    {:else}
      {#each editor.tracks as track (track.id)}
        <TrackLane {track} />
      {/each}
    {/if}
  </section>

  <TranscriptPanel />

  <footer class="transport-bar">
    <Transport />
  </footer>

  {#if loadError}
    <p class="error">{loadError}</p>
  {/if}
  {#if exportError}
    <p class="error">Export failed: {exportError}</p>
  {/if}
</main>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 1rem;
    gap: 0.75rem;
  }

  .toolbar {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.85rem 1rem;
    background: var(--panel);
    border: 1px solid var(--panel-line);
    border-top: 1px solid var(--panel-highlight);
    border-radius: 6px;
  }

  .file-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.9rem;
  }

  .filename {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--cream-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .save-status {
    font-size: 0.8rem;
    color: var(--out-color);
  }

  .save-status.error {
    color: var(--in-color);
  }

  .stage {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    color: var(--cream-dim);
    background: var(--panel);
    border: 1px solid var(--panel-line);
    border-radius: 6px;
  }

  .empty p {
    margin: 0;
    letter-spacing: 0.04em;
  }

  .empty .hint {
    font-size: 0.8rem;
    opacity: 0.6;
  }

  .transport-bar {
    padding: 0.85rem 1rem;
    background: var(--panel);
    border: 1px solid var(--panel-line);
    border-bottom: 1px solid #171310;
    border-radius: 6px;
  }

  .error {
    margin: 0;
    padding: 0.6rem 1rem;
    background: rgba(209, 73, 91, 0.15);
    border: 1px solid var(--in-color);
    border-radius: 6px;
    color: var(--in-color);
    font-size: 0.85rem;
  }
</style>
