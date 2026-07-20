import { createWorld, type Tree, type WorldState } from "../domain/world";
import type { CharacterId } from "../domain/character";
import type { EnvironmentContext, EventDiscovery, HistoricalMoment, ReplaySession } from "../domain/experienceData";

const STORAGE_KEY = "token-fire.worlds.v3";
const LEGACY_KEY = "token-fire.world.v2";
const VERSION = 3;

export interface ProjectMeta {
  key: string;
  label: string;
  path: string | null;
  model: string | null;
}

export interface ProjectSummary {
  key: string;
  label: string;
  path: string | null;
  model: string | null;
  savedAt: number;
  totalTokens: number;
  growthLevel: number;
  historyCount: number;
  replayCount: number;
}

interface PersistedWorld {
  savedAt: number;
  projectKey: string;
  projectLabel: string;
  projectPath: string | null;
  model: string | null;
  trees: Array<Pick<Tree, "id" | "stage" | "burn" | "regrow">>;
  water: number;
  heat: number;
  pollution: number;
  rain: number;
  tokenProduced: number;
  destructionScore: number;
  restorationScore: number;
  growthLevel: number;
  energyLevel: number;
  rngState: number;
  debt: WorldState["debt"];
  characters: Partial<Record<CharacterId, Pick<WorldState["characters"][CharacterId], "act" | "mood" | "interactions">>>;
  environment: EnvironmentContext;
  history: HistoricalMoment[];
  discoveries: Record<string, EventDiscovery>;
  replays: ReplaySession[];
}

interface PersistedDatabase {
  version: number;
  projects: Record<string, PersistedWorld>;
}

export interface WorldPersistence {
  loadProject(meta: ProjectMeta): WorldState;
  save(world: WorldState): void;
  listProjects(): ProjectSummary[];
  exportDatabase(): string;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export class BrowserWorldPersistence implements WorldPersistence {
  private database: PersistedDatabase;

  constructor() {
    this.database = this.readDatabase();
  }

  loadProject(meta: ProjectMeta): WorldState {
    const world = createWorld({ projectKey: meta.key, projectLabel: meta.label, projectPath: meta.path, model: meta.model });
    const persisted = this.database.projects[meta.key];
    if (!persisted) return world;

    const byId = new Map(persisted.trees.map((tree) => [tree.id, tree]));
    for (const tree of world.trees) {
      const saved = byId.get(tree.id);
      if (!saved) continue;
      tree.stage = saved.stage;
      tree.burn = clamp(saved.burn, 0, 1);
      tree.regrow = clamp(saved.regrow, 0, 1);
    }

    world.projectLabel = meta.label || persisted.projectLabel;
    world.projectPath = meta.path ?? persisted.projectPath;
    world.model = meta.model ?? persisted.model;
    world.water = clamp(persisted.water, 0.04, 1);
    world.heat = clamp(persisted.heat, 0.02, 1);
    world.pollution = clamp(persisted.pollution, 0, 1);
    world.rain = clamp(persisted.rain, 0, 0.9);
    world.tokenProduced = Math.max(0, persisted.tokenProduced);
    world.destructionScore = Math.max(0, persisted.destructionScore);
    world.restorationScore = Math.max(0, persisted.restorationScore);
    world.growthLevel = clamp(Math.floor(persisted.growthLevel || 0), 0, 23);
    world.factoryTier = Math.min(5, 1 + Math.floor(world.growthLevel / 6));
    world.energyLevel = clamp(persisted.energyLevel || 0, 0, 23);
    world.rngState = persisted.rngState >>> 0;
    world.debt = { ...world.debt, ...persisted.debt };
    world.environment = { ...world.environment, ...persisted.environment };
    world.history = Array.isArray(persisted.history) ? persisted.history.slice(0, 160) : [];
    world.discoveries = persisted.discoveries && typeof persisted.discoveries === "object" ? persisted.discoveries : {};
    world.replays = Array.isArray(persisted.replays) ? persisted.replays.slice(0, 24) : [];
    for (const [id, state] of Object.entries(persisted.characters ?? {})) {
      const character = world.characters[id as CharacterId];
      if (!character || !state) continue;
      character.act = state.act ?? character.act;
      character.mood = state.mood ?? character.mood;
      character.interactions = Math.max(0, state.interactions ?? 0);
    }

    this.applyOfflineRecovery(world, Date.now() - persisted.savedAt);
    return world;
  }

  save(world: WorldState): void {
    this.database.projects[world.projectKey] = serializeWorld(world);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.database));
    } catch {
      // Live simulation remains usable if storage is unavailable or full.
    }
  }

  listProjects(): ProjectSummary[] {
    return Object.values(this.database.projects)
      .map((project) => ({
        key: project.projectKey,
        label: project.projectLabel,
        path: project.projectPath,
        model: project.model,
        savedAt: project.savedAt,
        totalTokens: Math.floor(project.debt?.totalTokensBurned ?? 0),
        growthLevel: Math.floor(project.growthLevel ?? 0),
        historyCount: project.history?.length ?? 0,
        replayCount: project.replays?.length ?? 0,
      }))
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  exportDatabase(): string {
    return JSON.stringify(this.database, null, 2);
  }

  private readDatabase(): PersistedDatabase {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedDatabase;
        if (parsed.version === VERSION && parsed.projects && typeof parsed.projects === "object") return parsed;
      }
    } catch {
      // Fall through to migration/new database.
    }

    const database: PersistedDatabase = { version: VERSION, projects: {} };
    try {
      const legacyRaw = localStorage.getItem(LEGACY_KEY);
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw) as Record<string, unknown>;
        const legacyWorld = createWorld({ projectKey: "legacy", projectLabel: "Legacy Factory" });
        Object.assign(legacyWorld, {
          water: Number(legacy.water) || legacyWorld.water,
          heat: Number(legacy.heat) || legacyWorld.heat,
          pollution: Number(legacy.pollution) || legacyWorld.pollution,
          rain: Number(legacy.rain) || legacyWorld.rain,
          tokenProduced: Number(legacy.tokenProduced) || 0,
          destructionScore: Number(legacy.destructionScore) || 0,
          restorationScore: Number(legacy.restorationScore) || 0,
          debt: { ...legacyWorld.debt, ...(legacy.debt as object ?? {}) },
        });
        if (Array.isArray(legacy.trees)) {
          const byId = new Map((legacy.trees as Tree[]).map((tree) => [tree.id, tree]));
          for (const tree of legacyWorld.trees) Object.assign(tree, byId.get(tree.id) ?? {});
        }
        database.projects.legacy = serializeWorld(legacyWorld);
      }
    } catch {
      // A malformed legacy save is ignored.
    }
    return database;
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

const serializeWorld = (world: WorldState): PersistedWorld => ({
  savedAt: Date.now(),
  projectKey: world.projectKey,
  projectLabel: world.projectLabel,
  projectPath: world.projectPath,
  model: world.model,
  trees: world.trees.map(({ id, stage, burn, regrow }) => ({ id, stage, burn, regrow })),
  water: world.water,
  heat: world.heat,
  pollution: world.pollution,
  rain: world.rain,
  tokenProduced: world.tokenProduced,
  destructionScore: world.destructionScore,
  restorationScore: world.restorationScore,
  growthLevel: world.growthLevel,
  energyLevel: world.energyLevel,
  rngState: world.rngState,
  debt: world.debt,
  characters: Object.fromEntries(Object.entries(world.characters).map(([id, state]) => [id, { act: state.act, mood: state.mood, interactions: state.interactions }])),
  environment: world.environment,
  history: world.history.slice(0, 160),
  discoveries: world.discoveries,
  replays: world.replays.slice(0, 24),
});
