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
  <path d="M7 5H10V19H7V5ZM14 5H17V19H14V5Z" />
</svg>

<style>
  .icon {
    display: block;
    flex-shrink: 0;
  }
</style>
