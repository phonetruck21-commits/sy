//! Native side of the S.Y LIVE SERVICE technician app.
//!
//! The UI (React) runs inside WebView2 and accesses USB cameras/microphones through the
//! standard Media Capture APIs. The native side only provides what a browser cannot do well:
//! streaming recordings straight to the local disk (works offline, survives crashes),
//! opening the recordings folder, and basic host information.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;

use tauri::ipc::{InvokeBody, Request};

const FOLDER_NAME: &str = "SY Live Service";

fn recordings_dir() -> Result<PathBuf, String> {
    let base = dirs::video_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "cannot resolve the user's Videos folder".to_string())?;
    let dir = base.join(FOLDER_NAME);
    fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    Ok(dir)
}

/// Only plain file names produced by the UI are accepted (no paths, no traversal).
fn safe_file_name(raw: &str) -> Result<String, String> {
    let ok_chars = raw.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.');
    let ok_ext = raw.ends_with(".mp4") || raw.ends_with(".webm");
    if raw.is_empty() || raw.len() > 180 || !ok_chars || !ok_ext || raw.contains("..") || raw.starts_with('.') {
        return Err(format!("invalid recording file name: {raw}"));
    }
    Ok(raw.to_string())
}

/// Appends one MediaRecorder chunk (raw bytes, no JSON encoding) to the recording file.
#[tauri::command]
fn recording_append(request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("expected a raw binary body".into());
    };
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .ok_or("missing x-file-name header")?;
    let path = recordings_dir()?.join(safe_file_name(name)?);
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("cannot open {}: {e}", path.display()))?;
    file.write_all(data).map_err(|e| format!("write failed: {e}"))?;
    Ok(())
}

#[derive(serde::Serialize)]
struct Finished {
    path: String,
    size: u64,
}

#[tauri::command]
fn recording_finish(file_name: String) -> Result<Finished, String> {
    let path = recordings_dir()?.join(safe_file_name(&file_name)?);
    let meta = fs::metadata(&path).map_err(|e| format!("recording not found: {e}"))?;
    let file = OpenOptions::new().append(true).open(&path).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    Ok(Finished { path: path.display().to_string(), size: meta.len() })
}

#[tauri::command]
fn open_recordings_folder() -> Result<(), String> {
    let dir = recordings_dir()?;
    #[cfg(target_os = "windows")]
    let mut cmd = Command::new("explorer");
    #[cfg(target_os = "macos")]
    let mut cmd = Command::new("open");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = Command::new("xdg-open");
    cmd.arg(&dir).spawn().map_err(|e| format!("cannot open folder: {e}"))?;
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    recordings_dir: String,
    hostname: String,
}

#[tauri::command]
fn app_info(app: tauri::AppHandle) -> Result<AppInfo, String> {
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        recordings_dir: recordings_dir()?.display().to_string(),
        hostname: gethostname::gethostname().to_string_lossy().to_string(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![recording_append, recording_finish, open_recordings_folder, app_info])
        .run(tauri::generate_context!())
        .expect("error while running S.Y LIVE SERVICE");
}

#[cfg(test)]
mod tests {
    use super::safe_file_name;

    #[test]
    fn accepts_generated_names() {
        assert!(safe_file_name("job-1001_2026-11-14T15-00-00.mp4").is_ok());
        assert!(safe_file_name("job-1001.webm").is_ok());
    }

    #[test]
    fn rejects_traversal_and_other_types() {
        for bad in ["../x.mp4", "..\\x.mp4", "a/b.mp4", "C:\\x.mp4", "x.exe", ".mp4", "", "x..mp4"] {
            assert!(safe_file_name(bad).is_err(), "{bad} should be rejected");
        }
    }
}
