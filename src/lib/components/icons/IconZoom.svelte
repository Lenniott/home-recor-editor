<script lang="ts">
  let {
    size = 16,
    zoom = "in",
  }: { size?: number; zoom?: "in" | "out" | "fit" } = $props();
</script>

<svg
  class="icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#if zoom === "fit"}
    <path d="M4 9V6a2 2 0 0 1 2-2h3M20 9V6a2 2 0 0 0-2-2h-3M4 15v3a2 2 0 0 0 2 2h3M20 15v3a2 2 0 0 1-2 2h-3" />
  {:else}
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-3.2-3.2" />
    {#if zoom === "in"}
      <path d="M11 8v6M8 11h6" />
    {:else}
      <path d="M8 11h6" />
    {/if}
  {/if}
</svg>

<style>
  .icon {
    display: block;
    flex-shrink: 0;
  }
</style>
