import { createWorld, type Tree, type WorldState } from "../domain/world";

const STORAGE_KEY = "token-fire.world.v2";
const VERSION = 2;

interface PersistedWorld {
  version: number;
  savedAt: number;
  trees: Array<Pick<Tree, "id" | "stage" | "burn" | "regrow">>;
  water: number;
  heat: number;
  pollution: number;
  rain: number;
  tokenProduced: number;
  destructionScore: number;
  restorationScore: number;
  factoryTier: number;
  rngState: number;
  debt: WorldState["debt"];
}

export interface WorldPersistence {
  load(): WorldState;
  save(world: WorldState): void;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export class BrowserWorldPersistence implements WorldPersistence {
  load(): WorldState {
    const world = createWorld();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return world;
      const persisted = JSON.parse(raw) as PersistedWorld;
      if (persisted.version !== VERSION || !Array.isArray(persisted.trees)) return world;

      const byId = new Map(persisted.trees.map((tree) => [tree.id, tree]));
      for (const tree of world.trees) {
        const saved = byId.get(tree.id);
        if (!saved) continue;
        tree.stage = saved.stage;
        tree.burn = clamp(saved.burn, 0, 1);
        tree.regrow = clamp(saved.regrow, 0, 1);
      }

      world.water = clamp(persisted.water, 0.04, 1);
      world.heat = clamp(persisted.heat, 0.02, 1);
      world.pollution = clamp(persisted.pollution, 0, 1);
      world.rain = clamp(persisted.rain, 0, 0.9);
      world.tokenProduced = Math.max(0, persisted.tokenProduced);
      world.destructionScore = Math.max(0, persisted.destructionScore);
      world.restorationScore = Math.max(0, persisted.restorationScore);
      world.factoryTier = clamp(Math.floor(persisted.factoryTier || 1), 1, 5);
      world.rngState = persisted.rngState >>> 0;
      world.debt = { ...world.debt, ...persisted.debt };

      this.applyOfflineRecovery(world, Date.now() - persisted.savedAt);
      return world;
    } catch {
      return world;
    }
  }

  save(world: WorldState): void {
    const persisted: PersistedWorld = {
      version: VERSION,
      savedAt: Date.now(),
      trees: world.trees.map(({ id, stage, burn, regrow }) => ({ id, stage, burn, regrow })),
      water: world.water,
      heat: world.heat,
      pollution: world.pollution,
      rain: world.rain,
      tokenProduced: world.tokenProduced,
      destructionScore: world.destructionScore,
      restorationScore: world.restorationScore,
      factoryTier: world.factoryTier,
      rngState: world.rngState,
      debt: world.debt,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // Persistence is additive. The live experience remains available without storage.
    }
  }

  private applyOfflineRecovery(world: WorldState, elapsedMs: number): void {
    const hours = clamp(elapsedMs / 3_600_000, 0, 12);
    if (hours <= 0) return;
    world.heat = Math.max(0.02, world.heat - hours * 0.14);
    world.pollution = Math.max(0, world.pollution - hours * 0.08);
    world.water = Math.min(1, world.water + hours * 0.055);
    world.rain = Math.min(0.8, world.rain + hours * 0.07);

    for (const tree of world.trees) {
      if (tree.stage === "burning") {
        tree.stage = "charred";
        tree.burn = 1;
      }
      if (tree.stage === "charred" && hours >= 2.5) {
        tree.stage = "sapling";
        tree.regrow = clamp((hours - 2.5) / 8, 0, 0.95);
      } else if (tree.stage === "sapling") {
        tree.regrow = clamp(tree.regrow + hours / 9, 0, 1);
        if (tree.regrow >= 1) {
          tree.stage = "grown";
          tree.regrow = 0;
        }
      }
    }
  }
}
