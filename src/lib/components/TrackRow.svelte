<script lang="ts">
  import { session, type Track } from "../session.svelte";
  import TrackControls from "./TrackControls.svelte";
  import Waveform from "./Waveform.svelte";

  interface Props {
    track: Track;
    view: { startSec: number; durationSec: number };
    onViewChange: (startSec: number, durationSec: number) => void;
    onRemove: () => void;
    onSave: () => void;
    onExport: () => void;
  }

  let { track, view, onViewChange, onRemove, onSave, onExport }: Props = $props();

  /** Compact (default) is the working state: 240px chrome + waveform. Full unmounts the waveform and stretches the settings board. */
  let expanded = $state(false);
  const focused = $derived(session.focusedTrack === track);

  function onPointerDown(): void {
    session.focus(track);
  }
</script>

<div class="control-row" class:full={expanded} role="group" onpointerdown={onPointerDown}>
  <TrackControls
    {track}
    {focused}
    {expanded}
    onToggleExpanded={() => (expanded = !expanded)}
    {onRemove}
    {onSave}
    {onExport}
  />
  {#if !expanded}
    <div class="lane">
      <Waveform
        editor={track.editor}
        player={track.player}
        {view}
        {onViewChange}
      />
    </div>
  {/if}
</div>

<style>
  .control-row {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    gap: var(--track-gap);
    height: 160px;
    min-width: 0;
  }

  .control-row.full {
    height: 240px;
  }

  /* flex: 1 + min-width: 0 is what gives the canvas a real size — without it the lane shrinks to the canvas, the canvas to the lane, and both stay 0px. */
  .lane {
    flex: 1;
    min-width: 0;
    height: 100%;
    border-bottom: 1px solid var(--panel-line);
  }

  .control-row:last-child .lane {
    border-bottom: none;
  }

  /* Strip the standalone Waveform's own border/background — inside a lane it's one row of the shared timeline-area border, not its own box. */
  .lane :global(.waveform) {
    border: none;
    border-radius: 0;
    background: transparent;
  }
</style>
