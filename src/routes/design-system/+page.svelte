<script lang="ts">
  import type { Component } from "svelte";
  import Button from "$lib/components/baseline/Button.svelte";
  import Model, { type Placement } from "$lib/components/baseline/Model.svelte";
  import PageLayout from "$lib/components/baseline/PageLayout.svelte";
  import Toolbar from "$lib/components/baseline/Toolbar.svelte";
  import ViewPanel from "$lib/components/baseline/ViewPanel.svelte";
  import IconCaret from "$lib/components/icons/IconCaret.svelte";
  import IconChevron from "$lib/components/icons/IconChevron.svelte";
  import IconClose from "$lib/components/icons/IconClose.svelte";
  import IconExpanded from "$lib/components/icons/IconExpanded.svelte";
  import IconEye from "$lib/components/icons/IconEye.svelte";
  import IconLayout from "$lib/components/icons/IconLayout.svelte";
  import IconList from "$lib/components/icons/IconList.svelte";
  import IconMarker from "$lib/components/icons/IconMarker.svelte";
  import IconMenu from "$lib/components/icons/IconMenu.svelte";
  import IconPause from "$lib/components/icons/IconPause.svelte";
  import IconPlay from "$lib/components/icons/IconPlay.svelte";
  import IconRadio from "$lib/components/icons/IconRadio.svelte";
  import IconRedo from "$lib/components/icons/IconRedo.svelte";
  import IconScissors from "$lib/components/icons/IconScissors.svelte";
  import IconSettings from "$lib/components/icons/IconSettings.svelte";
  import IconSilence from "$lib/components/icons/IconSilence.svelte";
  import IconTranscript from "$lib/components/icons/IconTranscript.svelte";
  import IconUndo from "$lib/components/icons/IconUndo.svelte";
  import IconZoom from "$lib/components/icons/IconZoom.svelte";

  const icons: { name: string; Component: Component<{ size?: number }> }[] = [
    { name: "Close", Component: IconClose },
    { name: "List", Component: IconList },
    { name: "Marker", Component: IconMarker },
    { name: "Menu", Component: IconMenu },
    { name: "Pause", Component: IconPause },
    { name: "Play", Component: IconPlay },
    { name: "Redo", Component: IconRedo },
    { name: "Scissors", Component: IconScissors },
    { name: "Settings", Component: IconSettings },
    { name: "Silence", Component: IconSilence },
    { name: "Transcript", Component: IconTranscript },
    { name: "Undo", Component: IconUndo },
    { name: "Zoom in", Component: IconZoom },
  ];

  const variants = ["primary", "secondary", "tertiary"] as const;
  const placements: Placement[] = ["center", "left", "right", "top", "bottom"];

  let previewOn = $state(false);
  let tabOn = $state(true);
  let modelOpen = $state(false);
  let modelPlacement: Placement = $state("center");
  let specimenAside = $state(true);
  let toolMarker: "silence" | "cut" = $state("silence");
  let toolView: "both" | "transcript" | "audio" = $state("both");
  let toolPreview = $state(false);
  let toolPlaying = $state(false);
  let toolMenu = $state(false);
  let toolCanMark = $state(true);

  function openModel(placement: Placement): void {
    modelPlacement = placement;
    modelOpen = true;
  }
</script>

<section id="layout">
  <h2>Page layout</h2>
  <p>
    Stage column: header and view panels. Aside is full-height on the right, tabs at its top.
    Toolbar view buttons show both panels, or one large panel with the other as a caption / trim strip.
  </p>
  <div class="specimen" aria-label="Page layout specimen">
    <PageLayout embedded asideOpen={specimenAside}>
      {#snippet header()}
        <Toolbar
          bind:markerType={toolMarker}
          bind:view={toolView}
          bind:preview={toolPreview}
          bind:playing={toolPlaying}
          bind:menuOpen={toolMenu}
          bind:asideOpen={specimenAside}
          canMark={toolCanMark}
          canUnmark={toolCanMark}
          hasSelection={toolCanMark}
          currentSec={72.4}
          durationSec={248.1}
        />
      {/snippet}
      {#snippet aside()}
        <p class="specimen-copy">Aside · tabs live here</p>
      {/snippet}
      <ViewPanel
        title="Transcript"
        open={toolView !== "audio"}
        collapsible={false}
        onexpand={() => (toolView = "transcript")}
      >
        <p class="specimen-copy">
          {toolView === "audio" ? "Caption · current words" : "Transcript track"}
        </p>
      </ViewPanel>
      <ViewPanel
        title="Audio"
        open={toolView !== "transcript"}
        collapsible={false}
        onexpand={() => (toolView = "audio")}
      >
        <p class="specimen-copy">
          {toolView === "transcript" ? "Trim strip · waveforms" : "Audio track"}
        </p>
      </ViewPanel>
    </PageLayout>
  </div>
</section>

<section id="toolbar">
  <h2>Toolbar</h2>
  <p>
    24px tool chrome. File menu, then play/time, history, mark, zoom, view, preview, aside.
    Clear selection appears beside Cut. Pressed toggles fill amber. View is exclusive and drives the layout specimen.
  </p>
  <div class="toolbar-stage" aria-label="Toolbar specimen">
    <Toolbar
      bind:markerType={toolMarker}
      bind:view={toolView}
      bind:preview={toolPreview}
      bind:playing={toolPlaying}
      bind:menuOpen={toolMenu}
      bind:asideOpen={specimenAside}
      canMark={toolCanMark}
      canUnmark={toolCanMark}
      hasSelection={toolCanMark}
      currentSec={72.4}
      durationSec={248.1}
    />
  </div>
  <p class="readout">
    {toolMarker} · {toolView} · {toolPlaying ? "playing" : "paused"} · {toolPreview ? "preview on" : "preview off"}
  </p>
  <div class="row">
    <Button size="tool" variant="secondary" toggle bind:pressed={toolCanMark}>Selection</Button>
  </div>
</section>

<section id="icons">
  <h2>Icons</h2>
  <p>Default 16px, then a larger 24px row. Direction and on/off sit under the name.</p>
  <div class="icon-grid">
    {#each icons as { name, Component } (name)}
      <figure>
        <Component size={20} />
        <figcaption>{name}</figcaption>
      </figure>
    {/each}
    <figure>
      <IconChevron dir="left" size={20} />
      <figcaption>Chevron left</figcaption>
    </figure>
    <figure>
      <IconChevron dir="right" size={20} />
      <figcaption>Chevron right</figcaption>
    </figure>
    <figure>
      <IconCaret dir="left" size={20} />
      <figcaption>Caret left</figcaption>
    </figure>
    <figure>
      <IconCaret dir="right" size={20} />
      <figcaption>Caret right</figcaption>
    </figure>
    <figure>
      <IconRadio size={20} />
      <figcaption>Radio off</figcaption>
    </figure>
    <figure>
      <IconRadio on size={20} />
      <figcaption>Radio on</figcaption>
    </figure>
    <figure>
      <IconExpanded open size={20} />
      <figcaption>Expanded</figcaption>
    </figure>
    <figure>
      <IconExpanded open={false} size={20} />
      <figcaption>Collapsed</figcaption>
    </figure>
    <figure>
      <IconLayout layout="both" size={20} />
      <figcaption>Layout both</figcaption>
    </figure>
    <figure>
      <IconLayout layout="top" size={20} />
      <figcaption>Layout top</figcaption>
    </figure>
    <figure>
      <IconLayout layout="bottom" size={20} />
      <figcaption>Layout bottom</figcaption>
    </figure>
    <figure>
      <IconEye size={20} />
      <figcaption>Eye</figcaption>
    </figure>
    <figure>
      <IconEye hide size={20} />
      <figcaption>Eye hide</figcaption>
    </figure>
    <figure>
      <IconMarker removeMarker size={20} />
      <figcaption>Unmark</figcaption>
    </figure>
    <figure>
      <IconZoom zoom="out" size={20} />
      <figcaption>Zoom out</figcaption>
    </figure>
    <figure>
      <IconZoom zoom="fit" size={20} />
      <figcaption>View all</figcaption>
    </figure>
  </div>
</section>

<section id="buttons">
  <h2>Buttons</h2>
  <p>Primary, secondary, tertiary × default, disabled, toggle, icon, label, tooltip.</p>

  <h3>Variants</h3>
  <div class="row">
    {#each variants as variant (variant)}
      <Button {variant}>{variant}</Button>
    {/each}
  </div>

  <h3>Disabled</h3>
  <div class="row">
    {#each variants as variant (variant)}
      <Button {variant} disabled>{variant}</Button>
    {/each}
  </div>

  <h3>Toggle</h3>
  <div class="row">
    <Button variant="primary" toggle bind:pressed={tabOn}>transcript</Button>
    <Button variant="secondary" toggle bind:pressed={previewOn}>Preview edits</Button>
    <Button variant="tertiary" toggle bind:pressed={previewOn}>Preview edits</Button>
  </div>

  <h3>Icon left / right / none</h3>
  <div class="row">
    <Button variant="secondary" icon="left">
      {#snippet glyph()}<IconChevron dir="left" />{/snippet}
      Panels
    </Button>
    <Button variant="secondary" icon="right">
      {#snippet glyph()}<IconChevron dir="right" />{/snippet}
      Next
    </Button>
    <Button variant="primary" icon="left">
      {#snippet glyph()}<IconRadio on />{/snippet}
      Editing
    </Button>
    <Button variant="secondary">Fit recording</Button>
  </div>

  <h3>Label off (icon only)</h3>
  <div class="row">
    <Button variant="secondary" icon="left" label={false} aria-label="Undo">
      {#snippet glyph()}<IconUndo />{/snippet}
    </Button>
    <Button variant="secondary" icon="left" label={false} aria-label="Redo">
      {#snippet glyph()}<IconRedo />{/snippet}
    </Button>
    <Button variant="secondary" icon="left" label={false} aria-label="Clear">
      {#snippet glyph()}<IconClose />{/snippet}
    </Button>
    <Button variant="secondary" icon="left" label={false} aria-label="Previous">
      {#snippet glyph()}<IconCaret dir="left" />{/snippet}
    </Button>
  </div>

  <h3>Tooltip</h3>
  <div class="row">
    <Button
      variant="secondary"
      tooltip
      title="Every per-track silence marker becomes a shared cut"
    >Convert silences</Button>
    <Button
      variant="secondary"
      icon="left"
      label={false}
      tooltip
      title="Undo"
      aria-label="Undo"
    >
      {#snippet glyph()}<IconUndo />{/snippet}
    </Button>
  </div>
</section>

<section id="model">
  <h2>Model</h2>
  <p>Center sheet and four drawers. Escape and backdrop dismiss unless closable is false.</p>
  <div class="row">
    {#each placements as placement (placement)}
      <Button variant="secondary" onclick={() => openModel(placement)}>{placement}</Button>
    {/each}
  </div>
</section>

<Model bind:open={modelOpen} placement={modelPlacement} labelledby="model-title">
  <div class="model-body">
    <h2 id="model-title">{modelPlacement} model</h2>
    <p>Placement is a CSS variant on one dialog. Editor export uses center; the mobile pane can use left.</p>
    <Button variant="secondary" onclick={() => (modelOpen = false)}>Close</Button>
  </div>
</Model>

<style>
  section {
    background: var(--panel);
    border: 1px solid var(--panel-line);
    border-radius: 8px;
    padding: 1rem 1.1rem 1.2rem;
    scroll-margin-top: 0.5rem;
  }

  h2 {
    margin: 0 0 0.35rem;
    font-size: 0.95rem;
  }

  h3 {
    margin: 1rem 0 0.45rem;
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--cream-dim);
    font-weight: 600;
  }

  p {
    margin: 0 0 0.85rem;
    font-size: 0.75rem;
    line-height: 1.5;
    color: var(--cream-dim);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .icon-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
    gap: 0.5rem;
  }

  figure {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.45rem;
    padding: 0.75rem 0.5rem;
    background: var(--chassis);
    border: 1px solid var(--panel-line);
    border-radius: 6px;
    color: var(--cream);
  }

  figcaption {
    font-size: 0.68rem;
    color: var(--cream-dim);
    text-align: center;
  }

  .toolbar-stage {
    display: flex;
    align-items: center;
    min-height: 2.25rem;
    padding: 0.35rem 0.55rem;
    background: var(--chassis);
    border: 1px solid var(--panel-line);
    border-radius: 6px;
  }

  .readout {
    margin: 0.55rem 0 0.65rem;
  }

  .specimen {
    height: 16rem;
    border: 1px dashed var(--panel-line);
    border-radius: 6px;
    overflow: hidden;
    background: var(--chassis);
  }

  .specimen-copy {
    margin: 0;
    padding: 0.65rem;
    font-size: 0.72rem;
    color: var(--cream-dim);
  }

  .model-body {
    display: grid;
    gap: 0.65rem;
  }

  .model-body h2 {
    margin: 0;
  }

  .model-body p {
    margin: 0;
  }
</style>
