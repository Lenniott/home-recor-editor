#!/usr/bin/env node
/**
 * Optional whisper-cli smoke. Default `npm test` does not run this.
 * Enable with WHISPER_SMOKE=1 when the bundled sidecar and model cache exist.
 */
import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

if (process.env.WHISPER_SMOKE !== "1") {
  console.log("whisper smoke skipped (set WHISPER_SMOKE=1 and provide the engine binary)");
  process.exit(0);
}

const binaries = path.join(process.cwd(), "src-tauri", "binaries");
const names = existsSync(binaries) ? readdirSync(binaries) : [];
const engine = names.find((name) => name.startsWith("whisper") && !name.includes("LICENSE"));
if (!engine) {
  console.error("WHISPER_SMOKE=1 but no whisper sidecar was found under src-tauri/binaries.");
  process.exit(1);
}

const result = spawnSync(path.join(binaries, engine), ["-h"], { encoding: "utf8" });
if (result.status !== 0) {
  console.error(result.stderr || result.stdout || "whisper sidecar failed");
  process.exit(result.status ?? 1);
}
console.log("whisper sidecar responded to -h");
