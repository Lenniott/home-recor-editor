<script lang="ts">
  let { size = 16, on = false }: { size?: number; on?: boolean } = $props();
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
  <circle cx="12" cy="12" r="8" />
  {#if on}
    <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
  {/if}
</svg>

<style>
  .icon {
    display: block;
    flex-shrink: 0;
  }
</style>
