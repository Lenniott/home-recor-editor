<script lang="ts">
  import { onMount } from "svelte";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import { decodeAudioFile, mixToMono } from "$lib/audio/decode";
  import { encodeWav } from "$lib/audio/encodeWav";
  import { adjacentMarkedRegion } from "$lib/audio/markerNav";
  import { EditorState } from "$lib/editor.svelte";
  import { session, type Track } from "$lib/session.svelte";
  import {
    parseProjectFile,
    serializeProject,
    sidecarPath,
  } from "$lib/projectFile";
  import { vadDetector } from "$lib/vadDetector";
  import SilenceControls from "$lib/components/SilenceControls.svelte";
  import Timeline from "$lib/components/Timeline.svelte";
  import TrackRow from "$lib/components/TrackRow.svelte";

  // Spin up the VAD worker at app start rather than waiting for the first
  // Detect click — see vadDetector.warmUp() for why that timing matters.
  vadDetector.warmUp();

  const AUDIO_EXTENSIONS = ["wav", "mp3", "m4a", "aac", "flac", "ogg", "aiff"];

  let isLoading = $state(false);
  let loadError: string | null = $state(null);
  let saveStatus: string | null = $state(null);
  let saveStatusTimeout: ReturnType<typeof setTimeout> | undefined;
  let isExporting = $state(false);
  let exportError: string | null = $state(null);
  let dragActive = $state(false);

  let detectSettingsOpen = $state(true);
  let isDetectingJoint = $state(false);
  let jointError: string | null = $state(null);
  let isExportingJoint = $state(false);

  function formatTime(totalSeconds: number): string {
    const s = Math.max(0, totalSeconds);
    const minutes = Math.floor(s / 60);
    const seconds = s - minutes * 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
  }

  // Any AudioContext works for decoding — grab the first track's once one
  // exists, otherwise spin up a throwaway one just for decode. Each track
  // gets its own playback AudioContext lazily via its own AudioPlayer
  // (see `session.addTrack`), so this is purely a decode-time convenience.
  let decodeContext: AudioContext | null = null;
  function getDecodeContext(): AudioContext {
    if (!decodeContext) decodeContext = new AudioContext();
    return decodeContext;
  }

  async function addTrackFromPath(path: string): Promise<void> {
    // The command returns a raw ipc::Response, which invoke() surfaces as an
    // ArrayBuffer. Falls back to a plain number array on platforms where that
    // isn't supported, matching how @tauri-apps/plugin-fs handles the same case.
    const raw = await invoke<ArrayBuffer | number[]>("read_audio_file", {
      path,
    });
    const bytes =
      raw instanceof ArrayBuffer ? new Uint8Array(raw) : Uint8Array.from(raw);
    const buffer = await decodeAudioFile(bytes, getDecodeContext());
    const mono = mixToMono(buffer);
    const fileName = path.split(/[\\/]/).pop() ?? path;

    const editor = new EditorState();
    editor.loadAudio(buffer, fileName, mono, path);
    session.addTrack(editor);
    await loadProjectIfPresent(editor, path);
  }

  /** "Add Track(s)" — the one entry point for loading audio, any number at once, no fixed track count or role. */
  async function addTracks(): Promise<void> {
    loadError = null;
    let selected: string | string[] | null;
    try {
      selected = await open({
        multiple: true,
        filters: [{ name: "Audio", extensions: AUDIO_EXTENSIONS }],
      });
    } catch (err) {
      loadError = describeError(err);
      return;
    }
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];

    isLoading = true;
    try {
      for (const path of paths) {
        try {
          await addTrackFromPath(path);
        } catch (err) {
          loadError = `${path.split(/[\\/]/).pop()}: ${describeError(err)}`;
        }
      }
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    // Native OS drag-and-drop (files dragged in from Finder/Explorer) —
    // `event.paths` are real filesystem paths, matching how every other
    // load path in this app reads a file (by path, via `read_audio_file`).
    const unlisten = getCurrentWebview().onDragDropEvent(async (event) => {
      const payload = event.payload;
      if (payload.type === "enter" || payload.type === "over") {
        dragActive = true;
      } else if (payload.type === "drop") {
        dragActive = false;
        loadError = null;
        isLoading = true;
        try {
          for (const path of payload.paths) {
            try {
              await addTrackFromPath(path);
            } catch (err) {
              loadError = `${path.split(/[\\/]/).pop()}: ${describeError(err)}`;
            }
          }
        } finally {
          isLoading = false;
        }
      } else {
        dragActive = false;
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  });

  /**
   * Restore a previously saved sidecar for this recording, if one exists.
   * A missing or unreadable sidecar is the normal first-open case, so it
   * silently leaves the freshly-loaded (empty) marks in place rather than
   * surfacing an error.
   */
  async function loadProjectIfPresent(
    editor: EditorState,
    audioPath: string,
  ): Promise<void> {
    try {
      const text = await invoke<string | null>("read_text_file", {
        path: sidecarPath(audioPath),
      });
      if (!text) return;
      const project = parseProjectFile(text);
      if (project) editor.applyProject(project);
    } catch {
      // Sidecar read failed (permissions, corrupt file, etc.) — keep going with empty marks.
    }
  }

  async function saveTrack(editor: EditorState): Promise<void> {
    if (!editor.filePath) return;
    try {
      const contents = serializeProject(editor.toProject());
      await invoke("write_text_file", {
        path: sidecarPath(editor.filePath),
        contents,
      });
      showSaveStatus("Saved");
    } catch (err) {
      showSaveStatus(`Save failed: ${describeError(err)}`);
    }
  }

  /**
   * Encodes `track.audioBuffer` (the current take, including any applied
   * silence/remove edits — never the preview) and writes it to a
   * user-chosen path. `write_audio_file` takes the encoded bytes as a raw
   * binary IPC body rather than a JSON args object — see its Rust-side
   * comment — so `wavBytes` is passed directly as `invoke`'s args and the
   * destination path rides along as a header instead.
   */
  async function exportTrack(editor: EditorState): Promise<void> {
    const buffer = editor.audioBuffer;
    if (!buffer || isExporting) return;

    exportError = null;
    const stem = (editor.fileName ?? "export").replace(/\.[^./\\]+$/, "");
    let destination: string | null;
    try {
      destination = await save({
        defaultPath: `${stem}.wav`,
        filters: [{ name: "WAV", extensions: ["wav"] }],
      });
    } catch (err) {
      exportError = describeError(err);
      return;
    }
    if (!destination) return;

    isExporting = true;
    try {
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
        buffer.getChannelData(i),
      );
      const wavBytes = encodeWav(channels, buffer.sampleRate);
      await invoke("write_audio_file", wavBytes, {
        headers: { path: destination },
      });
      showSaveStatus("Exported");
    } catch (err) {
      exportError = describeError(err);
    } finally {
      isExporting = false;
    }
  }

  function removeTrack(track: Track): void {
    session.removeTrack(track);
  }

  async function detectJointSilence(): Promise<void> {
    if (isDetectingJoint) return;
    jointError = null;
    isDetectingJoint = true;
    try {
      await session.detectJointSilence();
    } catch (err) {
      jointError = describeError(err);
    } finally {
      isDetectingJoint = false;
    }
  }

  function applyJointRemove(): void {
    if (
      !confirm(
        "Remove the joint silence regions from every track? This can't be undone — re-open the files to revert.",
      )
    )
      return;
    jointError = null;
    try {
      session.applyJointRemove();
    } catch (err) {
      jointError = describeError(err);
    }
  }

  function applyJointSilence(): void {
    if (
      !confirm(
        "Mute the joint silence regions on every track? This can't be undone — re-open the files to revert.",
      )
    )
      return;
    jointError = null;
    try {
      session.applyJointSilence();
    } catch (err) {
      jointError = describeError(err);
    }
  }

  async function exportJoint(): Promise<void> {
    if (isExportingJoint) return;
    jointError = null;
    let destination: string | null;
    try {
      destination = await save({
        defaultPath: "mix.wav",
        filters: [{ name: "WAV", extensions: ["wav"] }],
      });
    } catch (err) {
      jointError = describeError(err);
      return;
    }
    if (!destination) return;

    isExportingJoint = true;
    try {
      const { bytes } = session.exportJoint();
      await invoke("write_audio_file", bytes, {
        headers: { path: destination },
      });
      showSaveStatus("Exported mix");
    } catch (err) {
      jointError = describeError(err);
    } finally {
      isExportingJoint = false;
    }
  }

  /** The focused track's playhead position translated onto shared session time — the reference point cross-track marker nav steps from. */
  function focusedSessionSec(): number {
    const t = session.focusedTrack;
    return t ? t.editor.playheadSec + t.editor.offsetSec : 0;
  }

  function goToAdjacentJointRegion(direction: "next" | "prev"): void {
    const region = adjacentMarkedRegion(
      session.jointRegions,
      focusedSessionSec(),
      direction,
    );
    if (!region) return;
    session.seek(region.start);
  }

  function showSaveStatus(message: string): void {
    saveStatus = message;
    clearTimeout(saveStatusTimeout);
    saveStatusTimeout = setTimeout(() => (saveStatus = null), 3000);
  }

  function describeError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  function onKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    const isFormField =
      !!target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    const focused = session.focusedTrack;
    const key = e.key.toLowerCase();

    if ((e.metaKey || e.ctrlKey) && key === "s") {
      // Always take over Cmd/Ctrl+S, even in form fields, so the browser's
      // "save page" dialog never has a chance to appear.
      e.preventDefault();
      if (focused) void saveTrack(focused.editor);
      return;
    }
    if (e.code === "Space" && !isFormField) {
      // Play is universal — every track together, not just the focused
      // one (see `SessionState.toggle`) — so this doesn't require a track
      // to be focused, unlike the per-track shortcuts below.
      e.preventDefault();
      session.toggle();
      return;
    }
    if (!focused) return;
    const { editor, player } = focused;

    if ((e.metaKey || e.ctrlKey) && key === "z") {
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
    } else if (e.code === "Escape" && editor.hasSelection) {
      editor.clearSelection();
    } else if (key === "m" && !isFormField && editor.hasSelection) {
      e.preventDefault();
      editor.toggleSelectionMark();
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
  <header class="toolbar overall">
    <div class="row">
      <button class="add" onclick={addTracks} disabled={isLoading}>
        {isLoading ? "Loading…" : "Add Track(s)"}
      </button>
      <span class="hint">or drag audio files anywhere in the window</span>

      <button
        class="play"
        onclick={() => session.toggle()}
        disabled={session.tracks.length === 0}
        title="Play/pause every track together (Space)"
      >
        {session.isPlaying ? "⏸ Pause" : "▶ Play"}
      </button>
      <span class="time">{formatTime(session.playheadSec)}</span>

      {#if saveStatus}
        <span class="save-status">{saveStatus}</span>
      {/if}

      <div class="spacer"></div>

      <div
        class="joint-nav"
        role="group"
        aria-label="Marker navigation across all tracks"
      >
        <button
          onclick={() => goToAdjacentJointRegion("prev")}
          disabled={session.jointRegions.length === 0}
          title="Previous joint-silence region">◀</button
        >
        <span class="readout"
          >{session.jointRegions.length} joint region{session.jointRegions
            .length === 1
            ? ""
            : "s"}</span
        >
        <button
          onclick={() => goToAdjacentJointRegion("next")}
          disabled={session.jointRegions.length === 0}
          title="Next joint-silence region">▶</button
        >
      </div>

      <button
        class="toggle-detect"
        onclick={() => (detectSettingsOpen = !detectSettingsOpen)}
      >
        {detectSettingsOpen ? "Hide detection settings" : "Detection settings"}
      </button>
    </div>

    {#if detectSettingsOpen}
      <div class="detect-panel">
        {#if session.focusedTrack}
          <SilenceControls
            editor={session.focusedTrack.editor}
            player={session.focusedTrack.player}
          />
        {:else}
          <p class="hint">
            Select a track below to adjust its detection settings.
          </p>
        {/if}
      </div>
    {/if}

    {#if session.canJoin}
      <div class="joint-actions">
        <span class="label">All tracks:</span>
        <button onclick={detectJointSilence} disabled={isDetectingJoint}>
          {isDetectingJoint
            ? "Detecting…"
            : "Detect silence when nobody's speaking"}
        </button>
        <button
          onclick={applyJointSilence}
          disabled={session.jointRegions.length === 0}>Apply silence</button
        >
        <button
          onclick={applyJointRemove}
          disabled={session.jointRegions.length === 0}>Apply remove</button
        >
        <button onclick={exportJoint} disabled={isExportingJoint}>
          {isExportingJoint ? "Exporting…" : "Export mix"}
        </button>
      </div>
    {/if}

    {#if jointError}
      <p class="error">{jointError}</p>
    {/if}
  </header>

  <section class="stage" class:drag-active={dragActive}>
    {#if session.tracks.length === 0}
      <div class="empty">
        <p>No tracks loaded</p>
        <p class="hint">
          Add Track(s) above, or drag audio files into this window.
        </p>
      </div>
    {:else}
      {@const view = {
        startSec: session.viewStartSec,
        durationSec: session.viewDurationSec,
      }}
      <div class="timeline-area">
        <Timeline {view} />
        <div class="tracks-container">
          {#each session.tracks as track (track.editor)}
            <TrackRow
              {track}
              {view}
              onViewChange={(startSec, durationSec) =>
                session.setView(startSec, durationSec)}
              onRemove={() => removeTrack(track)}
              onSave={() => saveTrack(track.editor)}
              onExport={() => exportTrack(track.editor)}
            />
          {/each}
        </div>
      </div>
    {/if}
    {#if dragActive}
      <div class="drop-overlay">Drop to add as a track</div>
    {/if}
  </section>

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

  .toolbar .row {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    flex-wrap: wrap;
  }

  .spacer {
    flex: 1;
  }

  .hint {
    font-size: 0.78rem;
    color: var(--cream-dim);
    opacity: 0.75;
  }

  .save-status {
    font-size: 0.8rem;
    color: var(--out-color);
  }

  .play {
    min-width: 5.5rem;
  }

  .time {
    font-family: var(--font-mono);
    font-size: 0.85rem;
    color: var(--amber);
  }

  .joint-nav {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .joint-nav .readout {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--cream-dim);
    white-space: nowrap;
  }

  .detect-panel {
    padding-top: 0.5rem;
    border-top: 1px solid var(--panel-line);
  }

  .joint-actions {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    padding-top: 0.5rem;
    border-top: 1px solid var(--panel-line);
  }

  .joint-actions .label {
    font-family: var(--font-label);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--cream-dim);
  }

  .stage {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow-y: auto;
  }

  .stage.drag-active {
    outline: 2px dashed var(--amber);
    outline-offset: -2px;
    border-radius: 6px;
  }

  /* Shared with compact TrackControls width so the ruler sits over remaining lanes, not the chrome. Inset stays 240px as long as any compact waveform exists. */
  .timeline-area {
    --track-controls-width: 240px;
    --track-gap: 0.6rem;
    min-width: 0;
    overflow: hidden;
  }

  .timeline-area:not(:has(:global(.control-row:not(.full)))) {
    --track-controls-width: 0px;
    --track-gap: 0px;
  }

  .timeline-area :global(.timeline) {
    position: sticky;
    top: 0;
    z-index: 1;
    margin-left: calc(var(--track-controls-width) + var(--track-gap));
    width: calc(100% - var(--track-controls-width) - var(--track-gap));
    border-radius: 0;
    border-left: none;
    border-right: none;
    border-top: none;
  }

  .tracks-container {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: 100%;
  }

  .empty {
    height: 100%;
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

  .drop-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(226, 163, 60, 0.12);
    color: var(--amber);
    font-family: var(--font-label);
    letter-spacing: 0.04em;
    pointer-events: none;
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
