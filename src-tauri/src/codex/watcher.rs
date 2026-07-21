use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use super::model::{AgentSnapshot, AgentStatus, ReasoningEffort, TrackedSession};
use super::parser::apply_record;

const SCAN_INTERVAL: Duration = Duration::from_millis(1_500);
const ACTIVE_FILE_WINDOW: Duration = Duration::from_secs(10 * 60);
const SESSION_STALE_WINDOW: Duration = Duration::from_secs(45);
const COMPLETED_VISIBLE_WINDOW: Duration = Duration::from_secs(5);
const MAX_BACKFILL_BYTES: u64 = 1024 * 1024;
const MAX_LIVE_READ_BYTES: u64 = 4 * 1024 * 1024;
const MAX_TRACKED_FILES: usize = 64;

pub struct CodexWatcher {
    sessions_root: PathBuf,
    tracked: HashMap<PathBuf, TrackedSession>,
    last_scan: SystemTime,
    pending_token_delta: u64,
}

impl CodexWatcher {
    pub fn new() -> Self {
        let codex_home = std::env::var_os("CODEX_HOME")
            .map(PathBuf::from)
            .or_else(|| dirs::home_dir().map(|home| home.join(".codex")))
            .unwrap_or_else(|| PathBuf::from(".codex"));

        Self {
            sessions_root: codex_home.join("sessions"),
            tracked: HashMap::new(),
            last_scan: UNIX_EPOCH,
            pending_token_delta: 0,
        }
    }

    pub fn poll(&mut self) -> Result<AgentSnapshot, String> {
        let now = SystemTime::now();
        if now.duration_since(self.last_scan).unwrap_or_default() >= SCAN_INTERVAL {
            self.discover_recent_files(now)?;
            self.last_scan = now;
        }

        let paths: Vec<PathBuf> = self.tracked.keys().cloned().collect();
        for path in paths {
            if let Err(error) = self.poll_file(&path) {
                eprintln!("Token-Fire: failed to read {}: {error}", path.display());
            }
        }

        self.prune(now);
        Ok(self.snapshot(now))
    }

    fn discover_recent_files(&mut self, now: SystemTime) -> Result<(), String> {
        if !self.sessions_root.exists() {
            return Ok(());
        }

        let mut files = Vec::new();
        collect_rollout_files(&self.sessions_root, now, &mut files)
            .map_err(|error| format!("failed to scan Codex sessions: {error}"))?;
        files.sort_by_key(|(_, modified)| *modified);
        files.reverse();
        files.truncate(MAX_TRACKED_FILES);

        for (path, _) in files {
            if self.tracked.contains_key(&path) {
                continue;
            }
            if let Err(error) = self.attach_file(path.clone()) {
                eprintln!("Token-Fire: failed to attach {}: {error}", path.display());
            }
        }
        Ok(())
    }

    fn attach_file(&mut self, path: PathBuf) -> Result<(), String> {
        let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
        let size = metadata.len();
        let session_id = extract_session_id(&path);
        let mut session = TrackedSession::new(path.clone(), size, session_id);
        self.read_session_meta_prefix(&path, &mut session)?;
        self.backfill_tail(&path, size, &mut session)?;
        session.updated_at = metadata.modified().unwrap_or(UNIX_EPOCH);
        session.offset = size;
        self.tracked.insert(path, session);
        Ok(())
    }

    fn read_session_meta_prefix(&self, path: &Path, session: &mut TrackedSession) -> Result<(), String> {
        let mut file = File::open(path).map_err(|error| error.to_string())?;
        let mut buffer = vec![0_u8; 64 * 1024];
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        let text = String::from_utf8_lossy(&buffer[..read]);
        for line in text.lines().take(32) {
            let Ok(record) = serde_json::from_str::<Value>(line) else {
                continue;
            };
            if record.get("type").and_then(Value::as_str) == Some("session_meta") {
                apply_record(&record, session, true);
                break;
            }
        }
        Ok(())
    }

    fn backfill_tail(&self, path: &Path, size: u64, session: &mut TrackedSession) -> Result<(), String> {
        if size == 0 {
            return Ok(());
        }
        let start = size.saturating_sub(MAX_BACKFILL_BYTES);
        let mut file = File::open(path).map_err(|error| error.to_string())?;
        file.seek(SeekFrom::Start(start)).map_err(|error| error.to_string())?;
        let mut buffer = Vec::with_capacity((size - start) as usize);
        file.read_to_end(&mut buffer).map_err(|error| error.to_string())?;
        let text = String::from_utf8_lossy(&buffer);
        let mut lines = text.lines();
        if start > 0 {
            lines.next();
        }
        for line in lines {
            if let Ok(record) = serde_json::from_str::<Value>(line) {
                apply_record(&record, session, true);
            }
        }
        Ok(())
    }

    fn poll_file(&mut self, path: &Path) -> Result<(), String> {
        let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
        let size = metadata.len();
        let Some(session) = self.tracked.get_mut(path) else {
            return Ok(());
        };

        if size < session.offset {
            session.offset = 0;
            session.partial.clear();
        }
        if size == session.offset {
            return Ok(());
        }

        let available = size - session.offset;
        let read_len = available.min(MAX_LIVE_READ_BYTES);
        let mut file = File::open(path).map_err(|error| error.to_string())?;
        file.seek(SeekFrom::Start(session.offset)).map_err(|error| error.to_string())?;
        let mut buffer = vec![0_u8; read_len as usize];
        file.read_exact(&mut buffer).map_err(|error| error.to_string())?;
        session.offset += read_len;

        let mut text = std::mem::take(&mut session.partial);
        text.push_str(&String::from_utf8_lossy(&buffer));
        let ends_with_newline = text.ends_with('\n');
        let mut lines: Vec<&str> = text.split('\n').collect();
        if !ends_with_newline {
            session.partial = lines.pop().unwrap_or_default().to_string();
            if session.partial.len() > 256 * 1024 {
                session.partial.clear();
            }
        } else if lines.last().is_some_and(|line| line.is_empty()) {
            lines.pop();
        }

        for line in lines {
            if line.trim().is_empty() {
                continue;
            }
            let Ok(record) = serde_json::from_str::<Value>(line) else {
                continue;
            };
            let outcome = apply_record(&record, session, false);
            self.pending_token_delta = self.pending_token_delta.saturating_add(outcome.token_delta);
        }
        Ok(())
    }

    fn prune(&mut self, now: SystemTime) {
        let stale_paths: HashSet<PathBuf> = self
            .tracked
            .iter()
            .filter_map(|(path, session)| {
                let age = now.duration_since(session.updated_at).unwrap_or_default();
                (age > Duration::from_secs(ACTIVE_FILE_WINDOW.as_secs() * 6)).then(|| path.clone())
            })
            .collect();
        self.tracked.retain(|path, _| !stale_paths.contains(path));

        if self.tracked.len() > MAX_TRACKED_FILES {
            let mut by_age: Vec<(PathBuf, SystemTime)> = self
                .tracked
                .iter()
                .map(|(path, session)| (path.clone(), session.updated_at))
                .collect();
            by_age.sort_by_key(|(_, updated)| *updated);
            for (path, _) in by_age.into_iter().take(self.tracked.len() - MAX_TRACKED_FILES) {
                self.tracked.remove(&path);
            }
        }
    }

    fn snapshot(&mut self, now: SystemTime) -> AgentSnapshot {
        if self.tracked.is_empty() {
            return AgentSnapshot::default();
        }

        let mut active_sessions = 0_usize;
        let mut total_tokens = 0_u64;
        let mut chosen: Option<&TrackedSession> = None;
        let mut effort = ReasoningEffort::Medium;

        for session in self.tracked.values() {
            total_tokens = total_tokens.saturating_add(session.total_tokens);
            let age = now.duration_since(session.updated_at).unwrap_or_default();
            let is_active = session.active && age <= SESSION_STALE_WINDOW;
            if is_active {
                active_sessions += 1;
                effort = effort.max(session.effort);
            }

            let should_choose = match chosen {
                None => true,
                Some(current) => {
                    let current_age = now.duration_since(current.updated_at).unwrap_or_default();
                    let current_active = current.active && current_age <= SESSION_STALE_WINDOW;
                    (is_active && !current_active)
                        || (is_active == current_active
                            && (session.status.priority() > current.status.priority()
                                || (session.status == current.status && session.updated_at > current.updated_at)))
                }
            };
            if should_choose {
                chosen = Some(session);
            }
        }

        let chosen = chosen.expect("tracked sessions cannot be empty");
        let chosen_age = now.duration_since(chosen.updated_at).unwrap_or_default();
        let active = active_sessions > 0;
        let status = if active {
            chosen.status
        } else if chosen.status == AgentStatus::Completed && chosen_age <= COMPLETED_VISIBLE_WINDOW {
            AgentStatus::Completed
        } else {
            AgentStatus::Idle
        };

        let project_path = chosen.project_path.clone();
        let project_key = project_path.clone().unwrap_or_else(|| chosen.session_id.clone());
        let project_label = project_path
            .as_deref()
            .and_then(|value| Path::new(value).file_name())
            .and_then(|value| value.to_str())
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("Codex Session")
            .to_string();
        let token_delta = std::mem::take(&mut self.pending_token_delta);

        AgentSnapshot {
            active,
            status,
            active_sessions,
            total_tokens,
            token_delta,
            effort: if active { effort } else { chosen.effort },
            tool: chosen.tool.clone(),
            session_title: chosen.title.clone(),
            session_id: Some(chosen.session_id.clone()),
            project_key,
            project_label,
            project_path,
            model: chosen.model.clone(),
            updated_at_ms: millis_since_epoch(chosen.updated_at),
            source: "codex-jsonl".to_string(),
        }
    }
}

fn collect_rollout_files(directory: &Path, now: SystemTime, output: &mut Vec<(PathBuf, SystemTime)>) -> std::io::Result<()> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            collect_rollout_files(&path, now, output)?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if !name.starts_with("rollout-") || !name.ends_with(".jsonl") {
            continue;
        }
        let metadata = entry.metadata()?;
        let modified = metadata.modified().unwrap_or(UNIX_EPOCH);
        if now.duration_since(modified).unwrap_or_default() <= ACTIVE_FILE_WINDOW {
            output.push((path, modified));
        }
    }
    Ok(())
}

fn extract_session_id(path: &Path) -> String {
    let name = path.file_stem().and_then(|name| name.to_str()).unwrap_or("unknown");
    let parts: Vec<&str> = name.split('-').collect();
    if parts.len() >= 5 {
        parts[parts.len() - 5..].join("-")
    } else {
        name.to_string()
    }
}

fn millis_since_epoch(time: SystemTime) -> u64 {
    time.duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64
}
