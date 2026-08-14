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
</style>
