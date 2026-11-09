//! Tauri-Backend der DnD-Battlemap.
//!
//! Stellt lokale Datei-I/O (Projektdateien, Autosave) und Datei-Dialoge bereit.
//! Netzwerkfähige Plugins (http, updater, shell/opener) werden nicht verwendet.

mod files;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            files::read_file,
            files::write_file,
            files::autosave_write,
            files::autosave_read,
            files::autosave_clear,
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten der Anwendung");
}
