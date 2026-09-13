<script lang="ts">
  import { editor } from "../editor.svelte";
  const range = $derived(editor.selectionRange);
  const scope = $derived(
    editor.markerAction === "cut"
      ? editor.tracks.length > 1
        ? "Both tracks"
        : "Track"
      : editor.selectionLabel,
  );
</script>

{#if range}
  <div class="selection-bar" aria-label="Selection">
    <div class="scope">
      <strong>{scope}</strong>
      <span>{range.start.toFixed(2)} – {range.end.toFixed(2)} s</span>
    </div>
  </div>
{/if}

<style>
  .selection-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    min-height: 0;
    padding: 0;
  }
  .scope {
    flex: 1;
    min-width: 100px;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    overflow: hidden;
  }
  strong {
    font-size: 0.78rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  span {
    font-size: 0.7rem;
    color: var(--cream-dim);
    font-family: var(--font-mono);
  }
</style>
