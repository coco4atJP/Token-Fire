import type { AgentSnapshot } from "../domain/agent";
import type { WorldState } from "../domain/world";

/**
 * Application層から描画技術を隠す出力境界。
 * PixiJSやDOMのライフサイクルはpresentation実装側で完結させる。
 */
export interface WorldRenderer {
  render(world: WorldState, snapshot: AgentSnapshot): void;
  dispose(): void;
}
