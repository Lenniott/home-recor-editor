<script lang="ts">
  import { editor } from "../editor.svelte";

  const markerCount = $derived(editor.silenceRegions.filter((r) => r.displayed).length);

  function onThreshold(e: Event): void {
    editor.setPositiveSpeechThreshold(Number((e.currentTarget as HTMLInputElement).value));
  }

  function onMinSilence(e: Event): void {
    editor.setMinSilenceMs(Number((e.currentTarget as HTMLInputElement).value));
  }

  function onBuffer(e: Event): void {
    editor.setBufferMs(Number((e.currentTarget as HTMLInputElement).value));
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
      disabled={!editor.hasAudio}
    />
    <span class="value">{editor.settings.bufferMs} ms</span>
  </label>

  <button class="detect" onclick={() => editor.runSilenceDetection()} disabled={!editor.hasAudio || editor.isDetectingSilence}>
    {editor.isDetectingSilence ? `Detecting… ${Math.round(editor.detectionProgress * 100)}%` : "Detect Silence"}
  </button>

  <span class="count">{markerCount} region{markerCount === 1 ? "" : "s"}</span>

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
        <button class="mark" onclick={() => editor.markSelection()} title="Shortcut: m">Mark <kbd>m</kbd></button>
      {/if}
      {#if editor.selectionOverlap === "marked" || editor.selectionOverlap === "mixed"}
        <button class="unmark" onclick={() => editor.unmarkSelection()} title="Shortcut: m">Unmark <kbd>m</kbd></button>
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

  .detect-error {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--in-color);
    white-space: nowrap;
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
