<script lang="ts">
  import { editor } from "../editor.svelte";
  import { player } from "../player";
  import IconClose from "./icons/IconClose.svelte";
  const range = $derived(editor.selectionRange);
  const scope = $derived(
    editor.markerAction === "cut"
      ? editor.tracks.length > 1
        ? "Both tracks"
        : "Track"
      : editor.selectionLabel,
  );
  function clearNative(): void {
    window.getSelection()?.removeAllRanges();
  }
  function mark(): void {
    editor.markAction();
    clearNative();
    player.refreshIfPlaying();
  }
  function unmark(): void {
    editor.unmarkAction();
    clearNative();
    player.refreshIfPlaying();
  }
  function chooseAction(event: Event): void {
    editor.markerAction = (event.currentTarget as HTMLSelectElement).value as
      | "silence"
      | "cut";
    editor.cutScopePreview = editor.markerAction === "cut";
  }
</script>

<div class="selection-bar" aria-label="Selection actions">
  <div class="scope">
    <strong>{range ? scope : ""}</strong>
    <span
      >{range
        ? range.start.toFixed(2) + " – " + range.end.toFixed(2) + " s"
        : ""}</span
    >
  </div>
  <label
    >Action
    <select
      aria-label="Marker action"
      value={editor.markerAction}
      onchange={chooseAction}
    >
      <option value="silence">Silence selected tracks</option>
      <option value="cut"
        >Cut {editor.tracks.length > 1 ? "both tracks" : "track"}</option
      >
    </select>
  </label>
  <button disabled={!range} onclick={mark}>Mark <kbd>M</kbd></button>
  <button
    disabled={!range || editor.actionOverlap === "unmarked"}
    onclick={unmark}>Unmark</button
  >
  <button
    class="icon-btn"
    disabled={!range}
    onclick={() => {
      editor.clearSelection();
      clearNative();
    }}
    aria-label="Clear selection"
  >
    <IconClose />
  </button>
</div>

<style>
  .selection-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 64px;
    padding: 0.85rem 0rem;
  }
  .scope {
    flex: 1;
    min-width: 100px;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
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
  label {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    font-size: 0.7rem;
    color: var(--cream-dim);
  }
  select {
    font: inherit;
    color: var(--cream);
    background: var(--panel);
    border: 1px solid var(--panel-line);
    border-radius: 5px;
    padding: 0.5rem;
  }
  button {
    width: 80px;
    white-space: nowrap;
    font-size: 0.75rem;
  }
  .icon-btn {
    width: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
  }
  kbd {
    opacity: 0.6;
    margin-left: 0.3rem;
  }
</style>
