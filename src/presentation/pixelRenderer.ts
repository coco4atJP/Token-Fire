import type { AgentSnapshot } from "../domain/agent";
import { getWorldMetrics, type Particle, type Tree, type WorldState } from "../domain/world";
import { SpriteAtlas, type SpriteKey } from "./spriteAtlas";

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
): void => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
};

const drawBackdrop = (ctx: CanvasRenderingContext2D, world: WorldState, active: boolean): void => {
  const sky = ctx.createLinearGradient(0, 0, 0, world.height);
  if (active) {
    sky.addColorStop(0, `rgb(${Math.round(58 + world.heat * 45)}, 43, 48)`);
    sky.addColorStop(0.55, "#765543");
    sky.addColorStop(1, "#57442f");
  } else {
    sky.addColorStop(0, "#6da7bd");
    sky.addColorStop(0.55, "#86b99d");
    sky.addColorStop(1, "#4f7147");
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, world.width, world.height);

  ctx.globalAlpha = 0.18;
  ctx.fillStyle = active ? "#efb26a" : "#e5f4d3";
  ctx.beginPath();
  ctx.arc(270, 35, 27, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = active ? "#61533b" : "#58744a";
  ctx.beginPath();
  ctx.ellipse(158, 165, 155, 49, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = active ? "#756246" : "#6d8d55";
  ctx.beginPath();
  ctx.ellipse(157, 158, 147, 39, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = active ? "#e7b45b" : "#d7f1b0";
  ctx.lineWidth = 1;
  for (let x = 15; x < 305; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 164 + Math.sin(x) * 2);
    ctx.lineTo(x + 5, 153 + Math.cos(x) * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

const drawLake = (ctx: CanvasRenderingContext2D, world: WorldState, atlas: SpriteAtlas): void => {
  const waterY = 145 + (1 - world.water) * 11;
  const waterHeight = 27 * world.water;
  ctx.fillStyle = world.heat > 0.67 ? "rgba(122,129,120,.78)" : "rgba(64,155,183,.88)";
  ctx.beginPath();
  ctx.ellipse(278, waterY, 37, Math.max(8, waterHeight), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = world.heat > 0.67 ? "#c7b68d" : "#9de9ee";
  ctx.lineWidth = 2;
  ctx.stroke();
  atlas.draw(ctx, "waterfall", 305, 157, 38, 31, { anchorX: 0.5, anchorY: 1, alpha: 0.9 });
};

const treeSprite = (tree: Tree, active: boolean): SpriteKey => {
  switch (tree.stage) {
    case "charred":
      return "treeScorched";
    case "burning":
      return "treeHealthy";
    case "sapling":
      return active ? "shrub" : "treeRecovery";
    case "grown":
      return active ? "treeHealthy" : "treeRecovery";
  }
};

const drawTrees = (ctx: CanvasRenderingContext2D, world: WorldState, active: boolean, atlas: SpriteAtlas): void => {
  const visible = world.trees.filter((tree) => tree.id % 3 === 0 || tree.stage === "burning");
  visible.sort((a, b) => a.y - b.y);
  for (const tree of visible) {
    const width = 23 * tree.size;
    const height = 32 * tree.size;
    const sway = Math.sin(tree.sway) * (tree.stage === "burning" ? 0.045 : 0.018);
    atlas.draw(ctx, treeSprite(tree, active), tree.x, tree.y + 10, width, height, {
      rotation: sway,
      alpha: tree.stage === "charred" ? 0.9 : 1,
    });
    if (tree.stage === "burning") {
      const pulse = 1 + Math.sin(world.elapsed * 11 + tree.id) * 0.12;
      atlas.draw(ctx, "flame", tree.x, tree.y - 9, 14 * pulse, 20 * pulse, { anchorY: 1 });
    }
  }
};

const drawFactory = (
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  snapshot: AgentSnapshot,
  atlas: SpriteAtlas,
): void => {
  const pulse = 1 + Math.sin(world.factoryPulse) * 0.018;
  atlas.draw(ctx, snapshot.active ? "forgeActive" : "forgeRecovery", 238, 158, 78 * pulse, 72 * pulse, {
    anchorY: 1,
  });

  if (snapshot.active) {
    atlas.draw(ctx, "smoke", 239, 84, 27, 39, {
      rotation: Math.sin(world.elapsed * 1.4) * 0.08,
      alpha: 0.55 + world.pollution * 0.35,
    });
    atlas.draw(ctx, "smoke", 258, 79, 20, 31, {
      rotation: -Math.sin(world.elapsed * 1.1) * 0.07,
      alpha: 0.42 + world.pollution * 0.32,
    });
  }
};

const drawActiveCrew = (ctx: CanvasRenderingContext2D, world: WorldState, atlas: SpriteAtlas): void => {
  const hammerSwing = -0.48 + Math.sin(world.elapsed * 7.5) * 0.42;
  const emberBob = Math.sin(world.elapsed * 5.8) * 1.2;
  atlas.draw(ctx, "emberbeak", 190, 164 + emberBob, 48, 51);
  atlas.draw(ctx, "hammer", 170, 134 + emberBob, 31, 42, {
    rotation: hammerSwing,
    anchorX: 0.52,
    anchorY: 0.82,
  });

  const cinderBob = Math.sin(world.elapsed * 8 + 0.8) * 1.8;
  atlas.draw(ctx, "cinder", 270, 164 + cinderBob, 37, 41);
  atlas.draw(ctx, "tokenCrystal", 287, 137 + cinderBob, 16, 25, {
    rotation: Math.sin(world.elapsed * 3) * 0.07,
  });

  const travel = (world.elapsed * 10) % 24;
  atlas.draw(ctx, "logCart", 128 + travel, 168, 35, 26);
  atlas.draw(ctx, "logs", 128 + travel, 151, 27, 20);
  atlas.draw(ctx, "axle", 158 + travel, 165, 39, 43, { flipX: true });

  atlas.draw(ctx, "vapo", 292, 166, 36, 35, { alpha: 0.84 });
};

const drawRecoveryCrew = (ctx: CanvasRenderingContext2D, world: WorldState, atlas: SpriteAtlas): void => {
  const cloudX = 228 + Math.sin(world.elapsed * 0.65) * 12;
  atlas.draw(ctx, "rainCloud", cloudX, 61, 45, 45, { anchorY: 0.5 });

  const sprigBob = Math.sin(world.elapsed * 3.5) * 1.2;
  atlas.draw(ctx, "spriglet", 198, 165 + sprigBob, 39, 43);
  atlas.draw(ctx, "wateringCan", 218, 151 + sprigBob, 29, 24, {
    rotation: -0.28 + Math.sin(world.elapsed * 2.8) * 0.12,
    anchorX: 0.58,
    anchorY: 0.72,
  });

  atlas.draw(ctx, "vapo", 282, 166, 39, 37, {
    alpha: 0.98,
    rotation: Math.sin(world.elapsed * 2) * 0.025,
  });
  atlas.draw(ctx, "splash", 282, 167, 44, 22, { alpha: 0.55 });

  atlas.draw(ctx, "emberbeak", 246, 163, 35, 38, { alpha: 0.74 });
  atlas.draw(ctx, "cinder", 264, 163, 27, 31, { alpha: 0.62 });
  atlas.draw(ctx, "axle", 155, 166, 33, 37, { alpha: 0.78 });
};

const drawParticle = (ctx: CanvasRenderingContext2D, particle: Particle, atlas: SpriteAtlas): void => {
  const alpha = Math.max(0, particle.life / particle.maxLife);
  switch (particle.kind) {
    case "smoke":
      atlas.draw(ctx, "smoke", particle.x, particle.y, particle.size * 5.4, particle.size * 7.1, {
        alpha: alpha * 0.6,
        rotation: particle.x * 0.01,
      });
      return;
    case "steam":
      ctx.globalAlpha = alpha * 0.65;
      ctx.fillStyle = "#e9f5f0";
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    case "ember":
    case "spark":
      atlas.draw(ctx, "spark", particle.x, particle.y, particle.size * 5.5, particle.size * 5.5, {
        alpha,
        anchorX: 0.5,
        anchorY: 0.5,
      });
      return;
    case "rain":
      ctx.globalAlpha = alpha * 0.7;
      ctx.strokeStyle = "#9fe4f1";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(particle.x - 2, particle.y + 7);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    case "token":
      atlas.draw(ctx, "token", particle.x, particle.y, particle.size * 4.4, particle.size * 4.4, {
        alpha,
        anchorX: 0.5,
        anchorY: 0.5,
        rotation: particle.life * 4,
      });
      return;
  }
};

const drawHud = (ctx: CanvasRenderingContext2D, world: WorldState, snapshot: AgentSnapshot): void => {
  const metrics = getWorldMetrics(world);
  ctx.font = "600 7px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.textBaseline = "top";

  drawRoundedRect(ctx, 7, 7, 147, 28, 6, "rgba(27,22,20,.72)");
  ctx.fillStyle = snapshot.active ? "#ffc24a" : "#bde786";
  ctx.fillText(snapshot.active ? "TOKEN FORGE · ACTIVE" : "RECOVERY GROVE · RAIN", 13, 11);
  ctx.fillStyle = "#f3eadb";
  const detail = snapshot.active
    ? `${snapshot.effort.toUpperCase()} · ${Math.max(1, snapshot.activeSessions)} AGENT · +${snapshot.tokenDelta} TOK`
    : `RAIN ${Math.round(world.rain * 100)}% · WATER ${metrics.waterPercent}%`;
  ctx.fillText(detail, 13, 22);

  drawRoundedRect(ctx, 7, 169, 166, 17, 5, "rgba(27,22,20,.65)");
  ctx.fillStyle = "#eee4d3";
  ctx.fillText(`TREE ${metrics.livingTrees}  FIRE ${metrics.burningTrees}  ASH ${metrics.charredTrees}`, 12, 174);

  if (world.quoteVisible) {
    drawRoundedRect(ctx, 163, 13, 149, 22, 7, "rgba(39,24,18,.86)");
    ctx.fillStyle = "#ffd65e";
    ctx.font = "700 8px sans-serif";
    ctx.fillText("環境破壊はたのしいZOY!!", 172, 20);
  }
};

const drawLoading = (ctx: CanvasRenderingContext2D, world: WorldState): void => {
  drawBackdrop(ctx, world, false);
  drawRoundedRect(ctx, 79, 75, 162, 42, 12, "rgba(28,23,22,.72)");
  ctx.fillStyle = "#f4d27a";
  ctx.font = "700 10px sans-serif";
  ctx.fillText("TOKEN-FIRE ASSETS LOADING…", 94, 91);
};

export class PixelRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly atlas: SpriteAtlas;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Canvas 2D is unavailable");
    this.context = context;
    this.context.imageSmoothingEnabled = true;
    this.context.imageSmoothingQuality = "high";
    this.atlas = new SpriteAtlas();
  }

  render(world: WorldState, snapshot: AgentSnapshot): void {
    const ctx = this.context;
    const scaleX = this.canvas.width / world.width;
    const scaleY = this.canvas.height / world.height;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.clearRect(0, 0, world.width, world.height);

    if (!this.atlas.ready) {
      drawLoading(ctx, world);
      return;
    }

    drawBackdrop(ctx, world, snapshot.active);
    drawLake(ctx, world, this.atlas);
    drawTrees(ctx, world, snapshot.active, this.atlas);
    drawFactory(ctx, world, snapshot, this.atlas);
    if (snapshot.active) drawActiveCrew(ctx, world, this.atlas);
    else drawRecoveryCrew(ctx, world, this.atlas);
    for (const particle of world.particles) drawParticle(ctx, particle, this.atlas);
    drawHud(ctx, world, snapshot);
  }
}
