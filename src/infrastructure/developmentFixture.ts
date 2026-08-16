import { IDLE_SNAPSHOT, type AgentSnapshot } from "../domain/agent";
import { createCharacterLife } from "../domain/character";
import type { ReplayFrame, ReplaySession, TimePhase, WeatherKind } from "../domain/experienceData";
import { createWorld, type WorldState } from "../domain/world";
import type { WorldScene } from "../domain/worldScene";
import type { AgentSource } from "./codexClient";
import type { ProjectMeta, ProjectSummary, WorldPersistence } from "./worldPersistence";

export interface DevelopmentFixture {
  scene: WorldScene;
  timePhase: TimePhase;
  weather: WeatherKind;
  growthLevel: number;
  quiet: boolean;
  width: number;
  height: number;
}

const SCENES = new Set<WorldScene>(["poka", "mera", "gogo", "approval", "kirari", "zero-output", "meguri"]);
const TIMES = new Set<TimePhase>(["dawn", "day", "dusk", "night"]);
const WEATHER = new Set<WeatherKind>(["clear", "cloudy", "rain", "snow", "storm", "fog", "unknown"]);

/**
 * 開発用URL fixture。enabled=falseならqueryを一切解釈せず、本番経路へ影響させない。
 */
export const readDevelopmentFixture = (search: string, enabled: boolean): DevelopmentFixture | null => {
  if (!enabled) return null;
  const params = new URLSearchParams(search);
  const requestedScene = params.get("tfFixture") as WorldScene | null;
  if (!requestedScene || !SCENES.has(requestedScene)) return null;
  const requestedTime = params.get("tfTime") as TimePhase | null;
  const requestedWeather = params.get("tfWeather") as WeatherKind | null;
  const requestedGrowth = Number(params.get("tfGrowth") ?? Number.NaN);
  const requestedWidth = Number(params.get("tfWidth") ?? Number.NaN);
  const requestedHeight = Number(params.get("tfHeight") ?? Number.NaN);
  return {
    scene: requestedScene,
    timePhase: requestedTime && TIMES.has(requestedTime) ? requestedTime : "dusk",
    weather: requestedWeather && WEATHER.has(requestedWeather) ? requestedWeather : requestedScene === "meguri" ? "rain" : "clear",
    growthLevel: Number.isFinite(requestedGrowth) ? Math.max(0, Math.min(23, Math.floor(requestedGrowth))) : 13,
    quiet: params.get("tfQuiet") === "1" || params.get("tfQuiet") === "true",
    width: Number.isFinite(requestedWidth) ? Math.max(320, Math.min(1_600, Math.floor(requestedWidth))) : 560,
    height: Number.isFinite(requestedHeight) ? Math.max(220, Math.min(1_200, Math.floor(requestedHeight))) : 350,
  };
};

export class DevelopmentFixtureSource implements AgentSource {
  constructor(private readonly fixture: DevelopmentFixture) {}

  async poll(): Promise<AgentSnapshot> {
    const base: AgentSnapshot = {
      ...IDLE_SNAPSHOT,
      projectKey: "fixture-hibana-works",
      projectLabel: "Hibana QA Works",
      projectPath: "/development/fixture",
      model: "fixture-relative-model",
      effort: "high",
      activeSessions: 1,
      totalTokens: 84_200,
      tokenDelta: 0,
      sessionTitle: `FIXTURE · ${this.fixture.scene.toUpperCase()}`,
      source: "codex-jsonl",
      updatedAtMs: Date.now(),
    };
    switch (this.fixture.scene) {
      case "mera": return { ...base, active: true, status: "working", tool: "apply_patch" };
      case "gogo": return { ...base, active: true, status: "working", activeSessions: 4, tool: "shell" };
      case "approval": return { ...base, active: true, status: "thinking", activeSessions: 2, tool: "approval_review" };
      case "kirari": return { ...base, status: "completed", activeSessions: 0 };
      case "zero-output": return { ...base, status: "error", activeSessions: 0 };
      case "meguri": return { ...base, activeSessions: 0 };
      case "poka":
      default: return { ...base, totalTokens: 0, activeSessions: 0 };
    }
  }
}

/** visual regressionがlocalStorageの履歴や保存時刻へ依存しない開発専用Persistence。 */
export class DevelopmentFixturePersistence implements WorldPersistence {
  private readonly world: WorldState;

  constructor(private readonly fixture: DevelopmentFixture) {
    this.world = createWorld({
      projectKey: "fixture-hibana-works",
      projectLabel: "Hibana QA Works",
      projectPath: "/development/fixture",
      model: "fixture-relative-model",
    });
    applyDevelopmentWorldFixture(this.world, fixture);
  }

  loadProject(_meta: ProjectMeta): WorldState {
    applyDevelopmentWorldFixture(this.world, this.fixture);
    return this.world;
  }

  save(_world: WorldState): void {}

  listProjects(): ProjectSummary[] {
    return [{
      key: this.world.projectKey,
      label: this.world.projectLabel,
      path: this.world.projectPath,
      model: this.world.model,
      savedAt: FIXTURE_EPOCH,
      totalTokens: this.world.debt.totalTokensBurned,
      growthLevel: this.world.growthLevel,
      historyCount: this.world.history.length,
      replayCount: this.world.replays.length,
    }];
  }

  exportDatabase(): string {
    return JSON.stringify({ version: 3, fixture: true, project: this.world.projectKey }, null, 2);
  }
}

export const applyDevelopmentWorldFixture = (world: WorldState, fixture: DevelopmentFixture): void => {
  const playActive = world.interaction.enabled;
  const playOffset = world.interaction.fuwameOffsetX;
  world.projectKey = "fixture-hibana-works";
  world.projectLabel = "Hibana QA Works";
  world.projectPath = "/development/fixture";
  world.model = "fixture-relative-model";
  world.growthLevel = fixture.growthLevel;
  world.factoryTier = Math.min(5, 1 + Math.floor(fixture.growthLevel / 6));
  world.energyLevel = fixture.scene === "gogo" ? 21 : fixture.scene === "poka" ? 0 : 12;
  world.energyLabel = fixture.scene === "gogo" ? "非常にたくさん" : fixture.scene === "poka" ? "ほぼおひるね" : "そこそこ";
  world.tokenQueue = 0;
  world.tokenProduced = fixture.scene === "poka" ? 0 : 84_200;
  world.taskTokens = fixture.scene === "poka" ? 0 : 42_100;
  world.taskPeakAgents = fixture.scene === "gogo" ? 4 : 1;
  world.destructionScore = fixture.scene === "poka" ? 0 : 68;
  world.fuelProgress = 0;
  world.harvestProgress = 0;
  world.combustionPulse = fixture.scene === "mera" || fixture.scene === "gogo" ? 0.62 : 0;
  world.factoryPulse = 0.42;
  world.elapsed = 120;
  world.quoteTimer = 0;
  world.quoteVisible = false;
  world.rngState = 0x5f3759df;
  world.chill = fixture.scene === "meguri" ? 0.72 : 0.18;
  world.particles = [];
  world.activeEvent = null;
  world.eventQueue = [];
  world.eventElapsed = 0;
  world.nextEventId = 1;
  world.environment.timePhase = fixture.timePhase;
  world.environment.hour = ({ dawn: 6, day: 12, dusk: 18, night: 23 })[fixture.timePhase];
  world.environment.weather = fixture.weather;
  world.environment.temperatureC = null;
  world.environment.weatherUpdatedAt = 0;
  world.water = fixture.scene === "meguri" ? 0.82 : 0.54;
  world.rain = fixture.weather === "rain" || fixture.weather === "storm" ? 0.74 : 0.18;
  world.heat = fixture.scene === "gogo" ? 0.91 : fixture.scene === "meguri" ? 0.16 : 0.58;
  world.pollution = fixture.scene === "meguri" ? 0.28 : 0.67;
  world.restorationScore = 510;
  world.trees.forEach((tree, index) => {
    const recovery = fixture.scene === "meguri";
    const idle = fixture.scene === "poka";
    tree.stage = idle
      ? "grown"
      : recovery
        ? index % 4 === 0 ? "grown" : index % 4 === 1 ? "sapling" : "charred"
        : index < 6 ? "grown" : index < 10 ? "burning" : "charred";
    tree.burn = tree.stage === "burning" ? 0.56 : tree.stage === "charred" ? 1 : 0;
    tree.regrow = tree.stage === "sapling" ? 0.42 : 0;
  });
  world.debt.totalTokensBurned = fixture.scene === "poka" ? 0 : 84_200;
  world.debt.completedJobs = fixture.scene === "poka" ? 0 : 7;
  world.debt.weightedTokensBurned = fixture.scene === "poka" ? 0 : 101_040;
  world.debt.wastedTokens = fixture.scene === "zero-output" ? 21_400 : 4_800;
  world.debt.treesHarvested = fixture.scene === "poka" ? 0 : 46;
  world.debt.forestWipeouts = 2;
  world.debt.greenwashCeremonies = 4;
  world.debt.peakAgents = 4;
  world.debt.largestTaskTokens = 42_100;
  world.debt.manualDamage = 0;
  world.debt.lastModel = "fixture-relative-model";
  world.forestWipeoutLatched = false;
  if (!playActive) world.characters = createCharacterLife();
  world.interaction.enabled = playActive;
  world.interaction.hovered = playActive ? world.interaction.hovered : null;
  world.interaction.dragging = null;
  world.interaction.fuwameOffsetX = playActive ? playOffset : 0;
  world.interaction.lastInteractionAt = 0;
  world.history = fixtureHistory();
  world.replays = fixtureReplays();
  world.discoveries = {};
  world.discoveries["sunk-cost-error"] = {
    eventType: "sunk-cost-error",
    firstSeenAt: 1,
    lastSeenAt: 2,
    count: 3,
    title: "成果ゼロ事故",
    line: "固定fixture",
  };
};

const FIXTURE_EPOCH = Date.UTC(2026, 7, 11, 0, 0, 0);
const FIXTURE_TREES = "ggggggbbbbcccccccccccccccc";

const fixtureFrame = (t: number, energyLevel: number, taskTokens: number, active = true): ReplayFrame => ({
  t,
  active,
  status: active ? "working" : "idle",
  effort: "high",
  agents: active ? 2 : 0,
  taskTokens,
  totalTokens: taskTokens,
  energyLevel,
  growthLevel: 13,
  heat: active ? 0.72 : 0.24,
  pollution: active ? 0.64 : 0.31,
  water: active ? 0.48 : 0.78,
  rain: active ? 0.12 : 0.66,
  chill: active ? 0.08 : 0.72,
  trees: FIXTURE_TREES,
  event: null,
});

const fixtureReplay = (id: string, wasted: boolean, energy: readonly [number, number, number]): ReplaySession => ({
  id,
  projectKey: "fixture-hibana-works",
  projectLabel: "Hibana QA Works",
  sessionId: id,
  title: wasted ? "未完了の増設申請" : "定例Token焼却",
  model: "fixture-relative-model",
  startedAt: FIXTURE_EPOCH,
  endedAt: FIXTURE_EPOCH + 8_000,
  totalTokens: 84_200,
  wasted,
  frames: [fixtureFrame(0, energy[0], 0), fixtureFrame(4, energy[1], 42_100), fixtureFrame(8, energy[2], 84_200, !wasted)],
});

const fixtureReplays = (): ReplaySession[] => [
  fixtureReplay("fixture-complete", false, [3, 18, 11]),
  fixtureReplay("fixture-incomplete", true, [4, 19, 7]),
];

const fixtureHistory = (): WorldState["history"] => [
  { id: "fixture-history-1", at: FIXTURE_EPOCH + 9_000, projectKey: "fixture-hibana-works", type: "task", title: "操業完了", line: "定例Token焼却を映写券へ綴じました。", tokens: 84_200, model: "fixture-relative-model", importance: 1 },
  { id: "fixture-history-2", at: FIXTURE_EPOCH + 6_000, projectKey: "fixture-hibana-works", type: "event", title: "成果ゼロ事故", line: "赤伝票を一枚追加しました。", eventType: "sunk-cost-error", tone: "warning", importance: 2 },
  { id: "fixture-history-3", at: FIXTURE_EPOCH + 3_000, projectKey: "fixture-hibana-works", type: "milestone", title: "配管増設", line: "設備は静かにAct 4へ進みました。", importance: 1 },
];
