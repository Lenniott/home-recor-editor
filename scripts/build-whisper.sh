#!/bin/bash
# Reproducible Apple Silicon sidecar; no runtime Homebrew dependencies.
set -euo pipefail
cd "$(dirname "$0")/.."
version=1.7.6
archive_sha=166140e9a6d8a36f787a2bd77f8f44dd64874f12dd8359ff7c1f4f9acb86202e
binary=src-tauri/binaries/whisper-cli-aarch64-apple-darwin
if [[ -x "$binary" && -f "$binary.version" && "$(cat "$binary.version")" == "$version" ]]; then exit 0; fi
if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
  echo 'Local transcription currently requires an Apple Silicon Mac.' >&2
  exit 1
fi
command -v cmake >/dev/null || { echo 'Install CMake to build the transcription engine.' >&2; exit 1; }
work=$(mktemp -d "${TMPDIR:-/tmp}/hre-whisper-build.XXXXXX")
trap 'rm -rf "$work"' EXIT
curl --fail --location --proto '=https' --output "$work/source.tar.gz" "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v${version}.tar.gz"
printf '%s  %s\n' "$archive_sha" "$work/source.tar.gz" | shasum -a 256 -c -
tar -xzf "$work/source.tar.gz" -C "$work"
cmake -S "$work/whisper.cpp-$version" -B "$work/build" \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF \
  -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON \
  -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF
cmake --build "$work/build" --config Release --target whisper-cli -j 4
mkdir -p src-tauri/binaries
cp "$work/build/bin/whisper-cli" "$binary"
cp "$work/whisper.cpp-$version/LICENSE" src-tauri/binaries/whisper-LICENSE
printf '%s' "$version" > "$binary.version"
