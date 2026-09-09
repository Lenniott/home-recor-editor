<script lang="ts">
  import { on } from "svelte/events";
  import { editor } from "../editor.svelte";
  import { laneLayout } from "../audio/laneLayout";
  import CutLane from "./CutLane.svelte";
  import TimelineRuler from "./TimelineRuler.svelte";
  import TrackLane from "./TrackLane.svelte";

  /**
   * The arrange area: ruler, shared cuts, and every track lane. Wheel
   * pan/zoom is owned here so it works over the ruler, cut strip, lane
   * gaps, and labels — not only the waveform canvas.
   */
  const ZOOM_SENSITIVITY = 0.008;
  const WHEEL_IDLE_MS = 300;

  let rafId: number | null = null;
  let wheelIsZoom = false;
  let wheelZoomFactor = 1;
  let wheelAnchorX = 0;
  let wheelPanDeltaSec = 0;
  let wheelIdleTimeout: ReturnType<typeof setTimeout> | null = null;
  let laneWidth = 1;

  function attachWheel(node: HTMLElement) {
    const stop = on(node, "wheel", onWheel, { passive: false });
    return () => {
      stop();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (wheelIdleTimeout !== null) {
        clearTimeout(wheelIdleTimeout);
        wheelIdleTimeout = null;
        editor.endEdit();
      }
    };
  }

  function flushWheel(): void {
    if (wheelIsZoom) {
      const layout = laneLayout(editor.timelineSpans, editor.viewStartSec, editor.viewDurationSec, laneWidth);
      const ratio = laneWidth > 0 ? wheelAnchorX / laneWidth : 0.5;
      editor.zoomView(wheelZoomFactor, layout.xToKept(wheelAnchorX), ratio);
      wheelZoomFactor = 1;
    } else {
      editor.setView(editor.viewStartSec + wheelPanDeltaSec, editor.viewDurationSec);
      wheelPanDeltaSec = 0;
    }
  }

  function scheduleWheelFlush(): void {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      flushWheel();
    });
  }

  function onWheel(event: WheelEvent): void {
    if (!editor.hasAudio) return;
    const lane = (event.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-timeline-lane]");
    if (!lane) return;
    event.preventDefault();

    const width = Math.max(1, lane.clientWidth);
    const x = event.clientX - lane.getBoundingClientRect().left;
    laneWidth = width;

    if (wheelIdleTimeout === null) editor.beginEdit();
    else clearTimeout(wheelIdleTimeout);
    wheelIdleTimeout = setTimeout(() => {
      wheelIdleTimeout = null;
      editor.endEdit();
    }, WHEEL_IDLE_MS);

    const isZoom = event.ctrlKey || event.metaKey;
    if (isZoom !== wheelIsZoom && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
      flushWheel();
    }
    wheelIsZoom = isZoom;

    if (isZoom) {
      wheelAnchorX = x;
      wheelZoomFactor *= Math.exp(event.deltaY * ZOOM_SENSITIVITY);
    } else {
      wheelPanDeltaSec += (event.deltaX || event.deltaY) * (editor.viewDurationSec / width);
    }
    scheduleWheelFlush();
  }
</script>

<section class="stage" {@attach attachWheel}>
  <TimelineRuler />
  {#if editor.tracks.length === 0}
    <div class="empty">
      <p>Start with your speaker recordings</p>
      <p class="hint">Import one or two synced audio files to begin cleanup.</p>
    </div>
  {:else}
    <CutLane stripOnly />
    {#each editor.tracks as track (track.id)}<TrackLane {track} />{/each}
  {/if}
</section>

<style>
  .stage {
    flex: 1;
    padding: 1rem 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    color: var(--cream-dim);
    background: var(--panel);
    border: 1px solid var(--panel-line);
    border-radius: 6px;
  }

  .empty p {
    margin: 0;
    letter-spacing: 0.04em;
  }

  .empty .hint {
    font-size: 0.8rem;
    opacity: 0.6;
  }
</style>
