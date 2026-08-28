<script lang="ts">
  import type { Track } from "../session.svelte";

  interface Props {
    track: Track;
    focused: boolean;
    /** Compact: filename + marker nav + expand. Full: adds the per-track settings (offset, apply, save/export, remove). Owned per row, not page-wide. */
    expanded: boolean;
    onToggleExpanded: () => void;
    onRemove: () => void;
    onSave: () => void;
    onExport: () => void;
  }

  let { track, focused, expanded, onToggleExpanded, onRemove, onSave, onExport }: Props = $props();

  const editor = $derived(track.editor);
  const player = $derived(track.player);

  const markerCount = $derived(editor.markers.filter((r) => r.displayed).length);

  let applyError: string | null = $state(null);

  function onOffsetInput(e: Event): void {
    editor.offsetSec = Number((e.currentTarget as HTMLInputElement).value) / 1000;
  }

  // Same destructive-no-undo tradeoff as the single-track app: baking
  // silence/remove into this track's buffer can't be undone (see
  // `EditorState.applySilenceMarked`), so a confirm() is the only safety
  // net, and playback is paused first so it isn't scheduled against a
  // buffer that's about to disappear.
  function applySilence(): void {
    if (!confirm("Apply silence to this track's marked regions? This can't be undone — re-open the file to revert.")) return;
    applyError = null;
    player.pause();
    try {
      editor.applySilenceMarked();
    } catch (err) {
      applyError = err instanceof Error ? err.message : String(err);
    }
  }

  function applyRemove(): void {
    if (!confirm("Remove this track's marked regions? This can't be undone — re-open the file to revert.")) return;
    applyError = null;
    player.pause();
    try {
      editor.applyRemoveMarked();
    } catch (err) {
      applyError = err instanceof Error ? err.message : String(err);
    }
  }
</script>

<div class="trackcontrol" class:focused class:full={expanded} role="group" aria-label={editor.fileName ?? "Track"}>
  <div class="header">
    <span class="filename" title={editor.fileName ?? undefined}>{editor.fileName ?? "Untitled track"}</span>
    <button class="expand" onclick={onToggleExpanded} aria-expanded={expanded} title={expanded ? "Collapse track settings" : "Expand track settings"}>
      {expanded ? "Collapse" : "Expand"}
    </button>
  </div>

  <div class="marker-nav">
    <button onclick={() => player.goToAdjacentMarkedRegion("prev")} disabled={markerCount === 0} title="Previous marked region">◀</button>
    <span class="readout">{markerCount} region{markerCount === 1 ? "" : "s"}</span>
    <button onclick={() => player.goToAdjacentMarkedRegion("next")} disabled={markerCount === 0} title="Next marked region">▶</button>
  </div>

  {#if expanded}
    <label class="offset" title="Manual sync offset against the other tracks, in milliseconds">
      <span class="label">Sync</span>
      <input type="number" step="10" value={Math.round(editor.offsetSec * 1000)} oninput={onOffsetInput} />
      <span class="unit">ms</span>
    </label>

    <div class="apply-actions">
      <button class="apply" onclick={applySilence} disabled={markerCount === 0} title="Mute this track's marked regions in place — duration unchanged">
        Apply silence
      </button>
      <button class="apply" onclick={applyRemove} disabled={markerCount === 0} title="Cut this track's marked regions out — duration shortens">
        Apply remove
      </button>
    </div>

    {#if applyError}
      <p class="apply-error">{applyError}</p>
    {/if}

    <div class="file-actions">
      <button class="save" onclick={onSave} disabled={!editor.filePath} title="Save markers/settings alongside this file">Save</button>
      <button class="export" onclick={onExport} disabled={!editor.hasAudio} title="Export this track alone as a WAV">Export</button>
      <button class="remove" onclick={onRemove} title="Remove this track" aria-label="Remove track">Remove</button>
    </div>
  {/if}
</div>

<style>
  .trackcontrol {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 240px;
    flex-shrink: 0;
    overflow-y: auto;
    padding: 0.6rem;
    background: var(--panel);
    border: 1px solid var(--panel-line);
    border-radius: 6px;
  }

  .trackcontrol.full {
    width: 100%;
  }

  .trackcontrol.focused {
    border-color: var(--amber);
    box-shadow: 0 0 0 1px var(--amber) inset;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .filename {
    flex: 1;
    min-width: 0;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--cream-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .expand {
    flex-shrink: 0;
    font-size: 0.72rem;
    padding: 0.2rem 0.5rem;
  }

  .marker-nav {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .marker-nav button {
    font-size: 0.68rem;
    padding: 0.2rem 0.45rem;
    line-height: 1;
  }

  .readout {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--cream-dim);
    white-space: nowrap;
  }

  .offset {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.72rem;
    color: var(--cream-dim);
  }

  .offset input {
    width: 4.5rem;
  }

  .apply-actions,
  .file-actions {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .apply,
  .save,
  .export,
  .remove {
    font-size: 0.72rem;
    padding: 0.2rem 0.5rem;
  }

  .apply {
    color: var(--in-color);
    border-color: var(--in-color);
  }

  .apply:hover:not(:disabled) {
    background: rgba(209, 73, 91, 0.16);
  }

  .apply-error {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--in-color);
  }

  .remove {
    opacity: 0.7;
  }

  .remove:hover {
    opacity: 1;
    color: var(--in-color);
    border-color: var(--in-color);
  }
</style>
