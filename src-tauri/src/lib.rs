mod codex;

use codex::{AgentSnapshot, CodexWatcher};
use serde::Serialize;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, State};

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

fn os_e2e_report_path() -> Result<PathBuf, String> {
    if !cfg!(debug_assertions) || std::env::var("TOKEN_FIRE_OS_E2E").as_deref() != Ok("1") {
        return Err("OS E2E reporting is disabled".to_string());
    }
    std::env::var_os("TOKEN_FIRE_OS_E2E_REPORT")
        .map(PathBuf::from)
        .ok_or_else(|| "TOKEN_FIRE_OS_E2E_REPORT is not set".to_string())
}

#[tauri::command]
fn write_os_e2e_report(report: String) -> Result<(), String> {
    if report.len() > 64 * 1024 || report.contains('\n') || report.contains('\r') {
        return Err("OS E2E report must be a single JSON line under 64 KiB".to_string());
    }
    serde_json::from_str::<serde_json::Value>(&report)
        .map_err(|error| format!("OS E2E report is not JSON: {error}"))?;
    let path = os_e2e_report_path()?;
    let mut output = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| format!("could not open {}: {error}", path.display()))?;
    writeln!(output, "{report}")
        .map_err(|error| format!("could not write {}: {error}", path.display()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OsE2EPlatformSnapshot {
    platform: &'static str,
    scale_factor: f64,
    inner_width: u32,
    inner_height: u32,
    visible: bool,
    focused: bool,
}

#[tauri::command]
fn os_e2e_platform_snapshot(window: tauri::WebviewWindow) -> Result<OsE2EPlatformSnapshot, String> {
    os_e2e_report_path()?;
    let size = window.inner_size().map_err(|error| error.to_string())?;
    Ok(OsE2EPlatformSnapshot {
        platform: std::env::consts::OS,
        scale_factor: window.scale_factor().map_err(|error| error.to_string())?,
        inner_width: size.width,
        inner_height: size.height,
        visible: window.is_visible().map_err(|error| error.to_string())?,
        focused: window.is_focused().map_err(|error| error.to_string())?,
    })
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn hide_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(MonitorState {
            watcher: Mutex::new(CodexWatcher::new()),
        })
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Token-Fireを表示", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "隠す", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &quit])?;

            let mut tray = TrayIconBuilder::new()
                .tooltip("Token-Fire · キャラクターは可愛く、事業判断は非情")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "hide" => hide_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            poll_codex,
            write_os_e2e_report,
            os_e2e_platform_snapshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running Token-Fire");
}
