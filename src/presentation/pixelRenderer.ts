import type { AgentSnapshot } from "../domain/agent";
import { getWorldMetrics, type Particle, type Tree, type WorldState } from "../domain/world";

const px = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

const drawSky = (ctx: CanvasRenderingContext2D, world: WorldState, active: boolean): void => {
  const heat = world.heat;
  const pollution = world.pollution;
  ctx.fillStyle = active
    ? `rgb(${Math.round(48 + heat * 55)}, ${Math.round(40 - pollution * 12)}, ${Math.round(54 - pollution * 18)})`
    : `rgb(${Math.round(35 - pollution * 8)}, ${Math.round(60 + world.rain * 18)}, ${Math.round(78 + world.rain * 24)})`;
  ctx.fillRect(0, 0, world.width, world.height);

  px(ctx, 18, 18, 55, 8, active ? "#6f5551" : "#8194a4");
  px(ctx, 27, 12, 32, 8, active ? "#77605a" : "#91a5b3");
  px(ctx, 83, 27, 44, 6, active ? "#70504a" : "#758b9c");
  px(ctx, 91, 21, 25, 7, active ? "#785a53" : "#8499a9");

  const horizon = 56;
  px(ctx, 0, horizon, world.width, world.height - horizon, active ? "#5b5539" : "#516d45");
  for (let y = horizon; y < world.height; y += 8) {
    const stripe = ((y - horizon) / 8) % 2 === 0 ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.028)";
    px(ctx, 0, y, world.width, 8, stripe);
  }
};

const drawLake = (ctx: CanvasRenderingContext2D, world: WorldState): void => {
  const waterHeight = 35 * world.water;
  const y = 157 - waterHeight;
  px(ctx, 266, 135, 54, 31, "#443b37");
  px(ctx, 270, y, 50, waterHeight, world.heat > 0.65 ? "#7f7564" : "#3a7180");
  px(ctx, 274, y + 4, 40, 3, world.heat > 0.65 ? "#a69b7b" : "#70a4aa");
  px(ctx, 282, y + 12, 28, 2, "rgba(255,255,255,0.22)");
  for (let x = 269; x < 319; x += 7) {
    px(ctx, x, 163, 5, 3, "#332f2d");
  }
};

const drawTree = (ctx: CanvasRenderingContext2D, tree: Tree, world: WorldState): void => {
  const s = tree.size;
  const sway = Math.sin(tree.sway) * (tree.stage === "burning" ? 1.3 : 0.55);
  const x = tree.x + sway;
  const y = tree.y;
  if (tree.stage === "charred") {
    px(ctx, x - 1 * s, y - 17 * s, 3 * s, 18 * s, "#272221");
    px(ctx, x - 7 * s, y - 13 * s, 7 * s, 2 * s, "#302625");
    px(ctx, x + 1 * s, y - 10 * s, 6 * s, 2 * s, "#302625");
    return;
  }
  if (tree.stage === "sapling") {
    px(ctx, x, y - 8 * s, 2 * s, 9 * s, "#6e4c2c");
    px(ctx, x - 5 * s, y - 10 * s, 6 * s, 5 * s, "#5b8e49");
    px(ctx, x + 1 * s, y - 13 * s, 6 * s, 6 * s, "#6da257");
    return;
  }

  px(ctx, x - 2 * s, y - 21 * s, 5 * s, 22 * s, tree.stage === "burning" ? "#4a3027" : "#6d482b");
  const leafDark = tree.stage === "burning" ? "#6d3a23" : "#315c36";
  const leafMid = tree.stage === "burning" ? "#9b4c21" : "#417546";
  const leafLight = tree.stage === "burning" ? "#c45d20" : "#589456";
  px(ctx, x - 10 * s, y - 33 * s, 20 * s, 12 * s, leafDark);
  px(ctx, x - 7 * s, y - 39 * s, 15 * s, 11 * s, leafMid);
  px(ctx, x - 12 * s, y - 28 * s, 24 * s, 9 * s, leafMid);
  px(ctx, x - 5 * s, y - 35 * s, 10 * s, 7 * s, leafLight);
  if (tree.stage === "burning") {
    const flame = 4 + Math.sin(world.elapsed * 12 + tree.id) * 2;
    px(ctx, x - 5 * s, y - 43 * s, 4 * s, flame * s, "#ffb12f");
    px(ctx, x, y - 47 * s, 5 * s, (flame + 2) * s, "#ff6f22");
    px(ctx, x + 5 * s, y - 40 * s, 4 * s, flame * 0.8 * s, "#ffd55a");
  }
};

const drawFactory = (ctx: CanvasRenderingContext2D, world: WorldState, snapshot: AgentSnapshot): void => {
  const active = snapshot.active;
  const pulse = Math.sin(world.factoryPulse) * 0.5 + 0.5;
  px(ctx, 215, 112, 45, 48, "#28292e");
  px(ctx, 221, 104, 34, 10, "#3a3b42");
  px(ctx, 230, 78, 12, 34, "#2b2c31");
  px(ctx, 228, 74, 16, 6, "#41434a");
  px(ctx, 249, 93, 8, 21, "#34363c");
  px(ctx, 247, 89, 12, 5, "#464952");
  px(ctx, 220, 121, 15, 19, "#17181d");
  px(ctx, 238, 121, 15, 19, "#17181d");
  px(ctx, 223, 125, 9, 11, active ? (pulse > 0.5 ? "#ff8128" : "#d94b21") : "#34343a");
  px(ctx, 241, 125, 9, 11, active ? "#ffb13b" : "#34343a");
  px(ctx, 217, 145, 41, 5, "#4f4140");
  px(ctx, 212, 154, 54, 7, "#332f31");
  if (active) {
    px(ctx, 225, 137, 5, 8 + pulse * 5, "#ffcc4a");
    px(ctx, 230, 133, 6, 12 + pulse * 6, "#ff6d21");
    px(ctx, 236, 137, 5, 8 + pulse * 4, "#ffb12e");
  }

  px(ctx, 257, 140, 34, 5, "#2b2d32");
  px(ctx, 263, 136, 6, 4, active ? "#d86d28" : "#41434a");
  px(ctx, 274, 136, 6, 4, active ? "#d86d28" : "#41434a");
  px(ctx, 285, 136, 6, 4, active ? "#d86d28" : "#41434a");
};

const drawKing = (ctx: CanvasRenderingContext2D, world: WorldState, snapshot: AgentSnapshot): void => {
  const active = snapshot.active;
  const bob = Math.sin(world.elapsed * (active ? 7 : 2)) * (active ? 1.5 : 0.5);
  const x = 197;
  const y = 151 + bob;
  px(ctx, x - 8, y - 21, 17, 20, "#5d4b82");
  px(ctx, x - 6, y - 24, 13, 8, "#7560a0");
  px(ctx, x - 4, y - 20, 3, 3, "#f5e8c8");
  px(ctx, x + 3, y - 20, 3, 3, "#f5e8c8");
  px(ctx, x - 3, y - 19, 1, 1, "#19181d");
  px(ctx, x + 4, y - 19, 1, 1, "#19181d");
  px(ctx, x - 5, y - 29, 3, 6, "#e4b532");
  px(ctx, x, y - 31, 3, 8, "#f2c43a");
  px(ctx, x + 5, y - 29, 3, 6, "#e4b532");
  px(ctx, x - 7, y - 25, 16, 3, "#c58f26");
  px(ctx, x - 7, y - 2, 5, 4, "#2a2636");
  px(ctx, x + 4, y - 2, 5, 4, "#2a2636");
  if (active) {
    const swing = Math.sin(world.elapsed * 8);
    px(ctx, x + 8 + swing * 2, y - 24, 3, 21, "#6e4b2d");
    px(ctx, x + 4 + swing * 2, y - 28, 12, 7, "#d3a638");
  } else {
    px(ctx, x + 8, y - 17, 2, 14, "#76512e");
    px(ctx, x + 4, y - 22, 10, 7, "#4d8b56");
    px(ctx, x + 6, y - 24, 6, 4, "#6aaa65");
  }
};

const drawParticle = (ctx: CanvasRenderingContext2D, particle: Particle): void => {
  const alpha = Math.max(0, particle.life / particle.maxLife);
  ctx.globalAlpha = alpha;
  switch (particle.kind) {
    case "smoke":
      px(ctx, particle.x, particle.y, particle.size, particle.size, alpha > 0.5 ? "#47454b" : "#656168");
      break;
    case "steam":
      px(ctx, particle.x, particle.y, particle.size, particle.size, "#c8d0ca");
      break;
    case "ember":
      px(ctx, particle.x, particle.y, particle.size, particle.size, "#ff8a29");
      break;
    case "rain":
      px(ctx, particle.x, particle.y, 1, 5, "#8ec7d7");
      break;
    case "token":
      px(ctx, particle.x - 2, particle.y, 5, 5, "#ffc83d");
      px(ctx, particle.x - 1, particle.y + 1, 3, 3, "#fff0a1");
      break;
    case "spark":
      px(ctx, particle.x, particle.y, particle.size, particle.size, "#ffe374");
      break;
  }
  ctx.globalAlpha = 1;
};

const drawHud = (ctx: CanvasRenderingContext2D, world: WorldState, snapshot: AgentSnapshot): void => {
  const metrics = getWorldMetrics(world);
  ctx.font = "8px monospace";
  ctx.textBaseline = "top";
  px(ctx, 7, 7, 138, 27, "rgba(13,14,18,0.68)");
  ctx.fillStyle = snapshot.active ? "#ffb33b" : "#9bd2a2";
  ctx.fillText(snapshot.active ? "CODEX: DESTROYING" : "CODEX: RECOVERING", 12, 11);
  ctx.fillStyle = "#d8d7d0";
  const detail = snapshot.active
    ? `${snapshot.effort.toUpperCase()}  x${Math.max(1, snapshot.activeSessions)}  +${snapshot.tokenDelta} tok`
    : `RAIN ${Math.round(world.rain * 100)}%  WATER ${metrics.waterPercent}%`;
  ctx.fillText(detail, 12, 22);

  px(ctx, 7, 164, 150, 20, "rgba(13,14,18,0.64)");
  ctx.fillStyle = "#d6d1c3";
  ctx.fillText(`TREE ${metrics.livingTrees}  FIRE ${metrics.burningTrees}  ASH ${metrics.charredTrees}`, 12, 168);
  ctx.fillStyle = "#aaa69c";
  ctx.fillText(`DESTROY ${metrics.destructionScore} / RESTORE ${metrics.restorationScore}`, 12, 177);

  if (world.quoteVisible) {
    px(ctx, 166, 17, 145, 21, "rgba(19,15,18,0.82)");
    ctx.fillStyle = "#ffd052";
    ctx.fillText("環境破壊はたのしいZOY!!", 174, 23);
  }
};

export class PixelRenderer {
  private readonly context: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Canvas 2D is unavailable");
    this.context = context;
    context.imageSmoothingEnabled = false;
  }

  render(world: WorldState, snapshot: AgentSnapshot): void {
    const ctx = this.context;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    drawSky(ctx, world, snapshot.active);
    drawLake(ctx, world);
    const orderedTrees = [...world.trees].sort((a, b) => a.y - b.y);
    for (const tree of orderedTrees) drawTree(ctx, tree, world);
    drawFactory(ctx, world, snapshot);
    drawKing(ctx, world, snapshot);
    for (const particle of world.particles) drawParticle(ctx, particle);
    drawHud(ctx, world, snapshot);
  }
}
