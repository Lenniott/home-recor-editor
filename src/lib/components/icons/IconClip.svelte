<script lang="ts">
  let { size = 16 }: { size?: number } = $props();
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
  <rect x="3" y="5" width="10" height="14" rx="1.5" />
  <rect x="11" y="8" width="10" height="11" rx="1.5" />
</svg>

<style>
  .icon {
    display: block;
    flex-shrink: 0;
  }
</style>
