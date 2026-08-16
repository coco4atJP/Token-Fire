import type { WorldState } from "../domain/world";
import type { StageLayoutMode } from "./stageLayout";

export interface WorldPatina {
  bentFence: number;
  incidentTags: number;
  fadedStamps: number;
  pipeScars: number;
  moss: number;
}

/** 回復の長期痕跡を、0を起点に80／240で0〜3個へ分ける。 */
export const readMossPatinaCount = (value: number): number => {
  const score = Math.max(0, Number.isFinite(value) ? value : 0);
  if (score <= 0) return 0;
  if (score < 80) return 1;
  if (score < 240) return 2;
  return 3;
};

const clampCount = (value: number, maximum: number): number =>
  Math.min(maximum, Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)));

export const deriveWorldPatina = (world: WorldState): WorldPatina => ({
  bentFence: clampCount(world.debt.forestWipeouts, 2),
  incidentTags: clampCount(world.discoveries["sunk-cost-error"]?.count ?? 0, 3),
  fadedStamps: clampCount(world.debt.greenwashCeremonies, 4),
  pipeScars: clampCount(world.growthLevel / 6, 3),
  moss: readMossPatinaCount(world.restorationScore),
});

export const limitWorldPatina = (patina: WorldPatina, mode: StageLayoutMode): WorldPatina => {
  const maximum = mode === "compact" ? 0 : mode === "diorama" ? 1 : Number.POSITIVE_INFINITY;
  return {
    bentFence: Math.min(maximum, patina.bentFence),
    incidentTags: Math.min(maximum, patina.incidentTags),
    fadedStamps: Math.min(maximum, patina.fadedStamps),
    pipeScars: Math.min(maximum, patina.pipeScars),
    moss: Math.min(maximum, patina.moss),
  };
};

export const readWorldPatina = (world: WorldState, mode: StageLayoutMode = "wide"): WorldPatina =>
  limitWorldPatina(deriveWorldPatina(world), mode);

export const worldPatinaSignature = (patina: WorldPatina): string =>
  `${patina.bentFence}:${patina.incidentTags}:${patina.fadedStamps}:${patina.pipeScars}:${patina.moss}`;
