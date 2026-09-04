use tauri_plugin_sql::{Migration, MigrationKind};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

struct CliChildren(Mutex<HashMap<String, Child>>);

#[derive(Serialize, Clone)]
struct CliProbeResult {
    status: String,
    message: String,
    version: Option<String>,
    auth_method: Option<String>,
    subscription_type: Option<String>,
    logged_in: bool,
}

#[derive(Serialize, Clone)]
struct CliStreamEvent {
    request_id: String,
    line: String,
}

#[derive(Serialize, Clone)]
struct CliStreamEnd {
    request_id: String,
    exit_code: Option<i32>,
}

#[derive(Serialize, Clone)]
struct CliStreamError {
    request_id: String,
    error: String,
}

// Diagnostic 583: remove env vars that would override CLI subscription auth
fn cli_env(cmd: &mut Command) {
    cmd.env_remove("ANTHROPIC_API_KEY");
    cmd.env_remove("ANTHROPIC_AUTH_TOKEN");
    cmd.env_remove("ANTHROPIC_BASE_URL");
}

fn cli_invoke_args(cmd: &mut Command, system: &str, model: &str, streaming: bool) {
    cmd.args(["-p", "--system-prompt", system, "--tools", "",
              "--no-session-persistence", "--model", model]);
    if streaming {
        cmd.args(["--output-format", "stream-json",
                   "--include-partial-messages", "--verbose"]);
    } else {
        cmd.args(["--output-format", "json"]);
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Study.", name)
}

#[tauri::command]
fn claude_cli_discover() -> Option<String> {
    use std::os::unix::fs::PermissionsExt;

    let mut candidates = vec![
        "/opt/homebrew/bin/claude".to_string(),
        "/usr/local/bin/claude".to_string(),
    ];
    if let Ok(home) = std::env::var("HOME") {
        candidates.push(format!("{}/.claude/local/claude", home));
    }

    for path in &candidates {
        let p = std::path::Path::new(path);
        if let Ok(meta) = p.metadata() {
            if meta.permissions().mode() & 0o111 != 0 {
                return Some(path.clone());
            }
        }
    }
    None
}

#[tauri::command]
fn claude_cli_probe(path: String) -> CliProbeResult {
    let version_result = {
        let mut cmd = Command::new(&path);
        cli_env(&mut cmd);
        cmd.arg("--version");
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        cmd.output()
    };

    let version = match version_result {
        Ok(output) => {
            let v = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if v.is_empty() {
                String::from_utf8_lossy(&output.stderr).trim().to_string()
            } else {
                v
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return CliProbeResult {
                status: "not_found".into(),
                message: format!("Claude CLI not found at {}", path),
                version: None,
                auth_method: None,
                subscription_type: None,
                logged_in: false,
            };
        }
        Err(e) => {
            return CliProbeResult {
                status: "error".into(),
                message: format!("Failed to run claude --version: {}", e),
                version: None,
                auth_method: None,
                subscription_type: None,
                logged_in: false,
            };
        }
    };

    let auth_result = {
        let mut cmd = Command::new(&path);
        cli_env(&mut cmd);
        cmd.args(["auth", "status"]);
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        cmd.output()
    };

    match auth_result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(stdout.trim()) {
                // CLI emits `loggedIn`; accept legacy `authenticated` as a fallback.
                let logged_in = json.get("loggedIn")
                    .or_else(|| json.get("authenticated"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let auth_method = json.get("authMethod")
                    .and_then(|v| v.as_str())
                    .map(String::from);
                let sub_type = json.get("subscriptionType")
                    .and_then(|v| v.as_str())
                    .map(String::from);

                if logged_in {
                    CliProbeResult {
                        status: "ok".into(),
                        message: "Claude CLI is authenticated and ready".into(),
                        version: Some(version),
                        auth_method,
                        subscription_type: sub_type,
                        logged_in: true,
                    }
                } else {
                    CliProbeResult {
                        status: "not_logged_in".into(),
                        message: "Claude CLI is installed but not logged in. Run `claude auth login` in a terminal.".into(),
                        version: Some(version),
                        auth_method,
                        subscription_type: sub_type,
                        logged_in: false,
                    }
                }
            } else {
                let raw = stdout.trim().to_string();
                let logged_in = (raw.contains("loggedIn") || raw.contains("authenticated"))
                    && !raw.contains("not authenticated")
                    && !raw.contains("\"loggedIn\": false")
                    && !raw.contains("\"loggedIn\":false");
                CliProbeResult {
                    status: if logged_in { "ok" } else { "not_logged_in" }.into(),
                    message: raw,
                    version: Some(version),
                    auth_method: None,
                    subscription_type: None,
                    logged_in,
                }
            }
        }
        Err(e) => {
            CliProbeResult {
                status: "error".into(),
                message: format!("Failed to check auth status: {}", e),
                version: Some(version),
                auth_method: None,
                subscription_type: None,
                logged_in: false,
            }
        }
    }
}

#[tauri::command]
fn claude_cli_invoke(
    path: String,
    system: String,
    prompt: String,
    model: String,
) -> Result<String, String> {
    let mut cmd = Command::new(&path);
    cli_env(&mut cmd);
    cli_invoke_args(&mut cmd, &system, &model, false);
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            format!("Claude CLI not found at {}", path)
        } else {
            format!("Failed to spawn Claude CLI: {}", e)
        }
    })?;

    let mut stdin_handle = child.stdin.take()
        .ok_or_else(|| "Failed to open stdin".to_string())?;
    let stdin_thread = std::thread::spawn(move || {
        let _ = stdin_handle.write_all(prompt.as_bytes());
    });

    let output = child.wait_with_output()
        .map_err(|e| format!("Failed to wait for Claude CLI: {}", e))?;
    let _ = stdin_thread.join();

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if !stdout.is_empty() {
        Ok(stdout)
    } else if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let truncated = if stderr.len() > 2000 { &stderr[..2000] } else { &stderr };
        Err(format!("Claude CLI exited with {}: {}", output.status, truncated))
    } else {
        Ok(stdout)
    }
}

#[tauri::command]
fn claude_cli_stream(
    app: AppHandle,
    children: tauri::State<'_, CliChildren>,
    path: String,
    system: String,
    prompt: String,
    model: String,
    request_id: String,
) -> Result<(), String> {
    let mut cmd = Command::new(&path);
    cli_env(&mut cmd);
    cli_invoke_args(&mut cmd, &system, &model, true);
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| {
        let error_msg = if e.kind() == std::io::ErrorKind::NotFound {
            format!("Claude CLI not found at {}", path)
        } else {
            format!("Failed to spawn Claude CLI: {}", e)
        };
        let _ = app.emit("claude-cli-error", CliStreamError {
            request_id: request_id.clone(),
            error: error_msg.clone(),
        });
        error_msg
    })?;

    let mut stdin_handle = child.stdin.take()
        .ok_or_else(|| "Failed to open stdin".to_string())?;
    let stdout_handle = child.stdout.take()
        .ok_or_else(|| "Failed to open stdout".to_string())?;

    children.0.lock().unwrap().insert(request_id.clone(), child);

    std::thread::spawn(move || {
        let _ = stdin_handle.write_all(prompt.as_bytes());
    });

    let rid = request_id.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout_handle);
        for line in reader.lines() {
            match line {
                Ok(l) if !l.is_empty() => {
                    let _ = app.emit("claude-cli-stream", CliStreamEvent {
                        request_id: rid.clone(),
                        line: l,
                    });
                }
                Err(_) => break,
                _ => {}
            }
        }

        let exit_code = {
            let state = app.state::<CliChildren>();
            let mut map = state.0.lock().unwrap();
            if let Some(mut child) = map.remove(&rid) {
                child.wait().ok().and_then(|s| s.code())
            } else {
                None
            }
        };

        let _ = app.emit("claude-cli-stream-end", CliStreamEnd {
            request_id: rid,
            exit_code,
        });
    });

    Ok(())
}

#[tauri::command]
fn claude_cli_cancel(
    children: tauri::State<'_, CliChildren>,
    request_id: String,
) -> Result<(), String> {
    let mut map = children.0.lock().unwrap();
    if let Some(child) = map.get_mut(&request_id) {
        let _ = child.kill();
    }
    Ok(())
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
        },
        Migration {
            version: 7,
            description: "material_images",
            sql: include_str!("../migrations/007_material_images.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "skill_courses",
            sql: include_str!("../migrations/008_skill_courses.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "chunk_relationships",
            sql: include_str!("../migrations/009_chunk_relationships.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "session_exchanges",
            sql: include_str!("../migrations/010_session_exchanges.sql"),
            kind: MigrationKind::Up,
        }
    ];

    tauri::Builder::default()
        .manage(CliChildren(Mutex::new(HashMap::new())))
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
        .invoke_handler(tauri::generate_handler![
            greet,
            claude_cli_discover,
            claude_cli_probe,
            claude_cli_invoke,
            claude_cli_stream,
            claude_cli_cancel
        ])
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cli_env_removes_api_key() {
        let mut cmd = Command::new("/usr/bin/env");
        cli_env(&mut cmd);
        cmd.stdout(Stdio::piped());

        let output = cmd.output().expect("Failed to run /usr/bin/env");
        let stdout = String::from_utf8_lossy(&output.stdout);

        assert!(!stdout.contains("ANTHROPIC_API_KEY"),
            "ANTHROPIC_API_KEY should be removed from child environment");
        assert!(!stdout.contains("ANTHROPIC_AUTH_TOKEN"),
            "ANTHROPIC_AUTH_TOKEN should be removed from child environment");
        assert!(!stdout.contains("ANTHROPIC_BASE_URL"),
            "ANTHROPIC_BASE_URL should be removed from child environment");
    }
}
