<script lang="ts">
  import { editor, type TrackState } from "../editor.svelte";
  import { player } from "../player";
  import Waveform from "./Waveform.svelte";

  /**
   * One waveform lane: its speaker name, which recording it came from,
   * and whether it's the lane the mark/detect controls are pointed at.
   * The waveform itself shares the project's timeline — see `Waveform.svelte`.
   */
  let { track }: { track: TrackState } = $props();

  const isActive = $derived(editor.activeTrack?.id === track.id);
  const markedCount = $derived(track.markedIntervals.length);

  function remove(): void {
    if (!confirm(`Remove ${track.speaker} from this project? Its silence marks go with it; shared cuts stay.`)) return;
    player.pause();
    editor.removeTrack(track.id);
  }
</script>

<div class="lane" class:active={isActive}>
  <div class="lane-label">
    <button
      type="button"
      class="activate"
      class:active={isActive}
      aria-pressed={isActive}
      onclick={() => editor.setActiveTrack(track.id)}
      title="Point the silence controls at this track"
    >
      {isActive ? "● Editing" : "○ Edit"}
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
  </div>

  <div class="lane-body">
    <Waveform {track} />
  </div>
</div>

<style>
  .lane {
    display: grid;
    grid-template-columns: var(--lane-label-width) 1fr;
    gap: 0.75rem;
    flex: 1;
    min-height: 0;
  }

  .lane-label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
    padding: 0.25rem 0;
  }

  .activate {
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
</style>
