// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri_plugin_sql::{Migration, MigrationKind};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Study.", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "v2_full_schema",
            sql: include_str!("../migrations/001_v2_schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "skill_extraction_v2",
            sql: include_str!("../migrations/002_skill_extraction_v2.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "assignment_tables",
            sql: include_str!("../migrations/003_assignments.sql"),
            kind: MigrationKind::Up,
        }
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:study.db", migrations)
                .build()
        )
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
