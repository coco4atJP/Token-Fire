import { effortMultiplier, type AgentSnapshot } from "./agent";
import { createWorldEvent, type WorldEvent, type WorldEventType } from "./worldEvent";

export type TreeStage = "sapling" | "grown" | "burning" | "charred";

export interface Tree {
  id: number;
  x: number;
  y: number;
  size: number;
  stage: TreeStage;
  burn: number;
  regrow: number;
  sway: number;
}

export interface Particle {
  kind: "smoke" | "ember" | "steam" | "rain" | "token" | "spark";
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

export interface EnvironmentalDebt {
  totalTokensBurned: number;
  wastedTokens: number;
  treesHarvested: number;
  forestWipeouts: number;
  completedJobs: number;
  greenwashCeremonies: number;
  peakAgents: number;
}

export interface WorldState {
  width: number;
  height: number;
  trees: Tree[];
  particles: Particle[];
  water: number;
  heat: number;
  pollution: number;
  rain: number;
  tokenQueue: number;
  tokenProduced: number;
  destructionScore: number;
  restorationScore: number;
  factoryPulse: number;
  elapsed: number;
  quoteTimer: number;
  quoteVisible: boolean;
  rngState: number;
  fuelProgress: number;
  harvestProgress: number;
  combustionPulse: number;
  chill: number;
  taskTokens: number;
  taskPeakAgents: number;
  factoryTier: number;
  activeEvent: WorldEvent | null;
  eventQueue: WorldEvent[];
  eventElapsed: number;
  nextEventId: number;
  debt: EnvironmentalDebt;
  forestWipeoutLatched: boolean;
}

export interface WorldMetrics {
  livingTrees: number;
  burningTrees: number;
  charredTrees: number;
  waterPercent: number;
  destructionScore: number;
  restorationScore: number;
  totalTokensBurned: number;
  wastedTokens: number;
  factoryTier: number;
  chillPercent: number;
}

const TREE_POSITIONS: Array<[number, number, number]> = [
  [34, 129, 0.9], [54, 124, 1.05], [76, 131, 0.85], [96, 119, 1.1],
  [118, 132, 0.95], [145, 125, 0.8], [22, 107, 0.75], [47, 101, 0.9],
  [70, 107, 1.05], [93, 96, 0.8], [120, 103, 1.0], [144, 97, 0.85],
  [29, 80, 0.85], [56, 77, 1.0], [82, 84, 0.75], [110, 76, 0.92],
  [139, 80, 0.72], [18, 55, 0.66], [45, 52, 0.78], [73, 59, 0.65],
  [101, 51, 0.78], [130, 58, 0.7], [151, 47, 0.62], [161, 111, 0.7],
  [176, 127, 0.68], [187, 99, 0.65], [202, 122, 0.6], [214, 93, 0.62],
];

const createDebt = (): EnvironmentalDebt => ({
  totalTokensBurned: 0,
  wastedTokens: 0,
  treesHarvested: 0,
  forestWipeouts: 0,
  completedJobs: 0,
  greenwashCeremonies: 0,
  peakAgents: 0,
});

export const createWorld = (width = 320, height = 192): WorldState => ({
  width,
  height,
  trees: TREE_POSITIONS.map(([x, y, size], id) => ({
    id,
    x,
    y,
    size,
    stage: "grown",
    burn: 0,
    regrow: 0,
    sway: id * 0.73,
  })),
  particles: [],
  water: 0.92,
  heat: 0.08,
  pollution: 0.05,
  rain: 0.1,
  tokenQueue: 0,
  tokenProduced: 0,
  destructionScore: 0,
  restorationScore: 0,
  factoryPulse: 0,
  elapsed: 0,
  quoteTimer: 0,
  quoteVisible: false,
  rngState: 0x5f3759df,
  fuelProgress: 0,
  harvestProgress: 0,
  combustionPulse: 0,
  chill: 0,
  taskTokens: 0,
  taskPeakAgents: 0,
  factoryTier: 1,
  activeEvent: null,
  eventQueue: [],
  eventElapsed: 0,
  nextEventId: 1,
  debt: createDebt(),
  forestWipeoutLatched: false,
});

const random = (world: WorldState): number => {
  let x = world.rngState | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  world.rngState = x >>> 0;
  return world.rngState / 0xffffffff;
};

const spawn = (
  world: WorldState,
  kind: Particle["kind"],
  x: number,
  y: number,
  vx: number,
  vy: number,
  life: number,
  size: number,
): void => {
  if (world.particles.length > 480) return;
  world.particles.push({ kind, x, y, vx, vy, life, maxLife: life, size });
};

export const enqueueWorldEvent = (
  world: WorldState,
  type: WorldEventType,
  magnitude = 1,
  override?: Partial<Pick<WorldEvent, "title" | "line" | "duration" | "tone">>,
): WorldEvent => {
  const event = createWorldEvent(type, world.nextEventId, magnitude, override);
  world.nextEventId += 1;
  if (!world.activeEvent) {
    world.activeEvent = event;
    world.eventElapsed = 0;
  } else if (world.eventQueue.length < 8) {
    world.eventQueue.push(event);
  }
  return event;
};

const advanceWorldEvents = (world: WorldState, dt: number): void => {
  if (!world.activeEvent) {
    const next = world.eventQueue.shift() ?? null;
    world.activeEvent = next;
    world.eventElapsed = 0;
    return;
  }
  world.eventElapsed += dt;
  if (world.eventElapsed >= world.activeEvent.duration) {
    world.activeEvent = world.eventQueue.shift() ?? null;
    world.eventElapsed = 0;
  }
};

const igniteTree = (world: WorldState): boolean => {
  const candidates = world.trees.filter((tree) => tree.stage === "grown" || tree.stage === "sapling");
  if (candidates.length === 0) return false;
  const weighted = [...candidates].sort((a, b) => b.x - a.x);
  const upper = Math.max(1, Math.floor(weighted.length * 0.68));
  const tree = weighted[Math.floor(random(world) * upper)];
  tree.stage = "burning";
  tree.burn = 0;
  return true;
};

const updateParticles = (world: WorldState, dt: number): void => {
  for (const particle of world.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;
    if (particle.kind === "smoke" || particle.kind === "steam") {
      particle.vx += Math.sin(world.elapsed * 1.7 + particle.y) * 0.5 * dt;
      particle.size += dt * 0.5;
    }
    if (particle.kind === "rain") particle.vy += 30 * dt;
    if (particle.kind === "token") particle.vy += 12 * dt;
  }
  world.particles = world.particles.filter(
    (particle) => particle.life > 0 && particle.y < world.height + 20 && particle.x > -20 && particle.x < world.width + 20,
  );
};

const updateTrees = (world: WorldState, active: boolean, dt: number): void => {
  for (const tree of world.trees) {
    tree.sway += dt * (active ? 2.2 : 0.48 + world.chill * 0.16);
    if (tree.stage === "burning") {
      tree.burn += dt * (0.1 + world.heat * 0.15);
      if (random(world) < dt * 9) {
        spawn(world, "ember", tree.x, tree.y - 15 * tree.size, (random(world) - 0.5) * 10, -12 - random(world) * 10, 0.8, 1 + random(world));
      }
      if (tree.burn >= 1) {
        tree.stage = "charred";
        tree.regrow = 0;
        world.destructionScore += 12;
        world.debt.treesHarvested += 1;
      }
    } else if (!active && tree.stage === "charred") {
      tree.regrow += dt * (0.1 + world.rain * 0.13 + world.chill * 0.04);
      if (tree.regrow >= 1) {
        tree.stage = "sapling";
        tree.regrow = 0;
        world.restorationScore += 7;
      }
    } else if (!active && tree.stage === "sapling") {
      tree.regrow += dt * (0.17 + world.rain * 0.15 + world.chill * 0.06);
      if (tree.regrow >= 1) {
        tree.stage = "grown";
        tree.regrow = 0;
        world.restorationScore += 5;
      }
    }
  }

  const living = world.trees.some((tree) => tree.stage === "grown" || tree.stage === "sapling" || tree.stage === "burning");
  if (!living && !world.forestWipeoutLatched) {
    world.forestWipeoutLatched = true;
    world.debt.forestWipeouts += 1;
  }
  if (living) world.forestWipeoutLatched = false;
};

const emitCombustionParticles = (world: WorldState, intensity: number, consumed: number, dt: number): void => {
  const tokenRate = Math.min(12, consumed / 32);
  if (random(world) < dt * tokenRate) {
    spawn(world, "token", 255, 124, 14 + random(world) * 8, -10 - random(world) * 4, 2.2, 3);
  }
  if (random(world) < dt * (1.5 + intensity * 2 + consumed / 90)) {
    spawn(world, "smoke", 238 + random(world) * 7, 70, (random(world) - 0.5) * 8, -8 - random(world) * 8, 2.6 + random(world), 3 + random(world) * 2);
  }
  if (random(world) < dt * (0.8 + consumed / 70)) {
    spawn(world, "steam", 278 + random(world) * 24, 118 + random(world) * 12, (random(world) - 0.5) * 5, -7 - random(world) * 5, 1.6, 2.5);
  }
};

const updateActiveWorld = (world: WorldState, snapshot: AgentSnapshot, dt: number): void => {
  const multiplier = effortMultiplier(snapshot.effort);
  const parallel = 1 + Math.max(0, snapshot.activeSessions - 1) * 0.38;
  const intensity = multiplier * parallel;
  const throughput = 110 * intensity * (snapshot.status === "working" ? 1.12 : 0.78);
  const consumed = Math.min(world.tokenQueue, dt * throughput);

  world.chill = Math.max(0, world.chill - dt * 1.7);
  world.combustionPulse = Math.max(0, world.combustionPulse - dt * 2.4);
  world.rain = Math.max(0, world.rain - dt * 0.75);
  world.factoryPulse += dt * (3.4 + intensity * 1.9);
  world.taskPeakAgents = Math.max(world.taskPeakAgents, snapshot.activeSessions);
  world.debt.peakAgents = Math.max(world.debt.peakAgents, snapshot.activeSessions);

  world.heat = Math.min(1, world.heat + dt * (0.006 + consumed * 0.00013));
  world.pollution = Math.min(1, world.pollution + dt * (0.002 + consumed * 0.000075));
  world.water = Math.max(0.04, world.water - dt * consumed * 0.000008 * (0.6 + intensity));

  world.tokenQueue -= consumed;
  world.tokenProduced += consumed;
  world.taskTokens += consumed;
  world.debt.totalTokensBurned += consumed;
  if (consumed > 0) world.combustionPulse = Math.min(1, world.combustionPulse + consumed / 96);
  world.fuelProgress += consumed;
  world.harvestProgress += consumed;

  emitCombustionParticles(world, intensity, consumed, dt);

  let burstGuard = 0;
  while (world.fuelProgress >= 192 && burstGuard < 3) {
    world.fuelProgress -= 192;
    enqueueWorldEvent(world, "token-burn", 192);
    burstGuard += 1;
  }

  burstGuard = 0;
  const harvestThreshold = Math.max(240, 460 / Math.max(0.7, intensity));
  while (world.harvestProgress >= harvestThreshold && burstGuard < 2) {
    world.harvestProgress -= harvestThreshold;
    if (igniteTree(world)) {
      enqueueWorldEvent(world, "tree-harvest", harvestThreshold);
    } else {
      enqueueWorldEvent(world, "coolant-drain", harvestThreshold * 0.6);
      world.water = Math.max(0.04, world.water - 0.012);
    }
    burstGuard += 1;
  }

  if (snapshot.status === "working" && consumed > 0 && random(world) < dt * Math.min(9, 2 + consumed / 24)) {
    spawn(world, "spark", 226, 128, (random(world) - 0.5) * 18, -14 - random(world) * 8, 0.45, 1.5);
  }
};

const updateRecoveryWorld = (world: WorldState, dt: number): void => {
  world.quoteVisible = false;
  world.quoteTimer = 0;
  world.combustionPulse = Math.max(0, world.combustionPulse - dt * 1.8);
  world.chill = Math.min(1, world.chill + dt * 0.095);
  world.factoryPulse += dt * (0.44 + world.chill * 0.22);
  world.heat = Math.max(0.02, world.heat - dt * (0.032 + world.chill * 0.022));
  world.pollution = Math.max(0, world.pollution - dt * (0.017 + world.rain * 0.028));
  world.rain = Math.min(0.9, world.rain + dt * (0.045 + world.chill * 0.018));
  world.water = Math.min(1, world.water + dt * 0.005 * (0.35 + world.rain));

  if (random(world) < dt * world.rain * (18 + world.chill * 8)) {
    spawn(world, "rain", random(world) * world.width, -5, -6, 64 + random(world) * 30, 2.8, 1);
  }
  if (world.rain > 0.35 && random(world) < dt * 0.5) world.restorationScore += 0.2;
};

export const addTokenDelta = (world: WorldState, tokenDelta: number): void => {
  if (!Number.isFinite(tokenDelta) || tokenDelta <= 0) return;
  world.tokenQueue = Math.min(160_000, world.tokenQueue + tokenDelta);
};

export const updateWorld = (world: WorldState, snapshot: AgentSnapshot, dtSeconds: number): void => {
  const dt = Math.min(0.08, Math.max(0, dtSeconds));
  world.elapsed += dt;
  if (snapshot.active) updateActiveWorld(world, snapshot, dt);
  else updateRecoveryWorld(world, dt);
  updateTrees(world, snapshot.active, dt);
  updateParticles(world, dt);
  advanceWorldEvents(world, dt);
};

export const getWorldMetrics = (world: WorldState): WorldMetrics => ({
  livingTrees: world.trees.filter((tree) => tree.stage === "grown" || tree.stage === "sapling").length,
  burningTrees: world.trees.filter((tree) => tree.stage === "burning").length,
  charredTrees: world.trees.filter((tree) => tree.stage === "charred").length,
  waterPercent: Math.round(world.water * 100),
  destructionScore: Math.floor(world.destructionScore + world.tokenProduced / 120),
  restorationScore: Math.floor(world.restorationScore),
  totalTokensBurned: Math.floor(world.debt.totalTokensBurned),
  wastedTokens: Math.floor(world.debt.wastedTokens),
  factoryTier: world.factoryTier,
  chillPercent: Math.round(world.chill * 100),
});
