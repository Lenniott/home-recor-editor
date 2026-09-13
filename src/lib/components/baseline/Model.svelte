<script module lang="ts">
  export type Placement = "center" | "left" | "right" | "top" | "bottom";
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    open = $bindable(false),
    placement = "center",
    labelledby = undefined,
    closable = true,
    children,
    onclose,
  }: {
    open?: boolean;
    placement?: Placement;
    labelledby?: string;
    closable?: boolean;
    children?: Snippet;
    onclose?: () => void;
  } = $props();

  function syncOpen(shouldOpen: boolean) {
    return (node: HTMLDialogElement) => {
      if (shouldOpen && !node.open) node.showModal();
      else if (!shouldOpen && node.open) node.close();
    };
  }

  function handleClose(): void {
    open = false;
    onclose?.();
  }

  function handleCancel(event: Event): void {
    if (!closable) event.preventDefault();
  }
</script>

<dialog
  {@attach syncOpen(open)}
  class="model {placement}"
  aria-labelledby={labelledby}
  onclose={handleClose}
  oncancel={handleCancel}
>
  {@render children?.()}
</dialog>

<style>
  .model[open] {
    margin: 0;
    padding: 1.1rem;
    background: var(--panel);
    color: var(--cream);
    border: 1px solid var(--panel-line);
    box-shadow: 0 12px 40px #000a;
    max-width: 100vw;
    max-height: 100vh;
  }

  .model::backdrop {
    background: #0008;
  }

  .center[open] {
    position: fixed;
    inset: 50% auto auto 50%;
    transform: translate(-50%, -50%);
    width: min(22rem, calc(100vw - 2rem));
    border-radius: 8px;
  }

  .left[open],
  .right[open] {
    position: fixed;
    top: 0;
    bottom: 0;
    width: min(22rem, 80vw);
    height: 100vh;
    border-radius: 0;
  }

  .left[open] {
    left: 0;
    right: auto;
    border-right: 1px solid var(--panel-line);
  }

  .right[open] {
    right: 0;
    left: auto;
    border-left: 1px solid var(--panel-line);
  }

  .top[open],
  .bottom[open] {
    position: fixed;
    left: 0;
    right: 0;
    width: 100vw;
    height: min(18rem, 50vh);
    border-radius: 0;
  }

  .top[open] {
    top: 0;
    bottom: auto;
    border-bottom: 1px solid var(--panel-line);
  }

  .bottom[open] {
    bottom: 0;
    top: auto;
    border-top: 1px solid var(--panel-line);
  }
</style>
