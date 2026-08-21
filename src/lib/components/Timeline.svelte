<script lang="ts">
  import { theme } from "../theme";

  /**
   * Plain time ruler shared by every track row (the standard DAW pattern:
   * one ruler, one scroll/zoom position, tracks stacked underneath — see
   * `SessionState.viewStartSec`/`viewDurationSec` and `Waveform.svelte`'s
   * `view` prop). Read-only: zooming/panning happens on the waveforms
   * themselves and this just mirrors whatever window they land on.
   */
  let { view }: { view: { startSec: number; durationSec: number } } = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let width: number = $state(0);
  let height: number = $state(0);

  /** Roughly how many pixels a tick label needs so ticks never overlap — the actual step is snapped to a "nice" 1/2/5-multiple of a power of ten. */
  const MIN_LABEL_PX = 70;

  const NICE_STEPS = [1, 2, 5];

  /** Smallest 1/2/5 × 10^n step whose pixel width is at least `minPx`, given `pxPerSec`. */
  function niceStepSec(pxPerSec: number, minPx: number): number {
    if (pxPerSec <= 0) return 1;
    const minStepSec = minPx / pxPerSec;
    const magnitude = 10 ** Math.floor(Math.log10(minStepSec));
    for (const n of NICE_STEPS) {
      if (n * magnitude >= minStepSec) return n * magnitude;
    }
    return 10 * magnitude;
  }

  function formatTime(totalSeconds: number): string {
    const s = Math.max(0, Math.round(totalSeconds));
    const minutes = Math.floor(s / 60);
    const seconds = s % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  function draw(): void {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx || width <= 0 || height <= 0) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = theme.panel;
    ctx.fillRect(0, 0, width, height);

    if (view.durationSec <= 0) return;
    const pxPerSec = width / view.durationSec;
    const step = niceStepSec(pxPerSec, MIN_LABEL_PX);

    ctx.strokeStyle = theme.grid;
    ctx.fillStyle = theme.cream;
    ctx.font = "11px var(--font-mono, monospace)";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;

    const firstTick = Math.ceil(view.startSec / step) * step;
    for (let t = firstTick; t <= view.startSec + view.durationSec + 1e-6; t += step) {
      const x = Math.round((t - view.startSec) * pxPerSec) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, height * 0.4);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillText(formatTime(t), x + 4, height * 0.4);
    }
  }

  $effect(() => {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext("2d");
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  });

  $effect(() => {
    view.startSec;
    view.durationSec;
    draw();
  });
</script>

<div class="timeline" bind:clientWidth={width} bind:clientHeight={height}>
  <canvas bind:this={canvas} style="width:{width}px;height:{height}px"></canvas>
</div>

<style>
  .timeline {
    width: 100%;
    height: 28px;
    background: var(--panel);
    border: 1px solid var(--panel-line);
    border-radius: 6px 6px 0 0;
    border-bottom: none;
  }

  canvas {
    display: block;
  }
</style>
