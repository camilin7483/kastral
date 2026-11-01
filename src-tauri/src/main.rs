#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
fn kastral_health() -> String {
    String::from(r#"{"status":"ok","engine":"tauri-spike"}"#)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![kastral_health])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
