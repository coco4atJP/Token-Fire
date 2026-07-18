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
    const cycle = elapsed % 34;
    const active = cycle < 24;
    let status: AgentSnapshot["status"] = "idle";
    let effort: ReasoningEffort = "medium";
    let tool: string | null = null;
    let activeSessions = 0;
    let tokenDelta = 0;

    if (active) {
      activeSessions = cycle > 13 ? 3 : cycle > 8 ? 2 : 1;
      effort = cycle > 17 ? "xhigh" : cycle > 10 ? "high" : cycle > 4 ? "medium" : "low";
      status = cycle < 4 ? "thinking" : "working";
      tool = cycle > 16 ? "spawn_agent" : cycle > 11 ? "apply_patch" : cycle > 6 ? "shell" : null;
      tokenDelta = Math.round(30 + activeSessions * 24 + (effort === "xhigh" ? 80 : effort === "high" ? 40 : 0));
      this.totalTokens += tokenDelta;
    } else if (cycle < 27) {
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
      updatedAtMs: Date.now(),
      source: "demo",
    };
  }
}
