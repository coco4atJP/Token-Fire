use serde::Serialize;
use std::path::PathBuf;
use std::time::SystemTime;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Idle,
    Thinking,
    Working,
    Compacting,
    Completed,
    Error,
}

impl AgentStatus {
    pub fn priority(self) -> u8 {
        match self {
            Self::Error => 6,
            Self::Working => 5,
            Self::Thinking => 4,
            Self::Compacting => 3,
            Self::Completed => 2,
            Self::Idle => 1,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ReasoningEffort {
    Minimal,
    Low,
    Medium,
    High,
    Xhigh,
}

impl ReasoningEffort {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "minimal" | "none" => Some(Self::Minimal),
            "low" => Some(Self::Low),
            "medium" | "auto" => Some(Self::Medium),
            "high" => Some(Self::High),
            "xhigh" | "extra_high" | "extra-high" => Some(Self::Xhigh),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentSnapshot {
    pub active: bool,
    pub status: AgentStatus,
    pub active_sessions: usize,
    pub total_tokens: u64,
    pub token_delta: u64,
    pub effort: ReasoningEffort,
    pub tool: Option<String>,
    pub session_title: Option<String>,
    pub session_id: Option<String>,
    pub project_key: String,
    pub project_label: String,
    pub project_path: Option<String>,
    pub model: Option<String>,
    pub updated_at_ms: u64,
    pub source: String,
}

impl Default for AgentSnapshot {
    fn default() -> Self {
        Self {
            active: false,
            status: AgentStatus::Idle,
            active_sessions: 0,
            total_tokens: 0,
            token_delta: 0,
            effort: ReasoningEffort::Medium,
            tool: None,
            session_title: None,
            session_id: None,
            project_key: "global".to_string(),
            project_label: "Global Factory".to_string(),
            project_path: None,
            model: None,
            updated_at_ms: 0,
            source: "waiting-for-codex".to_string(),
        }
    }
}

#[derive(Debug)]
pub struct TrackedSession {
    pub path: PathBuf,
    pub offset: u64,
    pub partial: String,
    pub session_id: String,
    pub title: Option<String>,
    pub originator: Option<String>,
    pub project_path: Option<String>,
    pub model: Option<String>,
    pub status: AgentStatus,
    pub active: bool,
    pub effort: ReasoningEffort,
    pub tool: Option<String>,
    pub total_tokens: u64,
    pub generated_tokens: u64,
    pub updated_at: SystemTime,
}

impl TrackedSession {
    pub fn new(path: PathBuf, offset: u64, session_id: String) -> Self {
        Self {
            path,
            offset,
            partial: String::new(),
            session_id,
            title: None,
            originator: None,
            project_path: None,
            model: None,
            status: AgentStatus::Idle,
            active: false,
            effort: ReasoningEffort::Medium,
            tool: None,
            total_tokens: 0,
            generated_tokens: 0,
            updated_at: SystemTime::now(),
        }
    }
}
