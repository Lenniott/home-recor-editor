<script lang="ts">
  import { editor, type TrackState } from "../editor.svelte";
  import { player } from "../player";
  import IconRadio from "./icons/IconRadio.svelte";
  import Waveform from "./Waveform.svelte";

  /**
   * One waveform lane: its speaker name, which recording it came from,
   * and whether it's the lane the mark/detect controls are pointed at.
   * The waveform itself shares the project's timeline — see `Waveform.svelte`.
   */
  let { track, compact = false }: { track: TrackState; compact?: boolean } =
    $props();

  let laneHeight = $state(0);
  let waveformZoomDb = $state(0);
  const isActive = $derived(editor.activeTrack?.id === track.id);
  const markedCount = $derived(track.markedIntervals.length);

  function dbY(offsetDb: number, upper: boolean): number {
    const half = laneHeight / 2;
    const offset = 10 ** (-offsetDb / 20) * Math.max(0, half - 6);
    return half + (upper ? -offset : offset);
  }

  function zoomWaveform(event: WheelEvent): void {
    event.preventDefault();
    event.stopPropagation();
    waveformZoomDb = Math.max(0, Math.min(48, waveformZoomDb + (event.deltaY < 0 ? 6 : -6)));
  }

  function zoomWaveformKey(event: KeyboardEvent): void {
    if (["ArrowUp", "ArrowRight"].includes(event.key)) waveformZoomDb = Math.min(48, waveformZoomDb + 6);
    else if (["ArrowDown", "ArrowLeft"].includes(event.key)) waveformZoomDb = Math.max(0, waveformZoomDb - 6);
    else if (event.key === "Home") waveformZoomDb = 0;
    else if (event.key === "End") waveformZoomDb = 48;
    else return;
    event.preventDefault();
  }

  function dbLabel(offsetDb: number): string {
    const value = waveformZoomDb + offsetDb;
    return value === 0 ? "0" : `−${value}`;
  }

  function remove(): void {
    if (!confirm(`Remove ${track.speaker} from this project? Its silence marks go with it; shared cuts stay.`)) return;
    player.pause();
    editor.removeTrack(track.id);
  }
</script>

<div class="lane" class:compact data-track-lane={track.id} class:active={isActive}>
  <div class="lane-label">
    {#if compact}
      <span class="speaker-name">{track.speaker}</span>
    {:else}
      <button
        type="button"
        class="activate"
        class:active={isActive}
        aria-pressed={isActive}
        onclick={() => editor.setActiveTrack(track.id)}
        title="Point the silence controls at this track"
      >
        <IconRadio on={isActive} size={12} />
        {isActive ? "Editing" : "Edit"}
      </button>
      <input
        class="speaker"
        value={track.speaker}
        onchange={(e) => editor.setSpeaker(track, (e.currentTarget as HTMLInputElement).value.trim() || track.speaker)}
        aria-label="Speaker name"
      />
      <span class="file" title={track.fileName ?? ""}>{track.fileName ?? "No recording"}</span>
      <span class="meta">{markedCount} silence{markedCount === 1 ? "" : "s"}</span>
      {#if editor.tracks.length > 1}
        <button type="button" class="remove" onclick={remove} title="Remove this track">Remove</button>
      {/if}
    {/if}
  </div>

  <div class="lane-body" bind:clientHeight={laneHeight}>
    {#if !compact}
      <div
        class="db-scale"
        role="slider"
        tabindex="0"
        aria-label="Waveform vertical zoom"
        aria-valuemin="0"
        aria-valuemax="48"
        aria-valuenow={waveformZoomDb}
        title="Scroll to zoom quiet waveform detail · double-click to reset"
        onwheel={zoomWaveform}
        onkeydown={zoomWaveformKey}
        ondblclick={() => waveformZoomDb = 0}
      >
        {#each [0, 6, 12] as offsetDb}
          <span style:top="{dbY(offsetDb, true)}px">{dbLabel(offsetDb)}</span>
          <span style:top="{dbY(offsetDb, false)}px">{dbLabel(offsetDb)}</span>
        {/each}
        <span class="zoom-readout">{waveformZoomDb ? `+${waveformZoomDb}` : "dB"}</span>
      </div>
    {/if}
    <Waveform {track} amplitudeZoomDb={waveformZoomDb} tweak={compact} />
  </div>
</div>

<style>
  .lane-body { position: relative; }
  .db-scale { position: absolute; right: calc(100% + 3px); width: 30px; height: 100%; z-index: 2; cursor: ns-resize; font: 9px var(--font-mono); color: var(--cream-dim); text-align: right; outline: none; }
  .db-scale span { position: absolute; right: 0; transform: translateY(-50%); }
  .db-scale .zoom-readout { left: 0; right: auto; top: 50%; padding: 2px; color: var(--amber); background: var(--panel); }
  .db-scale:focus-visible { color: var(--cream); }
  .lane {
    display: grid;
    grid-template-columns: var(--lane-label-width) 1fr;
    grid-template-rows: minmax(0, 1fr);
    gap: 0.75rem;
    flex: 1;
    min-height: 0;
  }

  .lane-label {
    overflow: hidden;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
    padding: 0.5rem 30px 0.5rem 0;
  }

  .activate {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.7rem;
    padding: 0.2rem 0.4rem;
    white-space: nowrap;
  }

  .activate.active {
    color: var(--chassis);
    background: var(--amber);
    border-color: var(--amber);
  }

  .speaker {
    width: 100%;
    font-size: 0.8rem;
    padding: 0.2rem 0.35rem;
    background: var(--panel);
    color: var(--cream);
    border: 1px solid var(--panel-line);
    border-radius: 4px;
  }

  .file,
  .meta {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    color: var(--cream-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .remove {
    font-size: 0.68rem;
    padding: 0.15rem 0.4rem;
    color: var(--in-color);
    border-color: var(--in-color);
    align-self: flex-start;
  }

  .lane-body {
    min-height: 0;
  }

  .compact {
    flex: 0 0 36px;
    min-height: 36px;
    gap: 0.4rem;
    grid-template-columns: 4.5rem 1fr;
  }

  .compact .lane-label {
    padding: 0;
    justify-content: center;
  }

  .speaker-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.7rem;
    color: var(--cream-dim);
  }

  @media(max-height: 650px) { .file, .meta, .remove { display: none; } }
</style>
