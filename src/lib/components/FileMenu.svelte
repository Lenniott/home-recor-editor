<script module lang="ts">
  export type ExportChoice = "recording" | "separate" | "mix" | "both";
</script>

<script lang="ts">
  import Button from "./baseline/Button.svelte";
  import Model from "./baseline/Model.svelte";

  let {
    isLoading = false,
    isSaving = false,
    isExporting = false,
    exportProgress = 0,
    exportStage = "",
    exportError = null,
    canSave = false,
    canExport = false,
    canAddRecording = false,
    twoTrack = false,
    onSave,
    onSaveAs,
    onOpen,
    onNew,
    onImport,
    onAddRecording,
    onExport,
    onExportReset,
    open = $bindable(false),
    showTrigger = true,
  }: {
    isLoading?: boolean;
    isSaving?: boolean;
    isExporting?: boolean;
    exportProgress?: number;
    exportStage?: string;
    exportError?: string | null;
    canSave?: boolean;
    canExport?: boolean;
    canAddRecording?: boolean;
    twoTrack?: boolean;
    onSave: () => void;
    onSaveAs: () => void;
    onOpen: () => void;
    onNew: () => void;
    onImport: () => void;
    onAddRecording: () => void;
    onExport: (choice: ExportChoice) => Promise<void>;
    onExportReset: () => void;
    open?: boolean;
    showTrigger?: boolean;
  } = $props();
  let exportOpen = $state(false);
  let root: HTMLElement | undefined = $state();
  let awaitingDestination = $state(false);

  const showExportProgress = $derived(isExporting || !!exportStage);

  function closeMenu(): void {
    open = false;
  }

  function run(action: () => void): void {
    closeMenu();
    action();
  }

  function openExport(): void {
    closeMenu();
    if (!canExport || isExporting) return;
    onExportReset();
    awaitingDestination = false;
    exportOpen = true;
  }

  async function chooseExport(choice: ExportChoice): Promise<void> {
    awaitingDestination = true;
    try {
      await onExport(choice);
    } finally {
      awaitingDestination = false;
    }
  }

  function closeExport(): void {
    if (isExporting) return;
    exportOpen = false;
    awaitingDestination = false;
  }

  function onExportClose(): void {
    onExportReset();
    awaitingDestination = false;
  }

  function onWindowPointerDown(event: PointerEvent): void {
    if (open && root && !root.contains(event.target as Node)) closeMenu();
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && open) {
      closeMenu();
      event.preventDefault();
    }
  }

  $effect(() => {
    if (isExporting && !exportOpen) exportOpen = true;
  });
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeydown} />

<div class="file-menu" class:anchored={!showTrigger} bind:this={root}>
  {#if showTrigger}
    <Button
      variant="secondary"
      toggle
      bind:pressed={open}
      aria-haspopup="menu"
      aria-expanded={open}
    >
      File
    </Button>
  {/if}
  {#if open}
    <div class="menu" role="menu">
      <button type="button" role="menuitem" disabled={isLoading} onclick={() => run(onNew)}>New</button>
      <button type="button" role="menuitem" disabled={!canSave || isSaving} onclick={() => run(onSave)}>
        {isSaving ? "Saving…" : "Save"}
      </button>
      <button type="button" role="menuitem" disabled={!canSave || isSaving} onclick={() => run(onSaveAs)}>Save as</button>
      <button type="button" role="menuitem" disabled={isLoading} onclick={() => run(onOpen)}>Open</button>
      <button type="button" role="menuitem" disabled={isLoading} onclick={() => run(onImport)}>Import</button>
      <button type="button" role="menuitem" disabled={isLoading || !canAddRecording} onclick={() => run(onAddRecording)}>Add recording</button>
      <button type="button" role="menuitem" disabled={!canExport || isExporting} onclick={openExport}>
        {isExporting ? "Exporting…" : "Export"}
      </button>
    </div>
  {/if}
</div>

<Model
  placement="center"
  bind:open={exportOpen}
  labelledby="export-title"
  closable={!isExporting}
  onclose={onExportClose}
>
  <div class="export-sheet">
    <h2 id="export-title">Export</h2>
    <p>Apply all silence and cut markers to new WAV files. The project stays editable.</p>
    {#if showExportProgress}
      <div
        class="export-progress"
        role="progressbar"
        aria-label={exportStage}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(exportProgress * 100)}
      >
        <div class="export-progress-track"><span style="width:{exportProgress * 100}%"></span></div>
        <span>{exportStage} · {Math.round(exportProgress * 100)}%</span>
      </div>
    {:else if awaitingDestination}
      <p class="wait">Choose a save location…</p>
    {:else if twoTrack}
      <Button variant="primary" onclick={() => chooseExport("separate")}>Separate tracks</Button>
      <Button variant="primary" onclick={() => chooseExport("mix")}>Combined mix</Button>
      <Button variant="primary" onclick={() => chooseExport("both")}>Both</Button>
    {:else}
      <Button variant="primary" onclick={() => chooseExport("recording")}>Export edited recording</Button>
    {/if}
    {#if exportError && !isExporting}
      <p class="fail">Export failed: {exportError}</p>
    {/if}
    {#if !isExporting}
      <Button variant="secondary" class="cancel" onclick={closeExport} disabled={awaitingDestination}>
        {showExportProgress ? (exportError ? "Close" : "Done") : "Cancel"}
      </Button>
    {/if}
  </div>
</Model>

<style>
  .file-menu {
    position: relative;
  }
  .file-menu.anchored {
    position: absolute;
    left: 0;
    top: 100%;
    z-index: 20;
    width: 0;
    height: 0;
    overflow: visible;
  }
  .menu {
    position: absolute;
    left: 0;
    top: calc(100% + 4px);
    z-index: 20;
    min-width: 10.5rem;
    padding: 0.35rem;
    display: grid;
    gap: 0.2rem;
    background: var(--panel);
    border: 1px solid var(--panel-line);
    border-radius: 6px;
    box-shadow: 0 8px 32px #0008;
  }
  .menu button {
    text-align: left;
    padding: 0.4rem 0.65rem;
  }
  .export-sheet {
    display: grid;
    gap: 0.5rem;
  }
  .export-sheet h2 {
    margin: 0;
    font-size: 0.95rem;
  }
  .export-sheet p {
    margin: 0 0 0.35rem;
    font-size: 0.75rem;
    line-height: 1.5;
    color: var(--cream-dim);
  }
  .wait, .fail {
    margin: 0;
  }
  .fail {
    color: var(--in-color);
  }
  .export-progress {
    display: grid;
    gap: 0.45rem;
    font: 0.7rem var(--font-mono);
    color: var(--cream-dim);
  }
  .export-progress-track {
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--chassis);
    border: 1px solid var(--panel-line);
  }
  .export-progress-track span {
    display: block;
    height: 100%;
    background: var(--amber);
    transition: width 0.16s ease-out;
  }
  .export-sheet :global(.cancel) {
    margin-top: 0.25rem;
  }
</style>
