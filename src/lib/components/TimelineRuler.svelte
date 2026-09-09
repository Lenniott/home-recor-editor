<script lang="ts">
  import { editor } from "../editor.svelte";
  import { player } from "../player";
  import { laneLayout } from "../audio/laneLayout";
  import { keptToSource } from "../audio/timelineMap";
  let width = $state(0);
  const layout = $derived(
    laneLayout(
      editor.timelineSpans,
      editor.viewStartSec,
      editor.viewDurationSec,
      width,
    ),
  );
  const ticks = $derived.by(() => {
    if (!width || !editor.viewDurationSec) return [];
    const raw = editor.viewDurationSec / Math.max(1, width / 90);
    const power = 10 ** Math.floor(Math.log10(raw));
    const step =
      [1, 2, 5, 10].map((n) => n * power).find((n) => n >= raw) ?? raw;
    const result = [];
    for (
      let t = Math.ceil(editor.viewStartSec / step) * step;
      t <= editor.viewStartSec + editor.viewDurationSec;
      t += step
    )
      result.push({
        x: layout.keptToX(t),
        label:
          Math.floor(t / 60) +
          ":" +
          (t % 60).toFixed(step < 1 ? 1 : 0).padStart(step < 1 ? 4 : 2, "0"),
      });
    return result;
  });
</script>

<div class="ruler-row">
  <span class="mode"
    >{editor.preview === "edited" ? "EDITED TIME" : "SOURCE TIME"}</span
  >
  <button
    class="ruler"
    data-timeline-lane
    bind:clientWidth={width}
    aria-label="Seek on time ruler"
    onclick={(event) =>
      player.seek(
        keptToSource(editor.timelineSpans, layout.xToKept(event.offsetX)),
      )}
  >
    {#each ticks as tick}<span style:left="{tick.x}px">{tick.label}</span
      >{/each}
  </button>
</div>

<style>
  .ruler-row {
    display: grid;
    grid-template-columns: var(--lane-label-width) 1fr;
    gap: 0.75rem;
    flex: 0 0 32px;
  }
  .mode {
    font: 0.65rem var(--font-mono);
    color: var(--cream-dim);
    align-self: center;
  }
  .ruler {
    position: relative;
    overflow: hidden;
    padding: 0;
    border: 0;
    border-bottom: 1px solid var(--panel-line);
    border-radius: 0;
    background: transparent;
    height: 1.25rem;
  }
  .ruler span {
    position: absolute;
    top: 0;
    bottom: 0;
    border-left: 1px solid var(--panel-line);
    padding: 3px 4px;
    font: 0.65rem var(--font-mono);
    color: var(--cream-dim);
    pointer-events: none;
  }
</style>
