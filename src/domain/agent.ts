export type AgentStatus =
  | "idle"
  | "thinking"
  | "working"
  | "compacting"
  | "completed"
  | "error";

export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

export interface AgentSnapshot {
  active: boolean;
  status: AgentStatus;
  activeSessions: number;
  totalTokens: number;
  tokenDelta: number;
  effort: ReasoningEffort;
  tool: string | null;
  sessionTitle: string | null;
  updatedAtMs: number;
  source: string;
}

export const IDLE_SNAPSHOT: AgentSnapshot = {
  active: false,
  status: "idle",
  activeSessions: 0,
  totalTokens: 0,
  tokenDelta: 0,
  effort: "medium",
  tool: null,
  sessionTitle: null,
  updatedAtMs: 0,
  source: "waiting-for-codex",
};

export const effortMultiplier = (effort: ReasoningEffort): number => {
  switch (effort) {
    case "minimal":
      return 0.55;
    case "low":
      return 0.8;
    case "medium":
      return 1;
    case "high":
      return 1.45;
    case "xhigh":
      return 2.05;
  }
};
