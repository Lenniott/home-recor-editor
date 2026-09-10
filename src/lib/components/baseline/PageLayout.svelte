<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    asideOpen = true,
    asideOverlay = false,
    embedded = false,
    scrollMain = false,
    header,
    footer,
    aside,
    children,
  }: {
    asideOpen?: boolean;
    asideOverlay?: boolean;
    embedded?: boolean;
    scrollMain?: boolean;
    header?: Snippet;
    footer?: Snippet;
    aside?: Snippet;
    children?: Snippet;
  } = $props();
</script>

<div class="page" class:embedded class:overlay={asideOverlay && asideOpen}>
  <div class="stage">
    {#if header}
      <header class="chrome">{@render header()}</header>
    {/if}
    <div class="main" class:scroll={scrollMain}>{@render children?.()}</div>
    {#if footer}
      <footer class="chrome foot">{@render footer()}</footer>
    {/if}
  </div>
  {#if aside && asideOpen}
    <aside class="rail">{@render aside()}</aside>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: row;
    height: 100vh;
    min-height: 0;
    background: var(--chassis);
  }

  .embedded {
    height: 100%;
  }

  .stage {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .chrome {
    display: flex;
    flex-direction: row;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    padding: 0.65rem 1rem;
    border-bottom: 1px solid var(--panel-line);
  }

  .foot {
    border-bottom: 0;
    border-top: 1px solid var(--panel-line);
    flex-wrap: wrap;
  }

  .main {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .main.scroll {
    overflow: auto;
    gap: 1.5rem;
    padding: 1rem;
  }

  .rail {
    width: 330px;
    min-width: 260px;
    max-width: 45%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border-left: 1px solid var(--panel-line);
  }

  .overlay .rail {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 15;
    max-width: 80%;
    box-shadow: -8px 0 30px #0009;
  }

  .overlay {
    position: relative;
  }
</style>
