import type { AgentSnapshot, ReasoningEffort } from "../domain/agent";
import type { AgentSource } from "./codexClient";

export class DemoAgentSource implements AgentSource {
  private startedAt = Date.now();
  private totalTokens = 0;

  restart(): void {
    this.startedAt = Date.now();
    this.totalTokens = 0;
  }

  async poll(): Promise<AgentSnapshot> {
    const elapsed = (Date.now() - this.startedAt) / 1000;
    const cycle = elapsed % 38;
    const active = cycle < 27;
    let status: AgentSnapshot["status"] = "idle";
    let effort: ReasoningEffort = "medium";
    let tool: string | null = null;
    let activeSessions = 0;
    let tokenDelta = 0;

    if (active) {
      activeSessions = cycle > 15 ? 3 : cycle > 9 ? 2 : 1;
      effort = cycle > 20 ? "xhigh" : cycle > 12 ? "high" : cycle > 4 ? "medium" : "low";
      status = cycle < 4 ? "thinking" : "working";
      tool = cycle > 23 ? "approval_review" : cycle > 17 ? "spawn_agent" : cycle > 12 ? "apply_patch" : cycle > 6 ? "shell" : null;
      tokenDelta = Math.round(30 + activeSessions * 24 + (effort === "xhigh" ? 80 : effort === "high" ? 40 : 0));
      this.totalTokens += tokenDelta;
    } else if (cycle < 31) {
      status = "completed";
    }

    return {
      active,
      status,
      activeSessions,
      totalTokens: this.totalTokens,
      tokenDelta,
      effort,
      tool,
      sessionTitle: "Token-Fire demo",
      sessionId: "token-fire-demo-session",
      projectKey: "demo-token-fire",
      projectLabel: "Demo Factory",
      projectPath: null,
      model: cycle > 20 ? "gpt-5.6-codex" : "gpt-5-mini",
      updatedAtMs: Date.now(),
      source: "demo",
    };
  }
}
