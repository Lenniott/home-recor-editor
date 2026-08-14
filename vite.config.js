import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [sveltekit()],

  // The Silero VAD worker (src/lib/audio/vadWorker.ts) is the only place
  // that imports @ricky0123/vad-web, and it does so inside a separate
  // Worker module graph that Vite's dep crawler doesn't follow from the
  // main entry points. Without this, the dependency gets discovered lazily
  // the first time the worker spins up — which fires a "new dependencies
  // optimized, reloading" full page reload mid-session, wiping whatever
  // take was loaded. Listing it here pre-bundles it at server start instead.
  optimizeDeps: {
    include: ["@ricky0123/vad-web"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
