<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import { decodeAudioFile, mixToMono } from "$lib/audio/decode";
  import { editor } from "$lib/editor.svelte";
  import { player } from "$lib/player";
  import Waveform from "$lib/components/Waveform.svelte";
  import SilenceControls from "$lib/components/SilenceControls.svelte";
  import Transport from "$lib/components/Transport.svelte";

  let isLoading = $state(false);
  let loadError: string | null = $state(null);

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
    try {
      // The command returns a raw ipc::Response, which invoke() surfaces as an
      // ArrayBuffer. Falls back to a plain number array on platforms where that
      // isn't supported, matching how @tauri-apps/plugin-fs handles the same case.
      const raw = await invoke<ArrayBuffer | number[]>("read_audio_file", { path: selected });
      const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : Uint8Array.from(raw);
      const buffer = await decodeAudioFile(bytes, player.getContext());
      const mono = mixToMono(buffer);
      const fileName = selected.split(/[\\/]/).pop() ?? selected;
      editor.loadAudio(buffer, fileName, mono);
    } catch (err) {
      loadError = describeError(err);
    } finally {
      isLoading = false;
    }
  }

  function describeError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  function onKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    const isFormField = !!target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    if (e.code === "Space" && !isFormField) {
      e.preventDefault();
      player.toggle();
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
      <span class="filename">{editor.fileName ?? "No recording loaded"}</span>
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
