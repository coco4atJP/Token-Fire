import { invoke } from "@tauri-apps/api/core";
import type { AgentSnapshot } from "../domain/agent";

interface RustSnapshot {
  active: boolean;
  status: AgentSnapshot["status"];
  active_sessions: number;
  total_tokens: number;
  token_delta: number;
  effort: AgentSnapshot["effort"];
  tool: string | null;
  session_title: string | null;
  updated_at_ms: number;
  source: string;
}

export interface AgentSource {
  poll(): Promise<AgentSnapshot>;
}

export class CodexJsonlSource implements AgentSource {
  async poll(): Promise<AgentSnapshot> {
    const snapshot = await invoke<RustSnapshot>("poll_codex");
    return {
      active: snapshot.active,
      status: snapshot.status,
      activeSessions: snapshot.active_sessions,
      totalTokens: snapshot.total_tokens,
      tokenDelta: snapshot.token_delta,
      effort: snapshot.effort,
      tool: snapshot.tool,
      sessionTitle: snapshot.session_title,
      updatedAtMs: snapshot.updated_at_ms,
      source: snapshot.source,
    };
  }
}
