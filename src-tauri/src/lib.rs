mod transcription;
use tauri::Manager;

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
///
/// Writes to a temp file in the same directory first, then renames it
/// over the destination — `rename` within one filesystem is atomic, so a
/// crash or power loss mid-write can never leave a truncated/corrupt
/// project file in place; the reader sees either the old contents or the
/// new ones, never a partial write. Autosave (see `EditorState`/`+page.svelte`)
/// depends on this: it writes far more often than a manual Cmd+S ever did.
#[tauri::command]
fn write_text_file(path: &str, contents: &str) -> Result<(), String> {
    let target = std::path::Path::new(path);
    let dir = target.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or_else(|| std::path::Path::new("."));
    let file_name = target.file_name().and_then(|n| n.to_str()).unwrap_or("project");
    let tmp = dir.join(format!(".{file_name}.tmp-{}", std::process::id()));
    std::fs::write(&tmp, contents).map_err(|err| err.to_string())?;
    std::fs::rename(&tmp, target).map_err(|err| {
        let _ = std::fs::remove_file(&tmp);
        err.to_string()
    })
}

// Writes an exported recording to a user-chosen path (from the save
// dialog, same trust model as `read_audio_file`'s open). Mirrors
// `read_audio_file`'s raw `ipc::Response` trick in reverse: a plain
// `Vec<u8>` argument would get JSON-serialized as a comma-separated array
// of numbers on the way in, which grinds to a halt on an hour-long
// recording (hundreds of MB) same as it did on the way out. Taking
// `tauri::ipc::Request` instead lets the frontend send the encoded WAV as
// a raw binary body; since a raw body can't carry named arguments
// alongside it, the destination path rides in as an IPC header.
#[tauri::command]
fn write_audio_file(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let path = request
        .headers()
        .get("path")
        .ok_or_else(|| "missing path header".to_string())?
        .to_str()
        .map_err(|err| err.to_string())?;
    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => {
            std::fs::write(path, bytes).map_err(|err| err.to_string())
        }
        _ => Err("expected a raw binary body".to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(transcription::Jobs::default())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                transcription::cancel_all(window.app_handle());
            }
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            transcription::transcription_model_status,
            transcription::download_transcription_model,
            transcription::start_transcription,
            transcription::cancel_transcription,
            read_audio_file,
            read_text_file,
            write_text_file,
            write_audio_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
