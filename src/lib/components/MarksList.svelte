<script lang="ts">
  import { editor } from "../editor.svelte";
  import { player } from "../player";
  import Button from "./baseline/Button.svelte";

  const marks = $derived.by(() => {
    editor.revision;
    return editor.markerList.all();
  });

  function format(n: number): string {
    return n.toFixed(1);
  }

  function onKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      editor.selectAllMarks();
      return;
    }
    if (["Backspace", "Delete"].includes(event.key) && editor.selectedMarkIds.length) {
      event.preventDefault();
      editor.removeSelectedMarks();
    }
  }

  function clickMark(event: MouseEvent, id: string): void {
    if (event.metaKey || event.ctrlKey) {
      editor.toggleMarkSelection(id);
      return;
    }
    editor.selectMarks([id]);
  }
</script>

<div
  class="marks-list"
  data-marks-list
  tabindex="0"
  role="listbox"
  aria-label="Marks"
  aria-multiselectable="true"
  onkeydown={onKeydown}
>
  {#each marks as mark (mark.id)}
    <button
      type="button"
      class="edit-row"
      class:selected={editor.selectedMarkIds.includes(mark.id)}
      role="option"
      aria-selected={editor.selectedMarkIds.includes(mark.id)}
      onclick={(event) => clickMark(event, mark.id)}
    >
      {mark.type} {format(mark.start)} – {format(mark.end)} s
    </button>
  {/each}
  {#if editor.selectedMarkIds.length}
    <div class="edit-row actions">
      <Button size="tool" variant="secondary" onclick={() => { editor.setSelectedType("cut"); player.refreshIfPlaying(); }}
        >Change to cut</Button
      >
      <Button size="tool" variant="secondary" onclick={() => { editor.setSelectedType("silence"); player.refreshIfPlaying(); }}
        >Change to silence</Button
      >
      <Button size="tool" variant="secondary" onclick={() => { editor.setSelectedType("export"); player.refreshIfPlaying(); }}
        >Change to export</Button
      >
      <Button size="tool" variant="secondary" onclick={() => { editor.removeSelectedMarks(); player.refreshIfPlaying(); }}
        >Remove</Button
      >
    </div>
  {/if}
</div>

<style>
  .marks-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    outline: none;
  }
  .marks-list:focus-visible {
    box-shadow: inset 0 0 0 1px var(--amber);
  }
  .edit-row {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    text-align: left;
    font: inherit;
    color: inherit;
    background: var(--panel);
    border: 1px solid var(--panel-line);
    border-radius: 4px;
    padding: 0.35rem 0.5rem;
    cursor: pointer;
  }
  .edit-row.selected {
    border-color: var(--amber);
  }
</style>
