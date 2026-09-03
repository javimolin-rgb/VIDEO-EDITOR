// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// The desktop shell is intentionally thin (spec §250): it hosts the same
/// web app that runs in the browser. All editing, storage and on-device AI
/// happen in the web layer; nothing here talks to a network.
fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running the AI Video Editor desktop shell");
}
