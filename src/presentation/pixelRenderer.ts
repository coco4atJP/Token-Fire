import { effortMultiplier, type AgentSnapshot } from "../domain/agent";
import { getWorldMetrics, type Particle, type Tree, type WorldState } from "../domain/world";
import { SpriteAtlas, type SpriteKey } from "./spriteAtlas";

const MAX_DEVICE_PIXEL_RATIO = 2;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

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

const drawGroundShadow = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  alpha = 0.2,
): void => {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#241711";
  ctx.beginPath();
  ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const drawBackdrop = (ctx: CanvasRenderingContext2D, world: WorldState, snapshot: AgentSnapshot): void => {
  const active = snapshot.active;
  const sky = ctx.createLinearGradient(0, 0, 0, world.height);
  if (snapshot.status === "error") {
    sky.addColorStop(0, "#713b3b");
    sky.addColorStop(0.55, "#79513f");
    sky.addColorStop(1, "#4f382c");
  } else if (active) {
    sky.addColorStop(0, `rgb(${Math.round(58 + world.heat * 45)}, 43, 48)`);
    sky.addColorStop(0.55, "#765543");
    sky.addColorStop(1, "#57442f");
  } else {
    sky.addColorStop(0, "#70adc4");
    sky.addColorStop(0.55, "#8fc2a3");
    sky.addColorStop(1, "#507449");
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, world.width, world.height);

  ctx.save();
  ctx.globalAlpha = active ? 0.16 : 0.24;
  ctx.fillStyle = active ? "#efb26a" : "#eef9d8";
  ctx.beginPath();
  ctx.arc(270, 35, active ? 27 : 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const cloudOffset = (world.elapsed * (active ? 1.2 : 2.1)) % 370;
  ctx.save();
  ctx.globalAlpha = active ? 0.08 + world.pollution * 0.14 : 0.12;
  ctx.fillStyle = active ? "#463d3e" : "#e9f6ed";
  for (let index = 0; index < 3; index += 1) {
    const x = ((index * 138 + cloudOffset) % 370) - 30;
    const y = 34 + index * 13;
    ctx.beginPath();
    ctx.ellipse(x, y, 23, 7, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 17, y - 4, 15, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = active ? "#61533b" : "#58744a";
  ctx.beginPath();
  ctx.ellipse(158, 165, 155, 49, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = active ? "#756246" : "#6d8d55";
  ctx.beginPath();
  ctx.ellipse(157, 158, 147, 39, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = active ? 0.15 : 0.22;
  ctx.strokeStyle = active ? "#e7b45b" : "#e2f6ba";
  ctx.lineWidth = 1;
  for (let x = 15; x < 305; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 164 + Math.sin(x) * 2);
    ctx.lineTo(x + 5, 153 + Math.cos(x) * 2);
    ctx.stroke();
  }
  ctx.restore();

  if (active && world.pollution > 0.18) {
    const haze = ctx.createLinearGradient(0, 65, 0, 150);
    haze.addColorStop(0, "rgba(54,45,47,0)");
    haze.addColorStop(1, `rgba(54,45,47,${world.pollution * 0.22})`);
    ctx.fillStyle = haze;
    ctx.fillRect(0, 65, world.width, 92);
  }
};

const drawLake = (ctx: CanvasRenderingContext2D, world: WorldState, atlas: SpriteAtlas): void => {
  const waterY = 145 + (1 - world.water) * 11;
  const waterHeight = 27 * world.water;
  ctx.fillStyle = world.heat > 0.67 ? "rgba(122,129,120,.78)" : "rgba(64,155,183,.9)";
  ctx.beginPath();
  ctx.ellipse(278, waterY, 37, Math.max(8, waterHeight), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = world.heat > 0.67 ? "#c7b68d" : "#a8edf1";
  ctx.lineWidth = 2;
  ctx.stroke();

  if (world.heat < 0.72) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = "#e5ffff";
    ctx.lineWidth = 1;
    for (let index = 0; index < 3; index += 1) {
      const shimmerX = 257 + ((world.elapsed * 8 + index * 17) % 43);
      ctx.beginPath();
      ctx.moveTo(shimmerX, waterY - 2 + index * 5);
      ctx.lineTo(shimmerX + 8, waterY - 2 + index * 5);
      ctx.stroke();
    }
    ctx.restore();
  }

  atlas.draw(ctx, "waterfall", 305, 157, 38, 31, { anchorX: 0.5, anchorY: 1, alpha: 0.94 });
};

const treeSprite = (tree: Tree, active: boolean): SpriteKey => {
  switch (tree.stage) {
    case "charred":
      return "treeScorched";
    case "burning":
      return tree.burn > 0.52 ? "treeScorched" : "treeHealthy";
    case "sapling":
      return "shrub";
    case "grown":
      return active ? "treeHealthy" : "treeRecovery";
  }
};

const drawTrees = (ctx: CanvasRenderingContext2D, world: WorldState, active: boolean, atlas: SpriteAtlas): void => {
  const visible = world.trees.filter((tree) => tree.id % 3 === 0 || tree.stage === "burning");
  visible.sort((a, b) => a.y - b.y);
  for (const tree of visible) {
    const growthScale = tree.stage === "sapling" ? 0.56 : 1;
    const width = 23 * tree.size * growthScale;
    const height = 32 * tree.size * growthScale;
    const sway = Math.sin(tree.sway) * (tree.stage === "burning" ? 0.045 : 0.018);
    drawGroundShadow(ctx, tree.x, tree.y + 11, width * 0.3, Math.max(1.2, height * 0.055), 0.13);
    atlas.draw(ctx, treeSprite(tree, active), tree.x, tree.y + 10, width, height, {
      rotation: sway,
      alpha: tree.stage === "charred" ? 0.92 : 1,
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
  const intensity = effortMultiplier(snapshot.effort);
  const pulseAmount = snapshot.active ? 0.013 + intensity * 0.005 : 0.009;
  const pulse = 1 + Math.sin(world.factoryPulse) * pulseAmount;
  drawGroundShadow(ctx, 238, 161, 41, 7, 0.26);
  atlas.draw(ctx, snapshot.active ? "forgeActive" : "forgeRecovery", 238, 158, 78 * pulse, 72 * pulse, {
    anchorY: 1,
  });

  if (snapshot.active) {
    atlas.draw(ctx, "smoke", 239, 84, 27, 39, {
      rotation: Math.sin(world.elapsed * 1.4) * 0.08,
      alpha: 0.5 + world.pollution * 0.34,
    });
    atlas.draw(ctx, "smoke", 258, 79, 20, 31, {
      rotation: -Math.sin(world.elapsed * 1.1) * 0.07,
      alpha: 0.38 + world.pollution * 0.3,
    });
  }
};

const drawSubagents = (
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  snapshot: AgentSnapshot,
  atlas: SpriteAtlas,
): void => {
  const assistants = Math.min(3, Math.max(0, snapshot.activeSessions - 1));
  for (let index = 0; index < assistants; index += 1) {
    const x = 216 + index * 20;
    const y = 132 + (index % 2) * 4 + Math.sin(world.elapsed * 5 + index) * 1.1;
    drawGroundShadow(ctx, x, y + 1, 8, 2, 0.16);
    atlas.draw(ctx, "cinder", x, y, 22, 25, { flipX: index % 2 === 1, alpha: 0.9 });
    atlas.draw(ctx, "tokenCrystal", x + (index % 2 === 1 ? -8 : 8), y - 11, 8, 13, {
      rotation: Math.sin(world.elapsed * 3 + index) * 0.08,
      alpha: 0.92,
    });
  }
};

const drawActiveCrew = (
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  snapshot: AgentSnapshot,
  atlas: SpriteAtlas,
): void => {
  const intensity = effortMultiplier(snapshot.effort);
  const hammerCycle = world.elapsed * (5.4 + intensity * 1.45);
  const hammerSwing = -0.72 + ((Math.sin(hammerCycle) + 1) * 0.5) * 1.12;
  const impact = Math.pow(Math.max(0, Math.sin(hammerCycle)), 7);
  const emberBob = Math.sin(world.elapsed * 5.8) * 1.05 - impact * 1.2;

  drawGroundShadow(ctx, 190, 166, 16, 3.8, 0.24);
  atlas.draw(ctx, "emberbeak", 190, 164 + emberBob, 49, 52);
  atlas.draw(ctx, "hammer", 170, 134 + emberBob, 31, 42, {
    rotation: hammerSwing,
    anchorX: 0.52,
    anchorY: 0.82,
  });

  if (impact > 0.38) {
    atlas.draw(ctx, "spark", 173, 156, 11 + impact * 6, 11 + impact * 6, {
      anchorX: 0.5,
      anchorY: 0.5,
      rotation: hammerCycle,
      alpha: clamp(impact, 0, 1),
    });
  }

  const cinderBob = Math.sin(world.elapsed * (7.2 + intensity) + 0.8) * 1.5;
  drawGroundShadow(ctx, 274, 166, 12, 3, 0.22);
  atlas.draw(ctx, "cinder", 274, 164 + cinderBob, 37, 41);
  atlas.draw(ctx, "tokenCrystal", 291, 137 + cinderBob, 16, 25, {
    rotation: Math.sin(world.elapsed * 3) * 0.07,
  });

  const route = 48;
  const phase = (world.elapsed * (6.4 + intensity * 1.4)) % (route * 2);
  const travellingRight = phase <= route;
  const travel = travellingRight ? phase : route * 2 - phase;
  const cartX = 96 + travel;
  const axleX = cartX + (travellingRight ? 31 : -11);
  drawGroundShadow(ctx, cartX, 169, 17, 3, 0.2);
  atlas.draw(ctx, "logCart", cartX, 168, 35, 26, { flipX: !travellingRight });
  atlas.draw(ctx, "logs", cartX, 151, 27, 20, { flipX: !travellingRight });
  drawGroundShadow(ctx, axleX, 168, 13, 3, 0.2);
  atlas.draw(ctx, "axle", axleX, 165, 39, 43, { flipX: travellingRight });

  const vapoBob = Math.sin(world.elapsed * 2.6) * 1.1;
  drawGroundShadow(ctx, 302, 168, 14, 3, 0.16);
  atlas.draw(ctx, "vapo", 302, 166 + vapoBob, 35, 34, {
    alpha: 0.88,
    rotation: Math.sin(world.elapsed * 2) * 0.018,
  });
};

const drawWateringDrops = (ctx: CanvasRenderingContext2D, world: WorldState): void => {
  ctx.save();
  ctx.strokeStyle = "#9ce8ef";
  ctx.lineWidth = 1.25;
  ctx.globalAlpha = 0.48 + Math.sin(world.elapsed * 5) * 0.12;
  for (let index = 0; index < 3; index += 1) {
    const progress = (world.elapsed * 1.8 + index * 0.31) % 1;
    const x = 224 + progress * 9;
    const y = 151 + progress * 12;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 1, y + 3);
    ctx.stroke();
  }
  ctx.restore();
};

const drawRecoveryCrew = (ctx: CanvasRenderingContext2D, world: WorldState, atlas: SpriteAtlas): void => {
  const cloudX = 230 + Math.sin(world.elapsed * 0.65) * 12;
  const cloudY = 61 + Math.sin(world.elapsed * 1.3) * 1.5;
  atlas.draw(ctx, "drizzle", cloudX, cloudY, 46, 46, { anchorY: 0.5 });
  if (world.rain > 0.58) {
    atlas.draw(ctx, "rainCloud", cloudX - 35, cloudY + 2, 27, 27, { anchorY: 0.5, alpha: 0.58 });
  }

  const sprigBob = Math.sin(world.elapsed * 3.5) * 1.1;
  drawGroundShadow(ctx, 193, 168, 13, 3, 0.2);
  atlas.draw(ctx, "spriglet", 193, 165 + sprigBob, 40, 44);
  atlas.draw(ctx, "wateringCan", 215, 151 + sprigBob, 29, 24, {
    rotation: -0.32 + Math.sin(world.elapsed * 2.8) * 0.1,
    anchorX: 0.58,
    anchorY: 0.72,
  });
  drawWateringDrops(ctx, world);
  atlas.draw(ctx, "shrub", 231, 168, 22, 22, { alpha: 0.92 });

  const vapoBob = Math.sin(world.elapsed * 2.2) * 1.2;
  drawGroundShadow(ctx, 286, 169, 17, 3, 0.18);
  atlas.draw(ctx, "vapo", 286, 166 + vapoBob, 40, 38, {
    rotation: Math.sin(world.elapsed * 2) * 0.025,
  });
  atlas.draw(ctx, "splash", 286, 168, 45, 22, {
    alpha: 0.42 + Math.sin(world.elapsed * 3.4) * 0.08,
  });

  const idleBob = Math.sin(world.elapsed * 1.8) * 0.65;
  drawGroundShadow(ctx, 248, 166, 12, 3, 0.17);
  atlas.draw(ctx, "emberbeak", 248, 163 + idleBob, 36, 39, { alpha: 0.92 });
  drawGroundShadow(ctx, 266, 166, 9, 2.5, 0.15);
  atlas.draw(ctx, "cinder", 266, 163 - idleBob * 0.5, 28, 31, { alpha: 0.88, flipX: true });
  drawGroundShadow(ctx, 151, 168, 12, 3, 0.17);
  atlas.draw(ctx, "axle", 151, 166, 34, 38, { alpha: 0.9 });
};

const drawStatusEffect = (
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  snapshot: AgentSnapshot,
  atlas: SpriteAtlas,
): void => {
  if (snapshot.status === "compacting") {
    for (let index = 0; index < 4; index += 1) {
      const angle = world.elapsed * 2.4 + index * (Math.PI / 2);
      atlas.draw(ctx, "token", 239 + Math.cos(angle) * 31, 116 + Math.sin(angle) * 14, 9, 9, {
        anchorX: 0.5,
        anchorY: 0.5,
        rotation: -angle,
        alpha: 0.78,
      });
    }
  }

  if (snapshot.status === "error") {
    const pulse = 0.15 + (Math.sin(world.elapsed * 9) * 0.5 + 0.5) * 0.1;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = "#ff3b28";
    ctx.fillRect(0, 0, world.width, world.height);
    ctx.restore();
    for (let index = 0; index < 5; index += 1) {
      const angle = world.elapsed * (1.8 + index * 0.08) + index * 1.2;
      atlas.draw(ctx, "spark", 239 + Math.cos(angle) * 34, 118 + Math.sin(angle) * 23, 10, 10, {
        anchorX: 0.5,
        anchorY: 0.5,
        rotation: angle,
        alpha: 0.84,
      });
    }
  }
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
      ctx.save();
      ctx.globalAlpha = alpha * 0.62;
      ctx.fillStyle = "#e9f5f0";
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
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
      ctx.save();
      ctx.globalAlpha = alpha * 0.68;
      ctx.strokeStyle = "#a6e9f3";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(particle.x - 2, particle.y + 7);
      ctx.stroke();
      ctx.restore();
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

  drawRoundedRect(ctx, 7, 7, 147, 28, 6, "rgba(27,22,20,.7)");
  ctx.fillStyle = snapshot.status === "error" ? "#ff8b72" : snapshot.active ? "#ffc24a" : "#c5ed94";
  const headline = snapshot.status === "error"
    ? "TOKEN FORGE · BLOCKED"
    : snapshot.active
      ? "TOKEN FORGE · ACTIVE"
      : "RECOVERY GROVE · RAIN";
  ctx.fillText(headline, 13, 11);
  ctx.fillStyle = "#f3eadb";
  const agentLabel = snapshot.activeSessions === 1 ? "AGENT" : "AGENTS";
  const detail = snapshot.active
    ? `${snapshot.effort.toUpperCase()} · ${Math.max(1, snapshot.activeSessions)} ${agentLabel} · +${snapshot.tokenDelta} TOK`
    : `RAIN ${Math.round(world.rain * 100)}% · WATER ${metrics.waterPercent}%`;
  ctx.fillText(detail, 13, 22);

  drawRoundedRect(ctx, 7, 169, 151, 17, 5, "rgba(27,22,20,.62)");
  ctx.fillStyle = "#eee4d3";
  ctx.fillText(`TREE ${metrics.livingTrees}  FIRE ${metrics.burningTrees}  ASH ${metrics.charredTrees}`, 12, 174);

  if (world.quoteVisible && snapshot.status !== "error") {
    drawRoundedRect(ctx, 163, 41, 149, 22, 7, "rgba(39,24,18,.84)");
    ctx.fillStyle = "#ffd65e";
    ctx.font = "700 8px sans-serif";
    ctx.fillText("環境破壊はたのしいZOY!!", 172, 48);
  }
};

const drawAssetMessage = (ctx: CanvasRenderingContext2D, world: WorldState, failed: boolean): void => {
  drawBackdrop(ctx, world, {
    active: false,
    status: failed ? "error" : "idle",
    activeSessions: 0,
    totalTokens: 0,
    tokenDelta: 0,
    effort: "medium",
    tool: null,
    sessionTitle: null,
    updatedAtMs: 0,
    source: "assets",
  });
  drawRoundedRect(ctx, 73, 73, 174, 46, 12, "rgba(28,23,22,.76)");
  ctx.fillStyle = failed ? "#ff9d81" : "#f4d27a";
  ctx.font = "700 10px sans-serif";
  ctx.fillText(failed ? "ASSET LOAD FAILED" : "TOKEN-FIRE ASSETS LOADING…", failed ? 105 : 94, 90);
  ctx.fillStyle = "rgba(244,234,219,.7)";
  ctx.font = "600 7px sans-serif";
  ctx.fillText(failed ? "sprites.svg を確認してください" : "小さな世界を準備しています", failed ? 104 : 111, 105);
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

  private prepareCanvas(world: WorldState): void {
    const dpr = clamp(window.devicePixelRatio || 1, 1, MAX_DEVICE_PIXEL_RATIO);
    const targetWidth = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const targetHeight = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
      this.context.imageSmoothingEnabled = true;
      this.context.imageSmoothingQuality = "high";
    }

    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const scale = Math.min(this.canvas.width / world.width, this.canvas.height / world.height);
    const offsetX = (this.canvas.width - world.width * scale) / 2;
    const offsetY = (this.canvas.height - world.height * scale) / 2;
    this.context.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  }

  render(world: WorldState, snapshot: AgentSnapshot): void {
    this.prepareCanvas(world);
    const ctx = this.context;

    if (!this.atlas.ready) {
      drawAssetMessage(ctx, world, this.atlas.state === "error");
      return;
    }

    drawBackdrop(ctx, world, snapshot);
    drawLake(ctx, world, this.atlas);
    drawTrees(ctx, world, snapshot.active, this.atlas);
    drawFactory(ctx, world, snapshot, this.atlas);
    if (snapshot.active) {
      drawSubagents(ctx, world, snapshot, this.atlas);
      drawActiveCrew(ctx, world, snapshot, this.atlas);
    } else {
      drawRecoveryCrew(ctx, world, this.atlas);
    }
    for (const particle of world.particles) drawParticle(ctx, particle, this.atlas);
    drawStatusEffect(ctx, world, snapshot, this.atlas);
    drawHud(ctx, world, snapshot);
  }
}
