use serde_json::Value;

use super::model::{AgentStatus, ReasoningEffort, TrackedSession};

#[derive(Debug, Default)]
pub struct ParseOutcome {
    pub token_delta: u64,
}

pub fn apply_record(record: &Value, session: &mut TrackedSession, backfill: bool) -> ParseOutcome {
    let mut outcome = ParseOutcome::default();
    let record_type = record.get("type").and_then(Value::as_str).unwrap_or_default();
    let payload = record.get("payload").unwrap_or(&Value::Null);

    if record_type == "session_meta" {
        apply_session_meta(payload, session);
        return outcome;
    }

    if record_type == "turn_context" {
        if let Some(summary) = payload.get("summary").and_then(Value::as_str) {
            let trimmed = summary.trim();
            if !trimmed.is_empty() && trimmed != "none" && trimmed != "auto" {
                session.title = Some(trimmed.chars().take(80).collect());
            }
        }
        if let Some(effort) = find_effort(payload) {
            session.effort = effort;
        }
        return outcome;
    }

    if let Some(effort) = find_effort(payload) {
        session.effort = effort;
    }

    let subtype = payload.get("type").and_then(Value::as_str).unwrap_or_default();
    match (record_type, subtype) {
        ("event_msg", "task_started") => {
            session.active = true;
            session.status = AgentStatus::Thinking;
            session.tool = None;
            session.total_tokens = 0;
            session.generated_tokens = 0;
        }
        ("event_msg", "task_complete") => {
            session.active = false;
            session.status = AgentStatus::Completed;
            session.tool = None;
        }
        ("event_msg", "turn_aborted") => {
            session.active = false;
            session.status = AgentStatus::Idle;
            session.tool = None;
        }
        ("event_msg", "context_compacted") => {
            session.status = AgentStatus::Compacting;
        }
        ("event_msg", "token_count") => {
            let next_total = extract_total_tokens(payload).unwrap_or(session.total_tokens);
            let generated = extract_generated_tokens(payload);
            if !backfill && next_total != session.total_tokens {
                outcome.token_delta = generated
                    .filter(|value| *value > 0)
                    .unwrap_or_else(|| next_total.saturating_sub(session.total_tokens));
            }
            session.total_tokens = next_total;
            if let Some(generated) = generated {
                session.generated_tokens = generated;
            }
        }
        ("event_msg", "exec_command_begin") | ("event_msg", "exec_command_end") => {
            session.active = true;
            session.status = AgentStatus::Working;
            session.tool = Some("shell".to_string());
        }
        ("event_msg", "patch_apply_begin") | ("event_msg", "patch_apply_end") => {
            session.active = true;
            session.status = AgentStatus::Working;
            session.tool = Some("apply_patch".to_string());
        }
        ("event_msg", "guardian_assessment") => {
            session.active = true;
            session.status = AgentStatus::Working;
            session.tool = Some("approval_review".to_string());
        }
        ("response_item", "function_call") | ("response_item", "custom_tool_call") => {
            session.active = true;
            session.status = AgentStatus::Working;
            session.tool = extract_tool_name(payload).or_else(|| Some("tool".to_string()));
        }
        ("response_item", "web_search_call") => {
            session.active = true;
            session.status = AgentStatus::Working;
            session.tool = Some("web_search".to_string());
        }
        ("response_item", "reasoning") => {
            session.active = true;
            session.status = AgentStatus::Thinking;
        }
        ("event_msg", "agent_message") | ("event_msg", "user_message") => {
            if subtype == "user_message" {
                session.active = true;
                session.status = AgentStatus::Thinking;
            }
        }
        _ => {}
    }

    session.updated_at = std::time::SystemTime::now();
    outcome
}

fn apply_session_meta(payload: &Value, session: &mut TrackedSession) {
    if let Some(id) = payload
        .get("id")
        .or_else(|| payload.get("session_id"))
        .and_then(Value::as_str)
    {
        session.session_id = id.to_string();
    }
    session.originator = payload
        .get("originator")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| session.originator.clone());
}

fn extract_total_tokens(payload: &Value) -> Option<u64> {
    payload
        .pointer("/info/last_token_usage/total_tokens")
        .and_then(Value::as_u64)
        .or_else(|| payload.get("total_tokens").and_then(Value::as_u64))
        .or_else(|| payload.get("tokens_used").and_then(Value::as_u64))
        .or_else(|| payload.get("context_tokens").and_then(Value::as_u64))
}

fn extract_generated_tokens(payload: &Value) -> Option<u64> {
    let usage = payload.pointer("/info/last_token_usage").unwrap_or(payload);
    let output = usage.get("output_tokens").and_then(Value::as_u64).unwrap_or(0);
    let reasoning = usage
        .get("reasoning_output_tokens")
        .or_else(|| usage.get("reasoning_tokens"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let generated = output.saturating_add(reasoning);
    (generated > 0).then_some(generated)
}

fn extract_tool_name(payload: &Value) -> Option<String> {
    ["name", "tool_name", "command"]
        .iter()
        .find_map(|key| payload.get(*key).and_then(Value::as_str))
        .map(|value| value.chars().take(64).collect())
}

fn find_effort(value: &Value) -> Option<ReasoningEffort> {
    match value {
        Value::Object(map) => {
            for key in ["reasoning_effort", "effort", "model_reasoning_effort"] {
                if let Some(raw) = map.get(key).and_then(Value::as_str) {
                    if let Some(effort) = ReasoningEffort::parse(raw) {
                        return Some(effort);
                    }
                }
            }
            map.values().find_map(find_effort)
        }
        Value::Array(values) => values.iter().find_map(find_effort),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::path::PathBuf;

    fn session() -> TrackedSession {
        TrackedSession::new(PathBuf::from("rollout-test.jsonl"), 0, "test".to_string())
    }

    #[test]
    fn maps_turn_lifecycle_and_effort() {
        let mut tracked = session();
        apply_record(
            &json!({"type":"turn_context","payload":{"effort":"high","summary":"implement feature"}}),
            &mut tracked,
            false,
        );
        apply_record(
            &json!({"type":"event_msg","payload":{"type":"task_started"}}),
            &mut tracked,
            false,
        );
        assert!(tracked.active);
        assert_eq!(tracked.status, AgentStatus::Thinking);
        assert_eq!(tracked.effort, ReasoningEffort::High);
        assert_eq!(tracked.title.as_deref(), Some("implement feature"));

        apply_record(
            &json!({"type":"event_msg","payload":{"type":"task_complete"}}),
            &mut tracked,
            false,
        );
        assert!(!tracked.active);
        assert_eq!(tracked.status, AgentStatus::Completed);
    }

    #[test]
    fn emits_generated_token_delta_once_per_usage_update() {
        let mut tracked = session();
        apply_record(
            &json!({"type":"event_msg","payload":{"type":"task_started"}}),
            &mut tracked,
            false,
        );
        let record = json!({
            "type":"event_msg",
            "payload":{
                "type":"token_count",
                "info":{"last_token_usage":{
                    "total_tokens":1200,
                    "output_tokens":180,
                    "reasoning_output_tokens":320
                }}
            }
        });
        let first = apply_record(&record, &mut tracked, false);
        let duplicate = apply_record(&record, &mut tracked, false);
        assert_eq!(first.token_delta, 500);
        assert_eq!(duplicate.token_delta, 0);
    }
}
