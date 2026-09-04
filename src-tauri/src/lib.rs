// The desktop shell is intentionally thin (spec §250): it hosts the same web
// app that runs in the browser. All editing, storage and on-device AI happen
// in the web layer. Nothing here reaches the network.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running the AI Video Editor desktop shell");
}
