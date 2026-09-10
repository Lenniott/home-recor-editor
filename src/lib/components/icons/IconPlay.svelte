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
  <path d="M6 4L20 12L6 20Z" />
</svg>

<style>
  .icon {
    display: block;
    flex-shrink: 0;
  }
</style>
