//! One cancellable local worker at a time. Audio is never sent over the network.
use serde::Serialize;
use std::{
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tauri::{Emitter, Manager};

const MODEL_SHA1: &str = "137c40403d78fd54d454da0f9bd998f78703390c";
const MODEL_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin";
const EVENT: &str = "transcription-progress";

#[derive(Default)]
pub struct Jobs(Mutex<Option<(String, Arc<JobControl>)>>);

#[derive(Default)]
struct JobControl {
    cancelled: AtomicBool,
    child: Mutex<Option<Child>>,
}
impl JobControl {
    fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
        // Kill immediately on window close; do not rely on a worker surviving app exit.
        if let Ok(mut child) = self.child.lock() {
            if let Some(child) = child.as_mut() {
                let _ = child.kill();
            }
        }
    }
    fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    job_id: String,
    phase: String,
    percent: Option<f64>,
    result: Option<serde_json::Value>,
    error: Option<String>,
}

fn emit(
    app: &tauri::AppHandle,
    id: &str,
    phase: &str,
    percent: Option<f64>,
    result: Option<serde_json::Value>,
    error: Option<String>,
) {
    let _ = app.emit(
        EVENT,
        Progress {
            job_id: id.into(),
            phase: phase.into(),
            percent,
            result,
            error,
        },
    );
}

fn model_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("transcription/ggml-base.en.bin"))
}

fn verify_model(path: &Path) -> Result<(), String> {
    let output = Command::new("/usr/bin/shasum")
        .args(["-a", "1"])
        .arg(path)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success()
        && String::from_utf8_lossy(&output.stdout)
            .split_whitespace()
            .next()
            == Some(MODEL_SHA1)
    {
        Ok(())
    } else {
        Err("The speech model is missing or damaged. Download it again.".into())
    }
}

#[tauri::command]
pub async fn transcription_model_status(app: tauri::AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || Ok(verify_model(&model_path(&app)?).is_ok()))
        .await
        .map_err(|e| e.to_string())?
}

fn reserve(app: &tauri::AppHandle, id: &str) -> Result<Arc<JobControl>, String> {
    if id.is_empty() || id.len() > 80 || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err("Invalid transcription job ID".into());
    }
    let state = app.state::<Jobs>();
    let mut job = state.0.lock().map_err(|e| e.to_string())?;
    if job.is_some() {
        return Err("The previous task is still finishing. Please try again.".into());
    }
    let cancel = Arc::new(JobControl::default());
    *job = Some((id.into(), cancel.clone()));
    Ok(cancel)
}

pub fn cancel_all(app: &tauri::AppHandle) {
    if let Ok(job) = app.state::<Jobs>().0.lock() {
        if let Some((_, cancel)) = job.as_ref() {
            cancel.cancel();
        }
    }
}

#[tauri::command]
pub fn cancel_transcription(app: tauri::AppHandle, job_id: String) {
    if let Ok(job) = app.state::<Jobs>().0.lock() {
        if let Some((id, cancel)) = job.as_ref() {
            if id == &job_id {
                cancel.cancel();
            }
        }
    }
}

fn finish(
    app: &tauri::AppHandle,
    id: &str,
    cancel: &JobControl,
    result: Result<Option<serde_json::Value>, String>,
) {
    if let Ok(mut job) = app.state::<Jobs>().0.lock() {
        *job = None;
    }
    if cancel.is_cancelled() {
        emit(app, id, "cancelled", None, None, None);
    } else {
        match result {
            Ok(result) => emit(app, id, "complete", Some(100.0), result, None),
            Err(error) => emit(app, id, "error", None, None, Some(error)),
        }
    }
}

/// Drain stderr on a separate thread so the engine never blocks on a full pipe.
fn run(
    app: &tauri::AppHandle,
    id: &str,
    cancel: &JobControl,
    command: Command,
    phase: &str,
) -> Result<(), String> {
    let app = app.clone();
    let id = id.to_owned();
    run_process(
        command,
        cancel,
        move |percent| emit(&app, &id, "transcribing", Some(percent), None, None),
        phase,
    )
}

fn parse_progress(line: &str) -> Option<f64> {
    let percent = line
        .split("progress =")
        .nth(1)?
        .trim()
        .trim_end_matches('%')
        .trim()
        .parse::<f64>()
        .ok()?;
    percent.is_finite().then(|| percent.clamp(0.0, 100.0))
}

fn run_process(
    mut command: Command,
    cancel: &JobControl,
    progress: impl Fn(f64) + Send + 'static,
    phase: &str,
) -> Result<(), String> {
    if cancel.is_cancelled() {
        return Err("Cancelled".into());
    }
    let mut child = command
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not start {phase}: {e}"))?;
    let stderr = child.stderr.take().ok_or("Missing process output")?;
    *cancel.child.lock().map_err(|e| e.to_string())? = Some(child);
    let reader = thread::spawn(move || {
        let mut tail = std::collections::VecDeque::new();
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if let Some(percent) = parse_progress(&line) {
                progress(percent);
            }
            if tail.len() == 12 {
                tail.pop_front();
            }
            tail.push_back(line);
        }
        tail.into_iter().collect::<Vec<_>>().join("\n")
    });
    let status = loop {
        let result = {
            let mut slot = cancel.child.lock().map_err(|e| e.to_string())?;
            let child = slot.as_mut().ok_or("Missing transcription process")?;
            if cancel.is_cancelled() {
                let _ = child.kill();
            }
            match child.try_wait() {
                Ok(Some(status)) => {
                    *slot = None;
                    Some(Ok(status))
                }
                Ok(None) => None,
                Err(e) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    *slot = None;
                    Some(Err(e.to_string()))
                }
            }
        };
        if let Some(result) = result {
            break result;
        }
        thread::sleep(Duration::from_millis(100));
    };
    let tail = reader.join().unwrap_or_default();
    if cancel.is_cancelled() {
        return Err("Cancelled".into());
    }
    if status?.success() {
        Ok(())
    } else {
        Err(format!("{phase} failed. {tail}"))
    }
}

struct TempDir(PathBuf);
impl TempDir {
    fn create(path: PathBuf) -> Result<Self, String> {
        fs::create_dir(&path).map_err(|e| e.to_string())?;
        Ok(Self(path))
    }
}
impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[tauri::command]
pub fn download_transcription_model(app: tauri::AppHandle, job_id: String) -> Result<(), String> {
    let cancel = reserve(&app, &job_id)?;
    thread::spawn(move || {
        let result = (|| {
            let destination = model_path(&app)?;
            let parent = destination.parent().ok_or("Missing cache directory")?;
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            let temp = TempDir::create(parent.join(format!("download-{job_id}")))?;
            let partial = temp.0.join("model.part");
            emit(&app, &job_id, "downloading", None, None, None);
            let mut command = Command::new("/usr/bin/curl");
            command
                .args([
                    "--fail",
                    "--location",
                    "--silent",
                    "--show-error",
                    "--connect-timeout",
                    "30",
                    "--max-time",
                    "1800",
                    "--proto",
                    "=https",
                    "--proto-redir",
                    "=https",
                    "--output",
                ])
                .arg(&partial)
                .arg(MODEL_URL);
            run(&app, &job_id, &cancel, command, "download")?;
            emit(&app, &job_id, "verifying", None, None, None);
            verify_model(&partial)?;
            if cancel.is_cancelled() {
                return Err("Cancelled".into());
            }
            fs::rename(&partial, destination).map_err(|e| e.to_string())?;
            Ok(None)
        })();
        finish(&app, &job_id, &cancel, result);
    });
    Ok(())
}

fn engine_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries/whisper-cli-aarch64-apple-darwin"));
    }
    // Tauri externalBin puts the executable next to the app executable.
    Ok(app
        .path()
        .executable_dir()
        .map_err(|e| e.to_string())?
        .join("whisper-cli"))
}

#[tauri::command]
pub fn start_transcription(
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    let id = request
        .headers()
        .get("x-job-id")
        .and_then(|v| v.to_str().ok())
        .ok_or("Missing job ID")?
        .to_owned();
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes,
        _ => return Err("Expected WAV audio".into()),
    };
    if bytes.len() < 44 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("Invalid WAV audio".into());
    }
    let cancel = reserve(&app, &id)?;
    let bytes = bytes.clone();
    thread::spawn(move || {
        let result = (|| {
            let model = model_path(&app)?;
            verify_model(&model)?;
            let temp =
                TempDir::create(std::env::temp_dir().join(format!("hre-transcription-{id}")))?;
            let audio = temp.0.join("audio.wav");
            fs::write(&audio, bytes).map_err(|e| e.to_string())?;
            let output = temp.0.join("transcript");
            let mut command = Command::new(engine_path(&app)?);
            command
                .arg("-m")
                .arg(model)
                .arg("-f")
                .arg(audio)
                .arg("-of")
                .arg(&output)
                .args(["-l", "en", "-oj", "-ml", "1", "-sow", "-pp"]);
            emit(&app, &id, "transcribing", Some(0.0), None, None);
            run(&app, &id, &cancel, command, "transcription")?;
            let json =
                fs::read_to_string(output.with_extension("json")).map_err(|e| e.to_string())?;
            let result =
                serde_json::from_str(&json).map_err(|e| format!("Invalid engine output: {e}"))?;
            Ok(Some(result))
        })();
        finish(&app, &id, &cancel, result);
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_uses_engine_format() {
        assert_eq!(
            parse_progress("whisper_print_progress_callback: progress =  35%"),
            Some(35.0)
        );
        assert_eq!(parse_progress("progress = NaN%"), None);
        assert_eq!(parse_progress("loading model"), None);
    }

    #[test]
    fn cancellation_kills_and_reaps_the_process() {
        let control = Arc::new(JobControl::default());
        let worker_control = control.clone();
        let start = std::time::Instant::now();
        let worker = thread::spawn(move || {
            let mut command = Command::new("/bin/sleep");
            command.arg("30");
            run_process(command, &worker_control, |_| {}, "test")
        });
        thread::sleep(Duration::from_millis(100));
        control.cancel();
        assert_eq!(worker.join().unwrap().unwrap_err(), "Cancelled");
        assert!(start.elapsed() < Duration::from_secs(3));
        assert!(control.child.lock().unwrap().is_none());
    }

    #[test]
    fn process_failure_has_actionable_output() {
        let mut command = Command::new("/bin/sh");
        command.args(["-c", "echo 'model could not load' >&2; exit 7"]);
        let error =
            run_process(command, &JobControl::default(), |_| {}, "transcription").unwrap_err();
        assert!(error.contains("model could not load"));
    }

    #[test]
    fn incomplete_models_are_rejected_and_temporary_files_are_cleaned() {
        let path = std::env::temp_dir().join(format!("hre-test-{}", std::process::id()));
        {
            let temp = TempDir(path.clone());
            fs::create_dir_all(&temp.0).unwrap();
            let partial = temp.0.join("partial.bin");
            fs::write(&partial, b"incomplete download").unwrap();
            assert!(verify_model(&partial).is_err());
            assert!(verify_model(&temp.0.join("missing.bin")).is_err());
        }
        assert!(!path.exists());
    }
}
