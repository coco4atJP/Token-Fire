import type { AgentSnapshot } from "./agent";
import type { WorldState } from "./world";

/**
 * 破壊・式典・回復の意味を表現層ごとに再判定させないための舞台状態契約。
 * Renderer、DOM Overlay、Audioはこの値をそれぞれの媒体へ翻訳するだけにする。
 */
export type WorldScene = "poka" | "mera" | "gogo" | "kirari" | "zero-output" | "meguri";

export const WORLD_SCENE_LABELS: Record<WorldScene, string> = {
  poka: "POKA · IDLE",
  mera: "MERA · ACTIVE",
  gogo: "GOGO · OVERDRIVE",
  kirari: "KIRARI · COMPLETE",
  "zero-output": "ZERO OUTPUT · FULL EMISSIONS",
  meguri: "MEGURI · RECOVERY",
};

export const readWorldScene = (world: WorldState, snapshot: AgentSnapshot): WorldScene => {
  if (snapshot.status === "error" || world.activeEvent?.type === "sunk-cost-error") return "zero-output";
  if (snapshot.status === "completed" || world.activeEvent?.type === "greenwash-ceremony") return "kirari";
  if (snapshot.active) {
    if (world.energyLevel >= 17 || snapshot.activeSessions >= 3) return "gogo";
    return "mera";
  }
  if (world.debt.totalTokensBurned === 0 && world.debt.completedJobs === 0) return "poka";
  return "meguri";
};
