/**
 * Content identity for a source recording — see `TrackDocument.source.sha256`
 * in `projectV2.ts`. Computed from the raw file bytes (before decode) so it
 * changes whenever the on-disk file does, independent of how Web Audio
 * happens to decode it.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // `digest` requires an ArrayBuffer-backed view spanning its own buffer;
  // a narrower view (e.g. a slice of a larger read) needs a copy first.
  const view = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice();
  const digest = await crypto.subtle.digest('SHA-256', view);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
