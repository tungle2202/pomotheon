pub mod db;
pub mod models;

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

use db::Database;
use models::{
    AppStateSummary, CreatePersonInput, LedgerEntry, Person, Settings, UpdatePersonInput,
};

pub struct AppState {
    pub db: Mutex<Database>,
}

#[tauri::command]
fn get_app_summary(state: State<'_, AppState>) -> Result<AppStateSummary, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    Ok(db.get_app_summary())
}

#[tauri::command]
fn get_persons(state: State<'_, AppState>) -> Result<Vec<Person>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    Ok(db.data.persons.clone())
}

#[tauri::command]
fn create_person(
    input: CreatePersonInput,
    state: State<'_, AppState>,
) -> Result<Person, String> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_person(input)
}

#[tauri::command]
fn update_person(
    input: UpdatePersonInput,
    state: State<'_, AppState>,
) -> Result<Person, String> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_person(input)
}

#[tauri::command]
fn delete_person(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_person(&id)
}

#[tauri::command]
fn pay_respect(person_id: String, state: State<'_, AppState>) -> Result<(u32, i64), String> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    db.pay_respect(&person_id)
}

#[tauri::command]
fn earn_focus_points(
    completed_minutes: u32,
    state: State<'_, AppState>,
) -> Result<(u32, i64), String> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    db.earn_focus_points(completed_minutes)
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    Ok(db.data.settings.clone())
}

#[tauri::command]
fn update_settings(
    settings: Settings,
    state: State<'_, AppState>,
) -> Result<Settings, String> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_settings(settings)
}

#[tauri::command]
fn get_ledger(state: State<'_, AppState>) -> Result<Vec<LedgerEntry>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    Ok(db.data.ledger.clone())
}

#[tauri::command]
fn get_image_data(relative_path: String, state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_image_base64(&relative_path)
}

#[tauri::command]
fn get_person_detail(id: String, state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_person_detail(&id)
}

pub fn resolve_data_directory() -> PathBuf {
    if let Some(data_dir) = dirs::data_dir() {
        data_dir.join("pomotheon")
    } else {
        PathBuf::from(".pomotheon_data")
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_dir = resolve_data_directory();
    let database = Database::init(app_dir).expect("Failed to initialize database");
    let app_state = AppState {
        db: Mutex::new(database),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_app_summary,
            get_persons,
            create_person,
            update_person,
            delete_person,
            pay_respect,
            earn_focus_points,
            get_settings,
            update_settings,
            get_ledger,
            get_image_data,
            get_person_detail
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
