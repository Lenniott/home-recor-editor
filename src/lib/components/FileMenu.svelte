<script module lang="ts">
  export type ExportChoice = "recording" | "separate" | "mix" | "both";
</script>

<script lang="ts">
  let {
    isLoading = false,
    isSaving = false,
    isExporting = false,
    exportProgress = 0,
    exportStage = "",
    exportError = null,
    canSave = false,
    canExport = false,
    twoTrack = false,
    onSave,
    onSaveAs,
    onOpen,
    onImport,
    onExport,
    onExportReset,
  }: {
    isLoading?: boolean;
    isSaving?: boolean;
    isExporting?: boolean;
    exportProgress?: number;
    exportStage?: string;
    exportError?: string | null;
    canSave?: boolean;
    canExport?: boolean;
    twoTrack?: boolean;
    onSave: () => void;
    onSaveAs: () => void;
    onOpen: () => void;
    onImport: () => void;
    onExport: (choice: ExportChoice) => Promise<void>;
    onExportReset: () => void;
  } = $props();

  let menuOpen = $state(false);
  let exportDialog: HTMLDialogElement | undefined = $state();
  let root: HTMLElement | undefined = $state();
  let awaitingDestination = $state(false);

  const showExportProgress = $derived(isExporting || !!exportStage);

  function closeMenu(): void {
    menuOpen = false;
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
    exportDialog?.showModal();
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
    exportDialog?.close();
    onExportReset();
    awaitingDestination = false;
  }

  function onExportCancel(event: Event): void {
    if (isExporting) event.preventDefault();
    else onExportReset();
  }

  function onWindowPointerDown(event: PointerEvent): void {
    if (menuOpen && root && !root.contains(event.target as Node)) closeMenu();
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && menuOpen) {
      closeMenu();
      event.preventDefault();
    }
  }

  $effect(() => {
    if (isExporting && exportDialog && !exportDialog.open) exportDialog.showModal();
  });
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeydown} />

<div class="file-menu" bind:this={root}>
  <button
    type="button"
    class="file-toggle"
    aria-haspopup="menu"
    aria-expanded={menuOpen}
    onclick={() => (menuOpen = !menuOpen)}
  >
    File
  </button>
  {#if menuOpen}
    <div class="menu" role="menu">
      <button type="button" role="menuitem" disabled={!canSave || isSaving} onclick={() => run(onSave)}>
        {isSaving ? "Saving…" : "Save"}
      </button>
      <button type="button" role="menuitem" disabled={!canSave || isSaving} onclick={() => run(onSaveAs)}>Save as</button>
      <button type="button" role="menuitem" disabled={isLoading} onclick={() => run(onOpen)}>Open</button>
      <button type="button" role="menuitem" disabled={isLoading} onclick={() => run(onImport)}>Import</button>
      <button type="button" role="menuitem" disabled={!canExport || isExporting} onclick={openExport}>
        {isExporting ? "Exporting…" : "Export"}
      </button>
    </div>
  {/if}
</div>

<dialog class="modal" bind:this={exportDialog} aria-labelledby="export-title" oncancel={onExportCancel}>
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
    <button type="button" onclick={() => chooseExport("separate")}>Separate tracks</button>
    <button type="button" onclick={() => chooseExport("mix")}>Combined mix</button>
    <button type="button" onclick={() => chooseExport("both")}>Both</button>
  {:else}
    <button type="button" onclick={() => chooseExport("recording")}>Export edited recording</button>
  {/if}
  {#if exportError && !isExporting}
    <p class="fail">Export failed: {exportError}</p>
  {/if}
  {#if !isExporting}
    <button type="button" class="cancel" onclick={closeExport} disabled={awaitingDestination}>
      {showExportProgress ? (exportError ? "Close" : "Done") : "Cancel"}
    </button>
  {/if}
</dialog>

<style>
  .file-menu {
    position: relative;
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
  .modal[open] {
    width: min(22rem, calc(100vw - 2rem));
    display: grid;
    gap: 0.5rem;
    padding: 1.1rem;
    background: var(--panel);
    color: var(--cream);
    border: 1px solid var(--panel-line);
    border-radius: 8px;
    box-shadow: 0 12px 40px #000a;
  }
  .modal::backdrop {
    background: #0008;
  }
  .modal h2 {
    margin: 0;
    font-size: 0.95rem;
  }
  .modal p {
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
  .cancel {
    margin-top: 0.25rem;
  }
</style>
