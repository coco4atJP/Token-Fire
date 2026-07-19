import { effortMultiplier, type AgentSnapshot } from "./agent";

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
}

export interface WorldMetrics {
  livingTrees: number;
  burningTrees: number;
  charredTrees: number;
  waterPercent: number;
  destructionScore: number;
  restorationScore: number;
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

const igniteTree = (world: WorldState): boolean => {
  const candidates = world.trees.filter((tree) => tree.stage === "grown" || tree.stage === "sapling");
  if (candidates.length === 0) return false;
  const weighted = candidates.sort((a, b) => b.x - a.x);
  const upper = Math.max(1, Math.floor(weighted.length * 0.62));
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
    if (particle.kind === "rain") {
      particle.vy += 30 * dt;
    }
    if (particle.kind === "token") {
      particle.vy += 12 * dt;
    }
  }
  world.particles = world.particles.filter(
    (particle) => particle.life > 0 && particle.y < world.height + 20 && particle.x > -20 && particle.x < world.width + 20,
  );
};

const updateTrees = (world: WorldState, active: boolean, dt: number): void => {
  for (const tree of world.trees) {
    tree.sway += dt * (active ? 2.2 : 0.7);
    if (tree.stage === "burning") {
      tree.burn += dt * (0.09 + world.heat * 0.14);
      if (random(world) < dt * 9) {
        spawn(world, "ember", tree.x, tree.y - 15 * tree.size, (random(world) - 0.5) * 10, -12 - random(world) * 10, 0.8, 1 + random(world));
      }
      if (tree.burn >= 1) {
        tree.stage = "charred";
        tree.regrow = 0;
        world.destructionScore += 12;
      }
    } else if (!active && tree.stage === "charred") {
      tree.regrow += dt * (0.12 + world.rain * 0.14);
      if (tree.regrow >= 1) {
        tree.stage = "sapling";
        tree.regrow = 0;
        world.restorationScore += 7;
      }
    } else if (!active && tree.stage === "sapling") {
      tree.regrow += dt * (0.2 + world.rain * 0.16);
      if (tree.regrow >= 1) {
        tree.stage = "grown";
        tree.regrow = 0;
        world.restorationScore += 5;
      }
    }
  }
};

const updateActiveWorld = (world: WorldState, snapshot: AgentSnapshot, dt: number): void => {
  const multiplier = effortMultiplier(snapshot.effort);
  const parallel = 1 + Math.max(0, snapshot.activeSessions - 1) * 0.38;
  const intensity = multiplier * parallel;

  world.rain = Math.max(0, world.rain - dt * 0.8);
  world.heat = Math.min(1, world.heat + dt * 0.045 * intensity);
  world.pollution = Math.min(1, world.pollution + dt * 0.025 * intensity);
  world.water = Math.max(0.05, world.water - dt * 0.0025 * intensity * (0.4 + world.heat));
  world.factoryPulse += dt * (4 + intensity * 2);
  world.quoteTimer += dt;
  world.quoteVisible = world.quoteTimer > 7 && world.quoteTimer < 10;
  if (world.quoteTimer >= 18) world.quoteTimer = 0;

  const baselineTokens = dt * (18 + intensity * 20);
  const consumed = Math.min(world.tokenQueue, dt * 140 * intensity);
  world.tokenQueue -= consumed;
  world.tokenProduced += consumed;
  const destructiveEnergy = baselineTokens + consumed;

  if (random(world) < dt * (0.15 + destructiveEnergy / 950) * Math.sqrt(intensity)) {
    igniteTree(world);
  }

  if (random(world) < dt * (4 + intensity * 3)) {
    spawn(world, "smoke", 238 + random(world) * 7, 70, (random(world) - 0.5) * 8, -8 - random(world) * 8, 2.6 + random(world), 3 + random(world) * 2);
  }
  if (random(world) < dt * (2 + intensity * 2.5)) {
    spawn(world, "steam", 278 + random(world) * 24, 118 + random(world) * 12, (random(world) - 0.5) * 5, -7 - random(world) * 5, 1.6, 2.5);
  }
  if (random(world) < dt * (1.5 + intensity)) {
    spawn(world, "token", 255, 124, 14 + random(world) * 8, -10 - random(world) * 4, 2.2, 3);
  }
  if (snapshot.status === "working" && random(world) < dt * 5) {
    spawn(world, "spark", 226, 128, (random(world) - 0.5) * 18, -14 - random(world) * 8, 0.45, 1.5);
  }
};

const updateRecoveryWorld = (world: WorldState, dt: number): void => {
  world.quoteVisible = false;
  world.quoteTimer = 0;
  world.factoryPulse += dt * 0.8;
  world.heat = Math.max(0.02, world.heat - dt * 0.04);
  world.pollution = Math.max(0, world.pollution - dt * (0.022 + world.rain * 0.035));
  world.rain = Math.min(0.88, world.rain + dt * 0.06);
  world.water = Math.min(1, world.water + dt * 0.006 * (0.3 + world.rain));

  if (random(world) < dt * world.rain * 27) {
    spawn(world, "rain", random(world) * world.width, -5, -8, 72 + random(world) * 38, 2.5, 1);
  }
  if (world.rain > 0.35 && random(world) < dt * 0.6) {
    world.restorationScore += 0.2;
  }
};

export const addTokenDelta = (world: WorldState, tokenDelta: number): void => {
  if (!Number.isFinite(tokenDelta) || tokenDelta <= 0) return;
  world.tokenQueue = Math.min(120_000, world.tokenQueue + tokenDelta);
};

export const updateWorld = (world: WorldState, snapshot: AgentSnapshot, dtSeconds: number): void => {
  const dt = Math.min(0.08, Math.max(0, dtSeconds));
  world.elapsed += dt;
  if (snapshot.active) updateActiveWorld(world, snapshot, dt);
  else updateRecoveryWorld(world, dt);
  updateTrees(world, snapshot.active, dt);
  updateParticles(world, dt);
};

export const getWorldMetrics = (world: WorldState): WorldMetrics => ({
  livingTrees: world.trees.filter((tree) => tree.stage === "grown" || tree.stage === "sapling").length,
  burningTrees: world.trees.filter((tree) => tree.stage === "burning").length,
  charredTrees: world.trees.filter((tree) => tree.stage === "charred").length,
  waterPercent: Math.round(world.water * 100),
  destructionScore: Math.floor(world.destructionScore + world.tokenProduced / 120),
  restorationScore: Math.floor(world.restorationScore),
});
