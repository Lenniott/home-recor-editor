<script lang="ts">
  import { currentRegionNumber } from "../audio/markerNav";
  import { editor } from "../editor.svelte";
  import { player } from "../player";
  import Button from "./baseline/Button.svelte";
  import IconCaret from "./icons/IconCaret.svelte";

  /**
   * Per-speaker settings for the combined, all-track non-speaking pass.
   */
  const track = $derived(editor.activeTrack);
  const markerCount = $derived(editor.actionIntervals.length);
  const currentNumber = $derived(currentRegionNumber(editor.actionIntervals, editor.playheadSec));
  const markerKind = $derived(
    editor.markerAction === "cut" ? "cut" : editor.markerAction === "clip" ? "clip" : "marked",
  );
  const detectingTrack = $derived(editor.tracks.find(t => t.isDetectingSilence));
  let useVad = $state(true);

  function onThreshold(e: Event): void {
    editor.setPositiveSpeechThreshold(Number((e.currentTarget as HTMLInputElement).value));
  }

  function onMinSilence(e: Event): void {
    editor.setMinSilenceMs(Number((e.currentTarget as HTMLInputElement).value));
  }

  function onBuffer(e: Event): void {
    editor.setBufferMs(Number((e.currentTarget as HTMLInputElement).value));
  }

  function onQuietThreshold(e: Event): void {
    editor.setQuietThresholdDb(Number((e.currentTarget as HTMLInputElement).value));
  }

  // The settings sliders fire `oninput` on every drag tick, but a
  // drag should still cost one undo step, not one per tick — same
  // transaction-around-the-gesture pattern as Waveform's pointer drags.
  function beginSliderEdit(): void {
    editor.beginEdit();
  }

  function endSliderEdit(): void {
    editor.endEdit();
  }

  function runCleanup(): void {
    if (useVad) void editor.detectAllTracks();
    else editor.detectQuietAllTracks();
  }

</script>

<div class="silence-controls">
  <span class="scope" title="These settings belong to the selected speaker; detection runs every track">
    Settings for <strong>{track?.speaker ?? "—"}</strong>
  </span>

  <label class="vad-option">
    <input type="checkbox" bind:checked={useVad} disabled={!editor.hasAudio || editor.detectingAny} />
    <span><strong>Use speech detection (VAD)</strong><small>Protect speech as well as checking the dB floor.</small></span>
  </label>

  {#if useVad}<label class="control">
    <span class="label">Speech sensitivity</span>
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
  </label>{/if}

  <label class="control">
    <span class="label">Silence gap</span>
    <input
      type="range"
      min="100"
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
    <span class="label">Speech protection</span>
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

  <Button
    class="detect"
    variant="primary"
    onclick={runCleanup}
    disabled={!editor.hasAudio || editor.detectingAny}
  >
    {editor.detectingAny ? `Analyzing ${detectingTrack?.speaker} · ${Math.round((detectingTrack?.detectionProgress ?? 0) * 100)}%` : useVad ? "Run VAD + silence floor · all tracks" : "Run silence floor only · all tracks"}
  </Button>

  <label class="control" title="Audio below this level is also marked, including very quiet speech. The combined pass uses speech detection and this quiet floor.">
    <span class="label">Quiet floor</span>
    <input
      type="range"
      min="-60"
      max="-6"
      step="1"
      value={editor.settings.quietThresholdDb}
      oninput={onQuietThreshold}
      onpointerdown={beginSliderEdit}
      onpointerup={endSliderEdit}
      onpointercancel={endSliderEdit}
      disabled={!editor.hasAudio}
    />
    <span class="value">{editor.settings.quietThresholdDb} dB</span>
  </label>

  <span class="count">{markerCount} {markerKind} region{markerCount === 1 ? "" : "s"}</span>

  <div class="control marker-nav" role="group" aria-label="{markerKind} region navigation">
    <Button
      size="tool"
      variant="secondary"
      icon="left"
      label={false}
      tooltip
      title="Previous {markerKind} region (shortcut: [)"
      aria-label="Previous {markerKind} region"
      onclick={() => player.goToAdjacentMarkedRegion("prev")}
      disabled={markerCount === 0}
    >
      {#snippet glyph()}<IconCaret dir="left" />{/snippet}
    </Button>
    <span class="nav-readout">{currentNumber ?? "–"} / {markerCount}</span>
    <Button
      size="tool"
      variant="secondary"
      icon="left"
      label={false}
      tooltip
      title="Next {markerKind} region (shortcut: ])"
      aria-label="Next {markerKind} region"
      onclick={() => player.goToAdjacentMarkedRegion("next")}
      disabled={markerCount === 0}
    >
      {#snippet glyph()}<IconCaret dir="right" />{/snippet}
    </Button>
  </div>

  {#each editor.tracks as lane (lane.id)}
    {#if lane.detectionError}<p class="detect-error">{lane.speaker}: {lane.detectionError}</p>{/if}
  {/each}

</div>

<style>
  .silence-controls { display: flex; flex-direction: column; align-items: stretch; gap: 1.1rem; }
  .scope { font-size: .75rem; color: var(--cream-dim); }
  .scope strong { color: var(--amber); }
  .control { display: flex; align-items: center; flex-wrap: wrap; gap: .5rem; }
  .label { flex: 1 0 100%; font-size: .75rem; color: var(--cream-dim); }
  input[type="range"] { flex: 1; min-width: 80px; width: 60%; }
  .value, .count { font: .7rem var(--font-mono); color: var(--cream-dim); }
  .silence-controls :global(.detect) { width: 100%; }
  .vad-option { display: flex; align-items: flex-start; gap: .65rem; padding: .7rem; border: 1px solid var(--panel-line); border-radius: 5px; }
  .vad-option span { display: grid; gap: .2rem; font-size: .75rem; }
  .vad-option small { color: var(--cream-dim); line-height: 1.35; }
  .marker-nav { justify-content: center; }
  .detect-error { color: var(--in-color); font-size: .75rem; }
</style>
