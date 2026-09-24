<script lang="ts">
  import { editor } from "../editor.svelte";
  import type { MarkerType } from "../markers";
  import { player } from "../player";
  import Button from "./baseline/Button.svelte";

  let importText = $state("");
  let importError = $state<string | null>(null);
  let importStatus = $state("");

  function importMarkers(): void {
    importError = editor.addImportedMarkers(importText);
    importStatus = "";
    if (!importError) {
      importText = "";
      importStatus = "Markers added. Undo once to revert this import.";
      player.refreshIfPlaying();
    }
  }

  let typeFilter = $state<"all" | MarkerType>("all");
  let anchorId = $state<string | null>(null);

  const marks = $derived.by(() => {
    editor.revision;
    editor.cutMarks;
    return editor.markerList.all();
  });
  const visible = $derived(marks.filter((mark) => typeFilter === "all" || mark.type === typeFilter));

  function format(n: number): string {
    return n.toFixed(1);
  }

  function label(mark: (typeof marks)[number]): string {
    if (mark.type !== "cut") return `${mark.type} ${format(mark.start)} – ${format(mark.end)} s`;
    const applied = editor.cutMarks.find((cut) => cut.id === mark.id)?.applied;
    const range = applied ?? { start: mark.start, end: mark.end };
    return `cut ${format(range.start)} – ${format(range.end)} s`;
  }

  function onKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectVisible();
      return;
    }
    if (["Backspace", "Delete"].includes(event.key) && editor.selectedMarkIds.length) {
      event.preventDefault();
      editor.removeSelectedMarks();
    }
  }

  function selectVisible(): void {
    editor.selectMarks(visible.map((mark) => mark.id));
    anchorId = visible[0]?.id ?? null;
  }

  function clickMark(event: MouseEvent, id: string): void {
    if (event.shiftKey && anchorId) {
      const ids = visible.map((mark) => mark.id);
      const from = ids.indexOf(anchorId);
      const to = ids.indexOf(id);
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from];
        editor.selectMarks(ids.slice(start, end + 1));
        return;
      }
    }
    if (event.metaKey || event.ctrlKey) {
      editor.toggleMarkSelection(id);
      anchorId = id;
      return;
    }
    editor.selectMarks([id]);
    anchorId = id;
  }

  function onBuffer(event: Event): void {
    const ids = editor.selectedMarkIds.filter((id) => marks.some((mark) => mark.id === id && mark.type === "cut"));
    editor.setCutBufferMs(Number((event.currentTarget as HTMLInputElement).value), ids);
    player.refreshIfPlaying();
  }
</script>

<div class="marker-import">
  <label for="marker-json">Add markers from JSON</label>
  <p>Use original recording times and speaker names. Cuts affect every track. Existing marks are kept.</p>
  <textarea id="marker-json" rows="5" bind:value={importText} placeholder={'{"markers": [...]}'}></textarea>
  <Button size="tool" variant="secondary" disabled={!importText.trim() || !editor.hasAudio} onclick={importMarkers}>Add markers</Button>
  {#if importError}<p role="alert">{importError}</p>{/if}
  <p role="status">{importStatus}</p>
</div>

<div class="filter" role="radiogroup" aria-label="Marker type">
  {#each [["all", "All"], ["silence", "Silence"], ["cut", "Cuts"], ["export", "Export"]] as [value, name] (value)}
    <button type="button" aria-pressed={typeFilter === value} onclick={() => (typeFilter = value as "all" | MarkerType)}>{name}</button>
  {/each}
  <button type="button" onclick={selectVisible} disabled={visible.length === 0}>Select all</button>
</div>

<div
  class="marks-list"
  data-marks-list
  tabindex="0"
  role="listbox"
  aria-label="Marks"
  aria-multiselectable="true"
  onkeydown={onKeydown}
>
  {#each visible as mark (mark.id)}
    <button
      type="button"
      class="edit-row"
      class:selected={editor.selectedMarkIds.includes(mark.id)}
      role="option"
      aria-selected={editor.selectedMarkIds.includes(mark.id)}
      onclick={(event) => clickMark(event, mark.id)}
    >
      {label(mark)}
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
      {#if marks.some((mark) => mark.type === "cut" && editor.selectedMarkIds.includes(mark.id))}
        <label class="buffer">
          Cut buffer
          <input
            type="range"
            min="0"
            max="1000"
            step="10"
            value={editor.cutSettings.bufferMs}
            aria-label="Buffer selected cuts"
            onpointerdown={() => editor.beginEdit()}
            onpointerup={() => editor.endEdit()}
            onpointercancel={() => editor.endEdit()}
            oninput={onBuffer}
          />
          <span>{editor.cutSettings.bufferMs} ms</span>
        </label>
      {/if}
    </div>
  {/if}
</div>

<style>
  .marker-import { display: grid; gap: 0.4rem; margin-bottom: 0.8rem; }
  .marker-import p { margin: 0; font-size: 0.75rem; }
  textarea { width: 100%; box-sizing: border-box; resize: vertical; color: inherit; background: var(--panel); border: 1px solid var(--panel-line); border-radius: 4px; padding: 0.5rem; }

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
  .filter { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.5rem; }
  .filter button[aria-pressed="true"] { border-color: var(--amber); }
  .buffer { display: flex; align-items: center; gap: 0.4rem; width: 100%; font-size: 0.75rem; }
  .buffer input { flex: 1; }
</style>
