<script lang="ts">
  import { editor, type Range } from "../editor.svelte";
  import { player } from "../player";
  import { keptToSource } from "../audio/timelineMap";
  import { laneLayout } from "../audio/laneLayout";
  import IconCaret from "./icons/IconCaret.svelte";

  /**
   * The shared cut lane: one strip aligned with the waveform lanes above
   * it, showing the cuts already accepted and the suggestions still
   * waiting on a decision, plus the review controls for stepping through
   * them (previous/next, audition, accept, dismiss, accept all).
   *
   * A cut belongs to the project, not to a track — accepting one removes
   * the same seconds from every lane at once, which is what keeps two
   * synced recordings synced.
   */
  let { reviewOnly = false, stripOnly = false }: { reviewOnly?: boolean; stripOnly?: boolean } = $props();
  let width: number = $state(0);
  let index: number = $state(0);
  let edgeDrag: {index:number;edge:"start"|"end"} | null = null;
  function startEdge(event: PointerEvent): void {
    if (editor.preview !== "original") return;
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-cut-index]");
    if (!target) return;
    const box = target.getBoundingClientRect();
    const edge = Math.abs(event.clientX-box.left) < 8 ? "start" : Math.abs(event.clientX-box.right) < 8 ? "end" : null;
    if (!edge) return;
    edgeDrag = {index:Number(target.dataset.cutIndex),edge};
    editor.beginEdit();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function moveEdge(event: PointerEvent): void {
    if (!edgeDrag) return;
    const x = event.clientX-(event.currentTarget as HTMLElement).getBoundingClientRect().left;
    editor.moveCut(edgeDrag.index,edgeDrag.edge,keptToSource(editor.timelineSpans,layout.xToKept(x)));
  }
  function endEdge(): void {
    if (!edgeDrag) return;
    editor.finishCutDrag();
    edgeDrag = null;
    editor.endEdit();
    player.refreshIfPlaying();
  }
  function selectCut(range: Range): void {
    editor.markerAction = "cut";
    editor.setSelection(range.start,range.end,editor.tracks.map(t => t.id));
    editor.cutScopePreview = true;
  }

  const suggestions = $derived(editor.cutSuggestionList);
  // Suggestions are recomputed from detection, so the list shifts under the
  // cursor as they're accepted/dismissed; clamp rather than store a range.
  const current = $derived(suggestions.length > 0 ? suggestions[Math.min(index, suggestions.length - 1)] : null);
  const layout = $derived(laneLayout(editor.timelineSpans, editor.viewStartSec, editor.viewDurationSec, width));

  function band(range: Range): { left: number; width: number } | null {
    const startX = layout.sourceToX(range.start, "start");
    const endX = layout.sourceToX(range.end, "end");
    if (endX < 0 || startX > width) return null;
    return { left: startX, width: Math.max(2, endX - startX) };
  }

  function step(delta: number): void {
    if (suggestions.length === 0) return;
    index = (Math.min(index, suggestions.length - 1) + delta + suggestions.length) % suggestions.length;
    const next = suggestions[index];
    if (next) player.audition(next);
  }

  function audition(range: Range): void {
    const at = suggestions.findIndex((s) => s.start === range.start && s.end === range.end);
    if (at >= 0) index = at;
    player.audition(range);
  }

  function accept(range: Range): void {
    editor.addCut(range);
    player.refreshIfPlaying();
  }

  function dismiss(range: Range): void {
    editor.dismissCut(range);
    player.refreshIfPlaying();
  }

  function acceptAll(): void {
    editor.acceptAllCuts();
    player.refreshIfPlaying();
  }

  function restore(range: Range): void {
    editor.restoreCut(range);
    player.refreshIfPlaying();
  }

  function formatTime(totalSeconds: number): string {
    const s = Math.max(0, totalSeconds);
    const minutes = Math.floor(s / 60);
    const seconds = s - minutes * 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
  }
</script>

<div class="cut-lane" class:review-only={reviewOnly}>
  {#if !reviewOnly}
  <div class="lane-label">
    <span class="name">Shared cuts</span>
    <span class="meta">{editor.cuts.length} cut{editor.cuts.length === 1 ? "" : "s"}</span>
  </div>

  <div class="strip" bind:clientWidth={width} aria-label="Shared cut lane" role="group" onpointerdown={startEdge} onpointermove={moveEdge} onpointerup={endEdge} onpointercancel={endEdge}>
    {#each editor.cuts as cut, cutIndex}
      {@const box = band(cut)}
      {#if box}
        <button
          type="button"
          class="mark cut"
          data-cut-index={cutIndex}
          style="left:{box.left}px;width:{box.width}px"
          title="Cut {formatTime(cut.start)}–{formatTime(cut.end)} — select to edit, drag either edge"
          onclick={() => selectCut(cut)}
          aria-label="Select cut at {formatTime(cut.start)}"
        ></button>
      {/if}
    {/each}
    {#each suggestions as suggestion (`${suggestion.start}-${suggestion.end}`)}
      {@const box = band(suggestion)}
      {#if box}
        <button
          type="button"
          class="mark suggestion"
          class:current={current === suggestion}
          style="left:{box.left}px;width:{box.width}px"
          title="Suggested cut {formatTime(suggestion.start)}–{formatTime(suggestion.end)} — click to audition"
          onclick={() => audition(suggestion)}
          aria-label="Audition suggested cut at {formatTime(suggestion.start)}"
        ></button>
      {/if}
    {/each}
  </div>

  {/if}
  {#if !stripOnly}
  <div class="review">
    <span class="label">Suggestions</span>
    <button type="button" class="icon-btn" onclick={() => step(-1)} disabled={suggestions.length === 0} aria-label="Previous suggestion">
      <IconCaret dir="left" />
    </button>
    <span class="readout">
      {suggestions.length === 0 ? "0 / 0" : `${Math.min(index, suggestions.length - 1) + 1} / ${suggestions.length}`}
    </span>
    <button type="button" class="icon-btn" onclick={() => step(1)} disabled={suggestions.length === 0} aria-label="Next suggestion">
      <IconCaret dir="right" />
    </button>
    {#if current}
      <span class="range">{formatTime(current.start)}&ndash;{formatTime(current.end)}</span>
      <button type="button" onclick={() => audition(current)}>Audition</button>
      <button type="button" class="accept" onclick={() => accept(current)}>Mark cut</button>
      <button type="button" class="dismiss" onclick={() => dismiss(current)}>Dismiss</button>
    {/if}
    <button type="button" onclick={acceptAll} disabled={suggestions.length === 0}>Mark all suggestions</button>
  </div>
  {/if}
</div>

<style>
  .cut-lane.review-only { display: block; }
  .review-only .review { gap: .5rem; }
  .cut-lane {
    display: grid;
    grid-template-columns: var(--lane-label-width) 1fr;
    align-items: center;
    gap: 0.5rem 0.75rem;
  }

  .lane-label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .name {
    font-family: var(--font-label);
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--cream-dim);
  }

  .meta {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--cream-dim);
  }

  .strip {
    position: relative;
    height: 26px;
    background: var(--panel);
    border: 1px solid var(--panel-line);
    border-radius: 4px;
    overflow: hidden;
  }

  .mark {
    position: absolute;
    top: 0;
    bottom: 0;
    padding: 0;
    border-radius: 0;
    border: 1px solid transparent;
  }

  .mark.cut {
    background: rgba(209, 73, 91, 0.35);
    border-color: var(--in-color);
  }

  .mark.suggestion {
    background: rgba(226, 163, 60, 0.16);
    border: 1px dashed var(--amber);
  }

  .mark.suggestion.current {
    background: rgba(226, 163, 60, 0.4);
    border-style: solid;
  }

  .review {
    grid-column: 2;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .label {
    font-family: var(--font-label);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--cream-dim);
  }

  .readout,
  .range {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--amber);
    white-space: nowrap;
  }

  .review button {
    font-size: 0.72rem;
    padding: 0.25rem 0.55rem;
    white-space: nowrap;
  }

  .review .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
  }

  .review .accept {
    color: var(--out-color);
    border-color: var(--out-color);
  }

  .review .dismiss {
    color: var(--in-color);
    border-color: var(--in-color);
  }
</style>
