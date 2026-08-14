<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import { decodeAudioFile, mixToMono } from "$lib/audio/decode";
  import { editor } from "$lib/editor.svelte";
  import { player } from "$lib/player";
  import { parseProjectFile, serializeProject, sidecarPath } from "$lib/projectFile";
  import { vadDetector } from "$lib/vadDetector";
  import Waveform from "$lib/components/Waveform.svelte";
  import SilenceControls from "$lib/components/SilenceControls.svelte";
  import Transport from "$lib/components/Transport.svelte";

  // Spin up the VAD worker at app start rather than waiting for the first
  // Detect click — see vadDetector.warmUp() for why that timing matters.
  vadDetector.warmUp();

  let isLoading = $state(false);
  let loadError: string | null = $state(null);
  let isSaving = $state(false);
  let saveStatus: string | null = $state(null);
  let saveStatusTimeout: ReturnType<typeof setTimeout> | undefined;

  async function openRecording(): Promise<void> {
    loadError = null;

    let selected: string | string[] | null;
    try {
      selected = await open({
        multiple: false,
        filters: [{ name: "Audio", extensions: ["wav", "mp3", "m4a", "aac", "flac", "ogg", "aiff"] }],
      });
    } catch (err) {
      loadError = describeError(err);
      return;
    }
    if (!selected || Array.isArray(selected)) return;

    isLoading = true;
    saveStatus = null;
    try {
      // The command returns a raw ipc::Response, which invoke() surfaces as an
      // ArrayBuffer. Falls back to a plain number array on platforms where that
      // isn't supported, matching how @tauri-apps/plugin-fs handles the same case.
      const raw = await invoke<ArrayBuffer | number[]>("read_audio_file", { path: selected });
      const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : Uint8Array.from(raw);
      const buffer = await decodeAudioFile(bytes, player.getContext());
      const mono = mixToMono(buffer);
      const fileName = selected.split(/[\\/]/).pop() ?? selected;
      editor.loadAudio(buffer, fileName, mono, selected);
      await loadProjectIfPresent(selected);
    } catch (err) {
      loadError = describeError(err);
    } finally {
      isLoading = false;
    }
  }

  /**
   * Restore a previously saved sidecar for this recording, if one exists.
   * A missing or unreadable sidecar is the normal first-open case, so it
   * silently leaves the freshly-loaded (empty) marks in place rather than
   * surfacing an error.
   */
  async function loadProjectIfPresent(audioPath: string): Promise<void> {
    try {
      const text = await invoke<string | null>("read_text_file", { path: sidecarPath(audioPath) });
      if (!text) return;
      const project = parseProjectFile(text);
      if (project) editor.applyProject(project);
    } catch {
      // Sidecar read failed (permissions, corrupt file, etc.) — keep going with empty marks.
    }
  }

  async function saveProject(): Promise<void> {
    if (!editor.filePath || isSaving) return;
    isSaving = true;
    try {
      const contents = serializeProject(editor.toProject());
      await invoke("write_text_file", { path: sidecarPath(editor.filePath), contents });
      showSaveStatus("Saved");
    } catch (err) {
      showSaveStatus(`Save failed: ${describeError(err)}`);
    } finally {
      isSaving = false;
    }
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
    const isFormField = !!target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      // Always take over Cmd/Ctrl+S, even in form fields, so the browser's
      // "save page" dialog never has a chance to appear.
      e.preventDefault();
      saveProject();
    } else if (e.code === "Space" && !isFormField) {
      e.preventDefault();
      player.toggle();
    } else if (e.code === "Escape" && editor.hasSelection) {
      editor.clearSelection();
    } else if (e.key.toLowerCase() === "m" && !isFormField && editor.hasSelection) {
      e.preventDefault();
      editor.toggleSelectionMark();
      player.refreshIfPlaying();
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
      <button class="save" onclick={saveProject} disabled={!editor.filePath || isSaving}>
        {isSaving ? "Saving…" : "Save"}
      </button>
      <span class="filename">{editor.fileName ?? "No recording loaded"}</span>
      {#if saveStatus}
        <span class="save-status">{saveStatus}</span>
      {/if}
    </div>
    <SilenceControls />
  </header>

  <section class="stage">
    <Waveform />
  </section>

  <footer class="transport-bar">
    <Transport />
  </footer>

  {#if loadError}
    <p class="error">{loadError}</p>
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

  .stage {
    flex: 1;
    min-height: 0;
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
