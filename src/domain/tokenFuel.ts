import type { WorldState } from "./world";

/**
 * Token accounting is logical state, not a render budget.
 * Keep the full practical JavaScript-safe amount and let WorldEvent/particle
 * backpressure limit only how much is presented at once.
 */
export const enqueueTokenFuel = (world: WorldState, tokenDelta: number): void => {
  if (!Number.isFinite(tokenDelta) || tokenDelta <= 0) return;
  world.tokenQueue = Math.min(Number.MAX_SAFE_INTEGER, world.tokenQueue + tokenDelta);
};
