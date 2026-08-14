# VAD assets

Copied from installed packages so Silero VAD runs fully offline (no CDN
fetch at runtime) inside the Tauri webview. Re-copy after bumping either
dependency:

```bash
cp node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx static/vad-assets/
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm static/vad-assets/
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs static/vad-assets/
```

Referenced from `src/lib/audio/vad.ts`.
