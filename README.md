# Tauri + SvelteKit + TypeScript

This template should help get you started developing with Tauri, SvelteKit and TypeScript in Vite.

## macOS signed DMG

Certificate is already in Keychain (`Developer ID Application`). One-time notarization login, then build:

```bash
npm run macos:setup   # Apple ID + app-specific password → Keychain
npm run bundle:mac    # signed + notarized .app / .dmg
```

Do not put Apple passwords in the repo. `macos:setup` stores them in your login Keychain.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).
