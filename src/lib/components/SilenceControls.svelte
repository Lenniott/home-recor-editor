<script lang="ts">
  import { currentRegionNumber } from "../audio/markerNav";
  import { editor, type ViewFilter } from "../editor.svelte";
  import { player } from "../player";

  const markerCount = $derived(editor.markers.filter((r) => r.displayed).length);
  const currentNumber = $derived(currentRegionNumber(editor.markedIntervals, editor.playheadSec));

  const VIEW_FILTERS: { value: ViewFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "hideMarked", label: "Hide marked" },
    { value: "hideUnmarked", label: "Hide unmarked" },
  ];

  function applyViewFilter(filter: ViewFilter): void {
    editor.setViewFilter(filter);
    player.refreshIfPlaying();
  }

  function toggleMuteMarked(): void {
    editor.setMuteMarked(!editor.muteMarked);
    player.refreshIfPlaying();
  }

  function markSelection(): void {
    editor.markSelection();
    player.refreshIfPlaying();
  }

  function unmarkSelection(): void {
    editor.unmarkSelection();
    player.refreshIfPlaying();
  }

  function onThreshold(e: Event): void {
    editor.setPositiveSpeechThreshold(Number((e.currentTarget as HTMLInputElement).value));
  }

  function onMinSilence(e: Event): void {
    editor.setMinSilenceMs(Number((e.currentTarget as HTMLInputElement).value));
  }

  function onBuffer(e: Event): void {
    editor.setBufferMs(Number((e.currentTarget as HTMLInputElement).value));
  }

  // The three settings sliders fire `oninput` on every drag tick, but a
  // drag should still cost one undo step, not one per tick — same
  // transaction-around-the-gesture pattern as Waveform's pointer drags.
  function beginSliderEdit(): void {
    editor.beginEdit();
  }

  function endSliderEdit(): void {
    editor.endEdit();
  }

  function formatTime(totalSeconds: number): string {
    const s = Math.max(0, totalSeconds);
    const minutes = Math.floor(s / 60);
    const seconds = s - minutes * 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
  }
</script>

<div class="silence-controls">
  <label class="control">
    <span class="label">VAD threshold</span>
    <input
      type="range"
      min="0.1"
      max="0.9"
      step="0.05"
      value={editor.settings.positiveSpeechThreshold}
      oninput={onThreshold}
      onpointerdown={beginSliderEdit}
      onpointerup={endSliderEdit}
      onpointercancel={endSliderEdit}
      disabled={!editor.hasAudio}
    />
    <span class="value">{editor.settings.positiveSpeechThreshold.toFixed(2)}</span>
  </label>

  <label class="control">
    <span class="label">Min length</span>
    <input
      type="range"
      min="50"
      max="3000"
      step="50"
      value={editor.settings.minSilenceMs}
      oninput={onMinSilence}
      onpointerdown={beginSliderEdit}
      onpointerup={endSliderEdit}
      onpointercancel={endSliderEdit}
      disabled={!editor.hasAudio}
    />
    <span class="value">{editor.settings.minSilenceMs} ms</span>
  </label>

  <label class="control">
    <span class="label">Buffer</span>
    <input
      type="range"
      min="0"
      max="1000"
      step="10"
      value={editor.settings.bufferMs}
      oninput={onBuffer}
      onpointerdown={beginSliderEdit}
      onpointerup={endSliderEdit}
      onpointercancel={endSliderEdit}
      disabled={!editor.hasAudio}
    />
    <span class="value">{editor.settings.bufferMs} ms</span>
  </label>

  <button class="detect" onclick={() => editor.runSilenceDetection()} disabled={!editor.hasAudio || editor.isDetectingSilence}>
    {editor.isDetectingSilence ? `Detecting… ${Math.round(editor.detectionProgress * 100)}%` : "Detect Silence"}
  </button>

  <span class="count">{markerCount} region{markerCount === 1 ? "" : "s"}</span>

  <div class="control marker-nav" role="group" aria-label="Marker region navigation">
    <button
      type="button"
      class="nav-step"
      onclick={() => player.goToAdjacentMarkedRegion("prev")}
      disabled={markerCount === 0}
      title="Previous marked region (shortcut: [)"
      aria-label="Previous marked region"
    >
      ◀
    </button>
    <span class="nav-readout">{currentNumber ?? "–"} / {markerCount}</span>
    <button
      type="button"
      class="nav-step"
      onclick={() => player.goToAdjacentMarkedRegion("next")}
      disabled={markerCount === 0}
      title="Next marked region (shortcut: ])"
      aria-label="Next marked region"
    >
      ▶
    </button>
  </div>

  <div class="control view-filter">
    <span class="label">View</span>
    <div class="segmented" role="group" aria-label="Timeline view filter">
      {#each VIEW_FILTERS as { value, label } (value)}
        <button
          type="button"
          class="segment"
          class:active={editor.viewFilter === value}
          aria-pressed={editor.viewFilter === value}
          onclick={() => applyViewFilter(value)}
          disabled={!editor.hasAudio}
        >
          {label}
        </button>
      {/each}
    </div>
  </div>

  <button
    type="button"
    class="mute-toggle"
    class:active={editor.muteMarked}
    aria-pressed={editor.muteMarked}
    onclick={toggleMuteMarked}
    disabled={!editor.hasAudio}
    title="Preview the cut: duck marked audio with a 100ms fade"
  >
    {editor.muteMarked ? "Marked muted" : "Mute marked"}
  </button>

  {#if editor.detectionError}
    <span class="detect-error">{editor.detectionError}</span>
  {/if}

  {#if editor.hasSelection && editor.selectionStartSec !== null && editor.selectionEndSec !== null}
    <div class="selection-actions">
      <span class="selection-range">
        {formatTime(Math.min(editor.selectionStartSec, editor.selectionEndSec))}&ndash;{formatTime(
          Math.max(editor.selectionStartSec, editor.selectionEndSec),
        )}
      </span>
      {#if editor.selectionOverlap === "unmarked" || editor.selectionOverlap === "mixed"}
        <button class="mark" onclick={markSelection} title="Shortcut: m">Mark <kbd>m</kbd></button>
      {/if}
      {#if editor.selectionOverlap === "marked" || editor.selectionOverlap === "mixed"}
        <button class="unmark" onclick={unmarkSelection} title="Shortcut: m">Unmark <kbd>m</kbd></button>
      {/if}
      <button class="clear" onclick={() => editor.clearSelection()} aria-label="Clear selection" title="Shortcut: Esc">✕</button>
    </div>
  {/if}
</div>

<style>
  .silence-controls {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    flex-wrap: wrap;
  }

  .control {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .label {
    font-family: var(--font-label);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--cream-dim);
    white-space: nowrap;
  }

  input[type="range"] {
    width: 92px;
  }

  .value {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--amber);
    min-width: 4.5ch;
  }

  .detect {
    white-space: nowrap;
  }

  .count {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--cream-dim);
    white-space: nowrap;
  }

  .marker-nav {
    gap: 0.4rem;
  }

  .nav-step {
    font-size: 0.72rem;
    padding: 0.3rem 0.55rem;
    line-height: 1;
  }

  .nav-readout {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--amber);
    white-space: nowrap;
    min-width: 3.5ch;
    text-align: center;
  }

  .detect-error {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--in-color);
    white-space: nowrap;
  }

  .view-filter {
    gap: 0.6rem;
  }

  .segmented {
    display: flex;
    border: 1px solid var(--panel-line);
    border-radius: 5px;
    overflow: hidden;
  }

  .segment {
    font-size: 0.72rem;
    padding: 0.4rem 0.65rem;
    border: none;
    border-right: 1px solid var(--panel-line);
    border-radius: 0;
    white-space: nowrap;
  }

  .segment:last-child {
    border-right: none;
  }

  .segment.active {
    color: var(--chassis);
    background: var(--amber);
  }

  .segment.active:hover:not(:disabled) {
    background: var(--amber);
  }

  .mute-toggle {
    font-size: 0.75rem;
    white-space: nowrap;
  }

  .mute-toggle.active {
    color: var(--out-color);
    border-color: var(--out-color);
    background: rgba(63, 167, 154, 0.16);
  }

  .selection-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0.6rem;
    background: rgba(242, 230, 208, 0.08);
    border: 1px solid var(--panel-highlight);
    border-radius: 6px;
  }

  .selection-range {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--cream-dim);
    white-space: nowrap;
  }

  .selection-actions .mark,
  .selection-actions .unmark {
    font-size: 0.75rem;
    padding: 0.25rem 0.6rem;
    white-space: nowrap;
  }

  .selection-actions .mark {
    color: var(--out-color);
    border-color: var(--out-color);
  }

  .selection-actions .unmark {
    color: var(--in-color);
    border-color: var(--in-color);
  }

  .selection-actions .clear {
    font-size: 0.75rem;
    padding: 0.15rem 0.4rem;
    opacity: 0.7;
  }

  .selection-actions kbd {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    opacity: 0.7;
    margin-left: 0.1rem;
  }
</style>
