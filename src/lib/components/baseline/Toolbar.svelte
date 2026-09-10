<script lang="ts">
  import Button from "./Button.svelte";
  import IconChevron from "../icons/IconChevron.svelte";
  import IconClose from "../icons/IconClose.svelte";
  import IconEye from "../icons/IconEye.svelte";
  import IconLayout from "../icons/IconLayout.svelte";
  import IconMarker from "../icons/IconMarker.svelte";
  import IconMenu from "../icons/IconMenu.svelte";
  import IconPause from "../icons/IconPause.svelte";
  import IconPlay from "../icons/IconPlay.svelte";
  import IconRedo from "../icons/IconRedo.svelte";
  import IconScissors from "../icons/IconScissors.svelte";
  import IconSilence from "../icons/IconSilence.svelte";
  import IconUndo from "../icons/IconUndo.svelte";
  import IconZoom from "../icons/IconZoom.svelte";
  import IconSettings from "../icons/IconSettings.svelte";

  export type MarkerType = "silence" | "cut";
  export type ViewMode = "both" | "transcript" | "audio";

  let {
    canUndo = true,
    canRedo = true,
    canMark = true,
    canUnmark = true,
    canPlay = true,
    canZoomIn = true,
    canZoomOut = true,
    canFit = true,
    hasSelection = false,
    playing = $bindable(false),
    menuOpen = $bindable(false),
    currentSec = 0,
    durationSec = 0,
    markerType = $bindable<MarkerType>("silence"),
    view = $bindable<ViewMode>("both"),
    preview = $bindable(false),
    asideOpen = $bindable(true),
    onmark,
    onunmark,
    onundo,
    onredo,
    onplay,
    onpreview,
    onmenu,
    onclear,
    onzoomin,
    onzoomout,
    onfit,
  }: {
    canUndo?: boolean;
    canRedo?: boolean;
    canMark?: boolean;
    canUnmark?: boolean;
    canPlay?: boolean;
    canZoomIn?: boolean;
    canZoomOut?: boolean;
    canFit?: boolean;
    hasSelection?: boolean;
    playing?: boolean;
    menuOpen?: boolean;
    currentSec?: number;
    durationSec?: number;
    markerType?: MarkerType;
    view?: ViewMode;
    preview?: boolean;
    asideOpen?: boolean;
    onmark?: () => void;
    onunmark?: () => void;
    onundo?: () => void;
    onredo?: () => void;
    onplay?: () => void;
    onpreview?: () => void;
    onmenu?: () => void;
    onclear?: () => void;
    onzoomin?: () => void;
    onzoomout?: () => void;
    onfit?: () => void;
  } = $props();

  function togglePlay(): void {
    if (onplay) onplay();
    else playing = !playing;
  }

  function togglePreview(): void {
    if (onpreview) onpreview();
    else preview = !preview;
  }

  function formatTime(totalSeconds: number): string {
    const s = Math.max(0, totalSeconds);
    const minutes = Math.floor(s / 60);
    const seconds = s - minutes * 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
  }
</script>

<div class="toolbar" role="toolbar" aria-label="Editor tools">
  <div class="group" role="group" aria-label="File">
    <Button
      size="tool"
      variant="secondary"
      icon="left"
      label={false}
      toggle
      bind:pressed={menuOpen}
      tooltip
      title="File"
      aria-label="File"
      onpointerdown={(event) => event.stopPropagation()}
      onclick={() => onmenu?.()}
    >
      {#snippet glyph()}<IconMenu />{/snippet}
    </Button>
  </div>

  <div class="group" role="group" aria-label="Transport">
    <Button
      size="tool"
      variant="secondary"
      icon="left"
      label={false}
      tooltip
      title={playing ? "Pause" : "Play"}
      aria-label={playing ? "Pause" : "Play"}
      aria-pressed={playing}
      disabled={!canPlay}
      onclick={togglePlay}
    >
      {#snippet glyph()}
        {#if playing}
          <IconPause />
        {:else}
          <IconPlay />
        {/if}
      {/snippet}
    </Button>
    <span class="time" title="Position and length with shared cuts removed">
      <span>{formatTime(currentSec)}</span>
      <span class="sep">/</span>
      <span>{formatTime(durationSec)}</span>
    </span>
  </div>

  <div class="group" role="group" aria-label="History">
    <Button
      size="tool"
      variant="secondary"
      icon="left"
      label={false}
      tooltip
      title="Undo"
      aria-label="Undo"
      disabled={!canUndo}
      onclick={() => onundo?.()}
    >
      {#snippet glyph()}<IconUndo />{/snippet}
    </Button>
    <Button
      size="tool"
      variant="secondary"
      icon="left"
      label={false}
      tooltip
      title="Redo"
      aria-label="Redo"
      disabled={!canRedo}
      onclick={() => onredo?.()}
    >
      {#snippet glyph()}<IconRedo />{/snippet}
    </Button>
  </div>

  <div class="group" role="group" aria-label="Markers">
    <Button
      size="tool"
      variant="secondary"
      icon="left"
      label={false}
      tooltip
      title="Mark"
      aria-label="Mark"
      disabled={!canMark}
      onclick={() => onmark?.()}
    >
      {#snippet glyph()}<IconMarker />{/snippet}
    </Button>
    <Button
      size="tool"
      variant="secondary"
      icon="left"
      label={false}
      tooltip
      title="Unmark"
      aria-label="Unmark"
      disabled={!canUnmark}
      onclick={() => onunmark?.()}
    >
      {#snippet glyph()}<IconMarker removeMarker />{/snippet}
    </Button>
    <Button
      size="tool"
      variant="secondary"
      icon="left"
      label={false}
      tooltip
      title="Silence"
      aria-label="Silence"
      aria-pressed={markerType === "silence"}
      onclick={() => (markerType = "silence")}
    >
      {#snippet glyph()}<IconSilence />{/snippet}
    </Button>
    <Button
      size="tool"
      variant="secondary"
      icon="left"
      label={false}
      tooltip
      title="Cut"
      aria-label="Cut"
      aria-pressed={markerType === "cut"}
      onclick={() => (markerType = "cut")}
    >
      {#snippet glyph()}<IconScissors />{/snippet}
    </Button>
    {#if hasSelection}
      <Button
        size="tool"
        variant="secondary"
        icon="left"
        label={false}
        tooltip
        title="Clear selection"
        aria-label="Clear selection"
        onclick={() => onclear?.()}
      >
        {#snippet glyph()}<IconClose />{/snippet}
      </Button>
    {/if}
  </div>

  <div class="group" id="view-group">
    <div class="group" role="group" aria-label="Zoom">
      <Button
        size="tool"
        variant="secondary"
        icon="left"
        label={false}
        tooltip
        title="Zoom out"
        aria-label="Zoom out"
        disabled={!canZoomOut}
        onclick={() => onzoomout?.()}
      >
        {#snippet glyph()}<IconZoom zoom="out" />{/snippet}
      </Button>
      <Button
        size="tool"
        variant="secondary"
        icon="left"
        label={false}
        tooltip
        title="Zoom in"
        aria-label="Zoom in"
        disabled={!canZoomIn}
        onclick={() => onzoomin?.()}
      >
        {#snippet glyph()}<IconZoom zoom="in" />{/snippet}
      </Button>
      <Button
        size="tool"
        variant="secondary"
        icon="left"
        label={false}
        tooltip
        title="View all audio"
        aria-label="View all audio"
        disabled={!canFit}
        onclick={() => onfit?.()}
      >
        {#snippet glyph()}<IconZoom zoom="fit" />{/snippet}
      </Button>
    </div>
    <div class="group preview-group" role="radiogroup" aria-label="View">
      <Button
        size="tool"
        variant="secondary"
        icon="left"
        label={false}
        tooltip
        title="Both views"
        aria-label="Both views"
        aria-pressed={view === "both"}
        onclick={() => (view = "both")}
      >
        {#snippet glyph()}<IconLayout layout="both" />{/snippet}
      </Button>
      <Button
        size="tool"
        variant="secondary"
        icon="left"
        label={false}
        tooltip
        title="Transcript"
        aria-label="Transcript"
        aria-pressed={view === "transcript"}
        onclick={() => (view = "transcript")}
      >
        {#snippet glyph()}<IconLayout layout="top" />{/snippet}
      </Button>
      <Button
        size="tool"
        variant="secondary"
        icon="left"
        label={false}
        tooltip
        title="Audio"
        aria-label="Audio"
        aria-pressed={view === "audio"}
        onclick={() => (view = "audio")}
      >
        {#snippet glyph()}<IconLayout layout="bottom" />{/snippet}
      </Button>
    </div>

    <div class="group">
      <Button
        size="tool"
        variant="secondary"
        icon="left"
        label={false}
        tooltip
        title="Preview edits"
        aria-label="Preview edits"
        aria-pressed={preview}
        onclick={togglePreview}
      >
        {#snippet glyph()}<IconEye hide={!preview} />{/snippet}
      </Button>
      <Button
        size="tool"
        variant="secondary"
        icon="left"
        label={false}
        tooltip
        title={asideOpen ? "Hide aside" : "Show aside"}
        aria-label={asideOpen ? "Hide aside" : "Show aside"}
        toggle
        bind:pressed={asideOpen}
      >
        {#snippet glyph()}
          {#if asideOpen}
            <IconChevron dir="left" />
          {:else}
            <IconSettings/>
          {/if}
        {/snippet}
      </Button>
    </div>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    flex-direction: row;
    align-items: center;
    flex: 1;
    min-width: 0;
    gap: 0.55rem;
    min-height: 24px;
  }

  .group {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
  }

  .group + .group {
    padding-left: 0.55rem;
    border-left: 1px solid var(--panel-line);
  }

  #view-group {
    margin-left: auto;
  }

  .time {
    display: inline-flex;
    align-items: baseline;
    margin-left: 0.35rem;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    line-height: 1;
    color: var(--cream-dim);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .sep {
    margin: 0 0.2em;
    color: var(--panel-highlight);
  }
</style>
