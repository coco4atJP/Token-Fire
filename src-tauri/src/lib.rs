mod codex;

use codex::{AgentSnapshot, CodexWatcher};
use std::sync::Mutex;
use tauri::State;

struct MonitorState {
    watcher: Mutex<CodexWatcher>,
}

#[tauri::command]
fn poll_codex(state: State<'_, MonitorState>) -> Result<AgentSnapshot, String> {
    let mut watcher = state
        .watcher
        .lock()
        .map_err(|_| "Codex monitor lock was poisoned".to_string())?;
    watcher.poll()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(MonitorState {
            watcher: Mutex::new(CodexWatcher::new()),
        })
        .invoke_handler(tauri::generate_handler![poll_codex])
        .run(tauri::generate_context!())
        .expect("error while running Token-Fire");
}
