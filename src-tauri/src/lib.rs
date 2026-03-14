// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri_plugin_sql::{Migration, MigrationKind};
use tauri::WindowEvent;

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
        },
        Migration {
            version: 4,
            description: "last_rating",
            sql: include_str!("../migrations/004_last_rating.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "facet_architecture",
            sql: include_str!("../migrations/005_facets.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "assignment_activation",
            sql: include_str!("../migrations/006_assignment_activation.sql"),
            kind: MigrationKind::Up,
        }
    ];

    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:study.db", migrations)
                .build()
        )
        .invoke_handler(tauri::generate_handler![greet])
        // macOS: red X hides the window instead of quitting (standard Apple behavior)
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                #[cfg(target_os = "macos")]
                {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
