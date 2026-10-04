import { createWorld, type Tree, type WorldState } from "../domain/world";
import type { CharacterId } from "../domain/character";
import type { EnvironmentContext, EventDiscovery, HistoricalMoment, ReplaySession } from "../domain/experienceData";

const STORAGE_KEY = "token-fire.worlds.v3";
const LEGACY_KEY = "token-fire.world.v2";
const VERSION = 3;
export const PROJECT_PREFIX = "token-fire.project.v3:";
export const MAX_PROJECT_BYTES = 4 * 1024 * 1024;

export interface ProjectStorage {
  read(): string[];
  write(key: string, data: string): void | Promise<void>;
}

const browserStorage: ProjectStorage = {
  read: () => Object.keys(localStorage).filter((key) => key.startsWith(PROJECT_PREFIX))
    .map((key) => localStorage.getItem(key)!).filter(Boolean),
  write: (key, data) => localStorage.setItem(PROJECT_PREFIX + encodeURIComponent(key), data),
};

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
  tokenQueue?: number;
  fuelProgress?: number;
  taskTokens?: number;
  destructionScore: number;
  restorationScore: number;
  growthLevel: number;
  energyLevel: number;
  rngState: number;
  debt: WorldState["debt"];
  characters: Record<string, Pick<WorldState["characters"][CharacterId], "act" | "mood" | "interactions"> | undefined>;
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
  flush?(): Promise<void>;
  listProjects(): ProjectSummary[];
  exportDatabase(): string;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const LEGACY_CHARACTER_IDS: Record<string, CharacterId> = {
  emberbeak: "hinoko",
  spriglet: "mebuki",
  drizzle: "fuwame",
  cinder: "sumi",
  vapo: "mizumo",
  axle: "kururi",
};

const canonicalCharacterId = (value: string): CharacterId | null => {
  if (value in LEGACY_CHARACTER_IDS) return LEGACY_CHARACTER_IDS[value];
  return value === "hinoko" || value === "mebuki" || value === "fuwame" || value === "sumi" || value === "mizumo" || value === "kururi"
    ? value
    : null;
};

const canonicalEventName = (value: string): string => {
  if (value === "cinder-feast") return "sumi-feast";
  if (value.startsWith("interaction:")) {
    const id = canonicalCharacterId(value.slice("interaction:".length));
    return id ? `interaction:${id}` : value;
  }
  return value;
};

export class BrowserWorldPersistence implements WorldPersistence {
  private database: PersistedDatabase;
  private readonly committed = new Map<string, string>();
  private readonly pending = new Map<string, { fingerprint: string; raw: string }>();
  private writing: Promise<void> | null = null;
  private readOnly = false;
  private lastError: unknown = null;
  private reportedError = false;
  private readonly projectErrors = new Map<string, unknown>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 1_000;

  constructor(private readonly storage: ProjectStorage = browserStorage) {
    this.database = this.readDatabase();
    try {
      for (const raw of storage.read()) {
        const record = JSON.parse(raw);
        if (record.version !== VERSION) { this.readOnly = true; continue; }
        if (!isPersistedWorld(record.project)) { this.readOnly = true; continue; }
        const project = record.project as PersistedWorld;
        this.database.projects[project.projectKey] = project;
        this.committed.set(project.projectKey, fingerprint(project));
      }
    } catch (error) {
      // 読込失敗を空DBと誤認して上書きしない。元データは保持する。
      this.readOnly = true;
      this.lastError = error;
    }
    // 旧DBの移行はproject単位。完了したprojectは次の起動で再保存しない。
    for (const project of Object.values(this.database.projects)) {
      if (!this.committed.has(project.projectKey)) this.queue(project);
    }
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
    world.tokenQueue = Math.max(0, persisted.tokenQueue ?? 0);
    world.fuelProgress = Math.max(0, persisted.fuelProgress ?? 0);
    world.taskTokens = Math.max(0, persisted.taskTokens ?? 0);
    world.destructionScore = Math.max(0, persisted.destructionScore);
    world.restorationScore = Math.max(0, persisted.restorationScore);
    world.growthLevel = clamp(Math.floor(persisted.growthLevel || 0), 0, 23);
    world.factoryTier = Math.min(5, 1 + Math.floor(world.growthLevel / 6));
    world.energyLevel = clamp(persisted.energyLevel || 0, 0, 23);
    world.rngState = persisted.rngState >>> 0;
    world.debt = { ...world.debt, ...persisted.debt };
    world.environment = { ...world.environment, ...persisted.environment };
    world.history = Array.isArray(persisted.history)
      ? persisted.history.slice(0, 160).map((moment) => ({
          ...moment,
          eventType: moment.eventType ? canonicalEventName(moment.eventType) as HistoricalMoment["eventType"] : undefined,
        }))
      : [];
    world.discoveries = persisted.discoveries && typeof persisted.discoveries === "object"
      ? Object.fromEntries(Object.entries(persisted.discoveries).map(([key, discovery]) => {
          const canonicalKey = canonicalEventName(key);
          return [canonicalKey, { ...discovery, eventType: canonicalEventName(discovery.eventType) }];
        }))
      : {};
    world.replays = Array.isArray(persisted.replays)
      ? persisted.replays.slice(0, 24).map((replay) => ({
          ...replay,
          frames: replay.frames.map((frame) => ({
            ...frame,
            event: frame.event ? canonicalEventName(frame.event) : null,
          })),
        }))
      : [];
    for (const [id, state] of Object.entries(persisted.characters ?? {})) {
      const canonicalId = canonicalCharacterId(id);
      const character = canonicalId ? world.characters[canonicalId] : undefined;
      if (!character || !state) continue;
      character.act = state.act ?? character.act;
      character.mood = state.mood ?? character.mood;
      character.interactions = Math.max(0, state.interactions ?? 0);
    }

    this.applyOfflineRecovery(world, Date.now() - persisted.savedAt);
    return world;
  }

  save(world: WorldState): void {
    if (this.readOnly) { this.reportError(this.lastError ?? new Error("保存形式が新しいか読み取れないため、上書きしません")); return; }
    try {
      // JSON round-tripで可変worldから切り離す。await中の追加変更を混ぜない。
      const project = JSON.parse(JSON.stringify(serializeWorld(world))) as PersistedWorld;
      this.queue(project);
      void this.flush().catch((error) => this.reportError(error));
    } catch (error) { this.projectErrors.set(world.projectKey, error); this.reportError(error); }
  }

  private reportError(error: unknown): void {
    if (this.reportedError) return;
    this.reportedError = true;
    window.dispatchEvent(new CustomEvent("token-fire:storage-error", { detail: String(error) }));
  }

  private queue(project: PersistedWorld): void {
    if (this.readOnly) return;
    const content = fingerprint(project);
    const key = project.projectKey;
    const raw = JSON.stringify({ version: VERSION, project });
    if (new TextEncoder().encode(raw).byteLength > MAX_PROJECT_BYTES) {
      this.projectErrors.set(key, new Error("Project save exceeds 4 MiB; previous save retained"));
      return;
    }
    this.projectErrors.delete(key);
    if (this.pending.get(key)?.fingerprint === content) return;
    if (!this.pending.has(key) && this.committed.get(key) === content) return;
    this.database.projects[key] = project;
    this.pending.set(key, { fingerprint: content, raw });
  }

  flush(): Promise<void> {
    if (this.readOnly) return Promise.reject(this.lastError ?? new Error("Save data is read-only: unknown or unreadable format"));
    if (this.writing) return this.writing;
    if (this.retryTimer !== null) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    this.writing = Promise.resolve().then(async () => {
      for (const key of this.pending.keys()) {
        // 新しい同project変更がawait中に来たら次の反復で保存する。
        while (this.pending.has(key)) {
          const next = this.pending.get(key)!;
          await this.storage.write(key, next.raw);
          this.committed.set(key, next.fingerprint);
          if (this.pending.get(key) === next) this.pending.delete(key);
        }
      }
      if (this.projectErrors.size) throw this.projectErrors.values().next().value;
      this.retryDelay = 1_000;
      if (this.reportedError) {
        this.reportedError = false;
        window.dispatchEvent(new Event("token-fire:storage-recovered"));
      }
    }).catch((error) => {
      this.reportError(error);
      // 保存に失敗したdirtyだけ再試行する。idle状態でも一過性の失敗を放置せず、最大30秒へbackoff。
      if (this.pending.size && this.retryTimer === null) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          void this.flush().catch(() => {});
        }, this.retryDelay);
        this.retryDelay = Math.min(30_000, this.retryDelay * 2);
      }
      throw error;
    }).finally(() => { this.writing = null; });
    return this.writing;
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
        if (parsed.version > VERSION) { this.readOnly = true; return { version: VERSION, projects: {} }; }
        if (parsed.version === VERSION && parsed.projects && typeof parsed.projects === "object") {
          return { version: VERSION, projects: Object.fromEntries(Object.entries(parsed.projects).filter(([, project]) => isPersistedWorld(project))) };
        }
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
  tokenQueue: world.tokenQueue,
  fuelProgress: world.fuelProgress,
  taskTokens: world.taskTokens,
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

// savedAtはcheckpointの時刻であり、dirtyを発生させる世界内容ではない。
const fingerprint = (project: PersistedWorld): string => JSON.stringify({ ...project, savedAt: 0 });

const isPersistedWorld = (value: unknown): value is PersistedWorld => {
  if (!value || typeof value !== "object") return false;
  const p = value as PersistedWorld;
  return typeof p.projectKey === "string" && Number.isFinite(p.savedAt)
    && Array.isArray(p.trees) && p.trees.every((tree) => tree && Number.isFinite(tree.id)
      && ["grown", "burning", "charred", "sapling"].includes(tree.stage)
      && Number.isFinite(tree.burn) && Number.isFinite(tree.regrow))
    && [p.water, p.heat, p.pollution, p.rain, p.tokenProduced, p.destructionScore, p.restorationScore, p.rngState].every(Number.isFinite)
    && (!p.replays || (Array.isArray(p.replays) && p.replays.every((replay) => replay && Array.isArray(replay.frames))));
};
