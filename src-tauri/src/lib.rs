// Reads an audio file picked by the user (via the dialog plugin) as raw
// bytes so the frontend can decode it with the Web Audio API. Kept as a
// plain filesystem read — no fs-plugin scope needed since this is an
// app-defined command, not a plugin command.
//
// Returns `tauri::ipc::Response` rather than `Vec<u8>` directly: a plain
// `Vec<u8>` gets JSON-serialized as a comma-separated array of numbers,
// which is fine for small payloads but grinds to a halt on an hour-long
// recording (hundreds of MB). `Response` sends the bytes raw so the
// frontend gets an `ArrayBuffer` instead of parsing a giant JSON array.
#[tauri::command]
fn read_audio_file(path: &str) -> Result<tauri::ipc::Response, String> {
    let data = std::fs::read(path).map_err(|err| err.to_string())?;
    Ok(tauri::ipc::Response::new(data))
}

// Sidecar project files (marks, IN/OUT, settings) are small JSON, so a
// plain String round-trip is fine here — no need for the raw-bytes
// `ipc::Response` trick `read_audio_file` uses for large audio payloads.

/// Reads a sidecar project file. `Ok(None)` when it doesn't exist yet
/// (e.g. a recording that has never been saved) rather than an error,
/// since that's the normal case on first open.
#[tauri::command]
fn read_text_file(path: &str) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(contents) => Ok(Some(contents)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

/// Writes (overwriting) a sidecar project file next to the recording.
#[tauri::command]
fn write_text_file(path: &str, contents: &str) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|err| err.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_audio_file,
            read_text_file,
            write_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
