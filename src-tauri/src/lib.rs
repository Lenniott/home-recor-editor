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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_audio_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
