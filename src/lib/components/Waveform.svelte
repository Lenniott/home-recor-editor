<script lang="ts">
  import { editor, type TrackState } from "../editor.svelte";
  import { player } from "../player";
  import { computePeaksRange, type PeakColumns } from "../audio/peaks";
  import { laneLayout } from "../audio/laneLayout";
  import { keptToSource, type TimelineSpan } from "../audio/timelineMap";
  import { theme } from "../theme";

  /**
   * One lane, drawn for one track. Everything about *where* things sit on
   * screen (zoom window, cut map, playhead, selection) is shared
   * project state, so two lanes always line up; only the samples and the
   * silence marks are this track's own.
   */
  let { track, amplitudeZoomDb = 0 }: { track: TrackState; amplitudeZoomDb?: number } = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let width: number = $state(0);
  let height: number = $state(0);

  const HIT_RADIUS = 7;
  /** Pointer moves less than this many pixels while down still counts as a click (seek), not a drag-select. */
  const CLICK_THRESHOLD_PX = 4;
  const EPS = 1e-6;

  type DragTarget =
    | { type: "cut"; index: number; edge: "start" | "end" }
    | { type: "silence"; index: number; edge: "start" | "end" }
    | { type: "select"; anchorSec: number; startX: number; moved: boolean };

  let drag: DragTarget | null = null;

  const isActive = $derived(editor.activeTrack?.id === track.id);

  /** Shared pixel layout — see `laneLayout`. */
  const layout = $derived(laneLayout(editor.timelineSpans, editor.viewStartSec, editor.viewDurationSec, width));

  /** Source (file) seconds -> pixels, through the shared kept-time layout. */
  function sourceTimeToX(t: number, side: "start" | "end" = "start"): number {
    return layout.sourceToX(t, side);
  }

  function xToSourceTime(x: number): number {
    return keptToSource(editor.timelineSpans, layout.xToKept(x));
  }

  /** Clicking inside a gutter feels like clicking the audio right after it, not into the hidden stretch that's the whole point of hiding. */
  function resolveClickSourceSec(x: number): number {
    for (let i = 0; i < editor.timelineSpans.length; i++) {
      const span = editor.timelineSpans[i];
      if (span.kind !== "hidden") continue;
      const { startX, endX } = layout.gutterBounds(span);
      if (x >= startX && x <= endX) {
        const next = editor.timelineSpans[i + 1];
        return next ? next.sourceStart : span.sourceEnd;
      }
    }
    return xToSourceTime(x);
  }

  function findHiddenSpanForRegion(index: number): TimelineSpan | undefined {
    const displayed = track.markers[index]?.displayed;
    if (!displayed) return undefined;
    return editor.timelineSpans.find(
      (span) =>
        span.kind === "hidden" &&
        Math.abs(span.sourceStart - displayed.start) < EPS &&
        Math.abs(span.sourceEnd - displayed.end) < EPS,
    );
  }

  /**
   * Dragging a marked region's edge while it's collapsed into a gutter:
   * inside the gutter's own pixel slice, map linearly through the hidden
   * source interval so the edge can still be pulled in without switching
   * back to "view all". Once the pointer crosses into visible audio on
   * either side, fall through to the normal pixel mapping.
   */
  function resolveSilenceDragSourceSec(index: number, x: number): number {
    const hidden = findHiddenSpanForRegion(index);
    if (hidden) {
      const { startX, endX } = layout.gutterBounds(hidden);
      if (x >= startX && x <= endX) {
        const ratio = endX > startX ? (x - startX) / (endX - startX) : 0;
        return hidden.sourceStart + ratio * (hidden.sourceEnd - hidden.sourceStart);
      }
    }
    return xToSourceTime(x);
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  function hitTest(x: number): DragTarget | null {
    if (editor.preview === "original") for (let i = 0; i < editor.cuts.length; i++) {
      for (const edge of ["start", "end"] as const)
        if (Math.abs(x - sourceTimeToX(editor.cuts[i][edge], edge)) <= HIT_RADIUS) return {type:"cut",index:i,edge};
    }
    for (let i = 0; i < track.markers.length; i++) {
      const displayed = track.markers[i].displayed;
      if (!displayed) continue;
      if (Math.abs(x - sourceTimeToX(displayed.start, "start")) <= HIT_RADIUS) return { type: "silence", index: i, edge: "start" };
      if (Math.abs(x - sourceTimeToX(displayed.end, "end")) <= HIT_RADIUS) return { type: "silence", index: i, edge: "end" };
    }
    return null;
  }

  // Peaks only depend on the visible spans and column layout, not on
  // playhead/in/out/selection — cache them so a playhead tick during
  // playback doesn't re-scan the visible waveform every frame. Cleared
  // whenever the view window or the spans it's cut into change.
  let peaksCache = new Map<string, PeakColumns>();
  let peaksCacheSignature = "";

  function getPeaks(startSample: number, endSample: number, columns: number): PeakColumns {
    const key = `${startSample}:${endSample}:${columns}`;
    const cached = peaksCache.get(key);
    if (cached) return cached;
    const peaks = computePeaksRange(track.monoSamples, startSample, endSample, columns);
    peaksCache.set(key, peaks);
    return peaks;
  }

  function refreshPeaksCache(): void {
    let signature = `${editor.viewStartSec.toFixed(4)}:${editor.viewDurationSec.toFixed(4)}:${width}:${track.monoSamples.length}`;
    for (const span of editor.timelineSpans) {
      signature += `|${span.kind === "keep" ? "k" : "h"}${span.sourceStart.toFixed(4)}-${span.sourceEnd.toFixed(4)}`;
    }
    if (signature === peaksCacheSignature) return;
    peaksCacheSignature = signature;
    peaksCache.clear();
  }

  function drawGrid(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2 + 0.5);
    ctx.lineTo(width, height / 2 + 0.5);
    ctx.stroke();
  }

  function amplitudeToHeight(value: number, halfHeight: number): number {
    const gain = 10 ** (amplitudeZoomDb / 20);
    return clamp(Math.abs(value) * gain, 0, 1) * halfHeight;
  }

  function sampleToY(value: number, centerY: number, halfHeight: number): number {
    return centerY - Math.sign(value) * amplitudeToHeight(value, halfHeight);
  }

  /** Draws each visible `keep` span's peaks in its own pixel slice; `hidden` spans are left blank here for `drawGutters` to fill in. */
  function drawWaveform(ctx: CanvasRenderingContext2D): void {
    refreshPeaksCache();

    const centerY = height / 2;
    const halfHeight = height / 2 - 6;
    const viewStart = editor.viewStartSec;
    const viewEnd = editor.viewStartSec + editor.viewDurationSec;

    ctx.fillStyle = editor.tracks[0]?.id === track.id ? theme.amber : "#75cbbb";
    for (const span of editor.timelineSpans) {
      if (span.kind !== "keep") continue;
      const clippedKeptStart = Math.max(span.keptStart, viewStart);
      const clippedKeptEnd = Math.min(span.keptEnd, viewEnd);
      if (clippedKeptEnd <= clippedKeptStart) continue;

      const startX = Math.max(0, Math.round(layout.keptToX(clippedKeptStart)));
      const endX = Math.min(width, Math.round(layout.keptToX(clippedKeptEnd)));
      const columns = endX - startX;
      if (columns <= 0) continue;

      // A keep span maps kept time to source time 1:1 with a fixed offset.
      const offset = span.sourceStart - span.keptStart;
      const startSample = Math.max(0, Math.floor((clippedKeptStart + offset) * track.sampleRate));
      const endSample = Math.min(track.monoSamples.length, Math.ceil((clippedKeptEnd + offset) * track.sampleRate));
      const { min, max } = getPeaks(startSample, endSample, columns);

      for (let col = 0; col < columns; col++) {
        const yTop = sampleToY(max[col], centerY, halfHeight);
        const yBottom = sampleToY(min[col], centerY, halfHeight);
        ctx.fillRect(startX + col, Math.min(yTop, yBottom), 1, Math.max(1, Math.abs(yBottom - yTop)));
      }
    }
  }

  function drawQuietFloor(ctx: CanvasRenderingContext2D): void {
    const centerY = height / 2;
    const offset = amplitudeToHeight(10 ** (track.settings.quietThresholdDb / 20), height / 2 - 6);
    ctx.save();
    ctx.strokeStyle = theme.amber;
    ctx.globalAlpha = .6;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, centerY - offset + .5);
    ctx.lineTo(width, centerY - offset + .5);
    ctx.moveTo(0, centerY + offset + .5);
    ctx.lineTo(width, centerY + offset + .5);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * True when a hidden span overlaps one of the project's shared cuts —
   * not necessarily fully: `editor.hiddenIntervals` merges a cut with any
   * touching/overlapping view-filter-hidden region into one wider span, so
   * requiring full containment would miss a cut that's only part of a
   * merged gutter and paint it as ordinary filtered-out audio instead.
   */
  function isCutSpan(span: TimelineSpan): boolean {
    return editor.cuts.some((cut) => span.sourceStart < cut.end - EPS && span.sourceEnd > cut.start + EPS);
  }

  /** Collapsed spans render as a narrow band — red for a shared cut, teal for marked audio being hidden, neutral otherwise. */
  function drawGutters(ctx: CanvasRenderingContext2D): void {
    for (const span of editor.timelineSpans) {
      if (span.kind !== "hidden") continue;
      const { startX, endX } = layout.gutterBounds(span);
      const clampedStart = Math.max(0, startX);
      const clampedEnd = Math.min(width, endX);
      const gutterWidth = clampedEnd - clampedStart;
      if (gutterWidth <= 0) continue;

      const cut = isCutSpan(span);
      ctx.fillStyle = cut ? theme.cutFill : editor.viewFilter === "hideMarked" ? theme.markedFill : theme.gutterFill;
      ctx.fillRect(clampedStart, 0, gutterWidth, height);

      ctx.save();
      ctx.strokeStyle = cut ? theme.cutBorder : editor.viewFilter === "hideMarked" ? theme.markedBorder : theme.gutterBorder;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(clampedStart + 0.5, 0);
      ctx.lineTo(clampedStart + 0.5, height);
      ctx.moveTo(clampedEnd - 0.5, 0);
      ctx.lineTo(clampedEnd - 0.5, height);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Accepted cuts, while the original preview is showing them in place —
   * in the edited preview they're collapsed into gutters instead (see
   * `drawGutters`), which is the whole point of a cut.
   */
  function drawCuts(ctx: CanvasRenderingContext2D): void {
    if (editor.preview !== "original") return;
    for (const cut of editor.cuts) {
      const startX = sourceTimeToX(cut.start, "start");
      const endX = sourceTimeToX(cut.end, "end");
      if (endX <= startX) continue;
      ctx.fillStyle = theme.cutFill;
      ctx.fillRect(startX, 0, endX - startX, height);
      ctx.strokeStyle = theme.cutBorder;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(startX + 0.75, 0.75, Math.max(0, endX - startX - 1.5), height - 1.5);
      drawTick(ctx, startX);
      drawTick(ctx, endX);
    }
  }

  function drawTick(ctx: CanvasRenderingContext2D, x: number): void {
    ctx.strokeStyle = theme.cream;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    ctx.fillStyle = theme.cream;
    ctx.beginPath();
    ctx.moveTo(x - 5, 0);
    ctx.lineTo(x + 5, 0);
    ctx.lineTo(x, 8);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Marked (silence) bands get a teal fill + diagonal hatch + top/bottom
   * border, so they read as a distinct state rather than a dim version of
   * the waveform.
   *
   * The fill covers the buffer-adjusted `displayed` bounds, not the raw
   * VAD-detected bounds — the buffer's whole job is to hold back a margin
   * of silence next to speech so a cut doesn't land right on it, so the
   * highlight should show that smaller, conservative "safe to cut" zone.
   * A faint dashed line still marks the raw extent, so you can see how
   * much margin the buffer is giving up.
   *
   * When the view filter has collapsed a region into a gutter (drawn by
   * `drawGutters` instead), the band and raw-extent hint are skipped —
   * only the two edge ticks still draw, now spread across the gutter
   * instead of stacked on the same pixel.
   */
  function drawMarkers(ctx: CanvasRenderingContext2D): void {
    const collapsed = editor.viewFilter === "hideMarked" && editor.preview === "edited";

    for (const region of track.markers) {
      if (!region.displayed) continue;

      if (!collapsed) {
        const rawStartX = sourceTimeToX(region.raw.start, "start");
        const rawEndX = sourceTimeToX(region.raw.end, "end");
        if (rawEndX - rawStartX > 0) {
          ctx.save();
          ctx.strokeStyle = theme.markedRawExtent;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(rawStartX + 0.5, 0);
          ctx.lineTo(rawStartX + 0.5, height);
          ctx.moveTo(rawEndX - 0.5, 0);
          ctx.lineTo(rawEndX - 0.5, height);
          ctx.stroke();
          ctx.restore();
        }

        const safeStartX = sourceTimeToX(region.displayed.start, "start");
        const safeEndX = sourceTimeToX(region.displayed.end, "end");
        const bandWidth = safeEndX - safeStartX;
        if (bandWidth > 0) {
          ctx.fillStyle = theme.markedFill;
          ctx.fillRect(safeStartX, 0, bandWidth, height);

          ctx.save();
          ctx.beginPath();
          ctx.rect(safeStartX, 0, bandWidth, height);
          ctx.clip();
          ctx.strokeStyle = theme.markedHatch;
          ctx.lineWidth = 1;
          const step = 10;
          for (let x = safeStartX - height; x < safeEndX + height; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + height, height);
            ctx.stroke();
          }
          ctx.restore();

          ctx.strokeStyle = theme.markedBorder;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(safeStartX, 1);
          ctx.lineTo(safeEndX, 1);
          ctx.moveTo(safeStartX, height - 1);
          ctx.lineTo(safeEndX, height - 1);
          ctx.stroke();
        }
      }

      drawTick(ctx, sourceTimeToX(region.displayed.start, "start"));
      drawTick(ctx, sourceTimeToX(region.displayed.end, "end"));
    }
  }

  /** The pending drag-to-select range, before Mark/Unmark/Cut is chosen. */
  function drawPendingSelection(ctx: CanvasRenderingContext2D): void {
    const range = editor.cutScopePreview ? editor.selectionRange : editor.selectionFor(track);
    if (!range) return;
    const startX = sourceTimeToX(range.start, "start");
    const endX = sourceTimeToX(range.end, "end");
    if (endX <= startX) return;

    ctx.fillStyle = theme.selectionFill;
    ctx.fillRect(startX, 0, endX - startX, height);
    ctx.strokeStyle = theme.selectionBorder;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(startX + 0.75, 0.75, Math.max(0, endX - startX - 1.5), height - 1.5);
  }

  function drawPlayhead(ctx: CanvasRenderingContext2D): void {
    const x = sourceTimeToX(editor.playheadSec);
    ctx.save();
    ctx.strokeStyle = theme.cream;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = theme.cream;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.restore();
  }

  function draw(): void {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = theme.panel;
    ctx.fillRect(0, 0, width, height);

    if (!track.hasAudio || width <= 0 || height <= 0) return;

    drawGrid(ctx);
    drawWaveform(ctx);
    drawQuietFloor(ctx);
    drawGutters(ctx);
    drawCuts(ctx);
    drawMarkers(ctx);
    drawPendingSelection(ctx);
    drawPlayhead(ctx);
  }

  // Resize the canvas bitmap only when the element's pixel size actually
  // changes. Reallocating canvas.width/height (even to the same value)
  // forces the browser to throw away the backing bitmap, which was
  // happening on every zoom/pan/playhead tick before this was split out.
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
    // Reads below make this effect re-run whenever any of them change,
    // without touching the canvas bitmap itself.
    track.monoSamples;
    track.markers;
    track.settings.quietThresholdDb;
    amplitudeZoomDb;
    editor.viewStartSec;
    editor.viewDurationSec;
    editor.viewFilter;
    editor.preview;
    editor.timelineSpans;
    editor.cuts;
    editor.playheadSec;
    editor.cuts;
    editor.selectionRanges;
    editor.cutScopePreview;
    editor.selectionTrackIds;
    editor.selectionStartSec;
    editor.selectionEndSec;

    draw();
  });

  function onPointerDown(e: PointerEvent): void {
    if (!track.hasAudio) return;
    // Opens the undo transaction for this whole gesture — matched by
    // `editor.endEdit()` in `onPointerUp`, which fires whether it turns
    // into a marker/IN/OUT drag, a drag-select, or just a click-seek.
    editor.beginEdit();
    // Touching a lane is what makes it the one the mark/detect controls apply to.
    editor.setActiveTrack(track.id);
    drag = hitTest(e.offsetX) ?? { type: "select", anchorSec: resolveClickSourceSec(e.offsetX), startX: e.offsetX, moved: false };
    canvas?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!drag || !track.hasAudio) return;
    if (drag.type === "cut") {
      editor.moveCut(drag.index, drag.edge, xToSourceTime(e.offsetX));
    }
    else if (drag.type === "silence") {
      editor.moveMarker(track, drag.index, drag.edge, resolveSilenceDragSourceSec(drag.index, e.offsetX));
    } else {
      const t = xToSourceTime(e.offsetX);
      if (!drag.moved && Math.abs(e.offsetX - drag.startX) > CLICK_THRESHOLD_PX) drag.moved = true;
      if (drag.moved) {
        const lanes = Array.from(document.querySelectorAll<HTMLElement>("[data-track-lane]"));
        const origin = lanes.findIndex(lane => lane.dataset.trackLane === track.id);
        const target = lanes.findIndex(lane => { const box = lane.getBoundingClientRect(); return e.clientY >= box.top && e.clientY <= box.bottom; });
        const ids = target < 0 ? [track.id] : lanes.slice(Math.min(origin, target), Math.max(origin, target) + 1).map(lane => lane.dataset.trackLane!);
        editor.setSelection(drag.anchorSec, t, ids);
      }
    }
  }

  function onPointerUp(): void {
    if (!drag) return;
    if (drag.type === "select") {
      if (!drag.moved) {
        // Never moved past the click threshold: it's just a click. Seek
        // there and drop any previously pending selection instead of
        // leaving a zero-width one behind.
        player.seek(drag.anchorSec);
        const at = drag.anchorSec;
        const cut = editor.cuts.find(r => r.start <= at && r.end > at);
        const silence = track.rawMarkers.find(r => r.start <= at && r.end > at);
        if (cut) {
          editor.markerAction = "cut";
          editor.setSelection(cut.start,cut.end,editor.tracks.map(t => t.id));
        } else if (silence) {
          editor.markerAction = "silence";
          editor.setSelection(silence.start,silence.end,[track.id]);
        } else editor.clearSelection();
      } else {
        // A real drag: auto-merge into an existing marked region if the
        // overlap is substantial, otherwise leave it pending for Mark/Unmark/Cut.
        editor.finishSelectionDrag(track);
        player.refreshIfPlaying();
      }
    } else if (drag.type === "cut") {
      editor.finishCutDrag();
      player.refreshIfPlaying();
    } else if (drag.type === "silence") {
      // Merge check happens only here, once, rather than on every
      // pointermove — see finishMarkerDrag for why.
      editor.finishMarkerDrag(track, drag.index);
      player.refreshIfPlaying();
    }
    drag = null;
    // Closes the transaction opened in `onPointerDown`. A handle tapped
    // but never dragged (or a click-seek that lands back on the same
    // playhead position) is dropped as a no-op inside `endEdit`.
    editor.endEdit();
  }
</script>

<div class="waveform" class:active={isActive} bind:clientWidth={width} bind:clientHeight={height}>
  {#if track.hasAudio}
    <canvas
      bind:this={canvas}
      style="width:{width}px;height:{height}px"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
    ></canvas>
  {:else}
    <div class="empty">
      <p>No recording loaded</p>
      <p class="hint">Open a recording to see its waveform.</p>
    </div>
  {/if}
</div>

<style>
  .waveform {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    background: var(--panel);
    border: 1px solid var(--panel-line);
    border-radius: 6px;
    overflow: hidden;
  }

  .waveform.active {
    border-color: var(--amber);
  }

  canvas {
    display: block;
    cursor: crosshair;
    touch-action: none;
  }

  .empty {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    color: var(--cream-dim);
  }

  .empty p {
    margin: 0;
    font-family: var(--font-label);
    letter-spacing: 0.04em;
  }

  .empty .hint {
    font-size: 0.8rem;
    opacity: 0.6;
  }
</style>
