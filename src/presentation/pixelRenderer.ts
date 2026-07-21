import { effortMultiplier, type AgentSnapshot } from "../domain/agent";
import { getWorldMetrics, type Particle, type Tree, type WorldState } from "../domain/world";
import { SCENE_LAYOUT } from "./sceneLayout";
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
  ctx.fillStyle = world.heat > 0.67 ? "rgba(122,129,120,.74)" : "rgba(64,155,183,.86)";
  ctx.beginPath();
  ctx.ellipse(278, waterY, 37, Math.max(8, waterHeight), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = world.heat > 0.67 ? "#b5a985" : "#a8edf1";
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.restore();

  if (world.heat < 0.72) {
    ctx.save();
    ctx.globalAlpha = 0.25;
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
      return !active && tree.id % 9 === 0 ? "treeRecovery" : "treeHealthy";
  }
};

const drawTrees = (ctx: CanvasRenderingContext2D, world: WorldState, active: boolean, atlas: SpriteAtlas): void => {
  const visible = world.trees.filter((tree) => tree.id % 2 === 0 || tree.stage !== "grown");
  visible.sort((a, b) => a.y - b.y);
  for (const tree of visible) {
    const growthScale = tree.stage === "sapling" ? 0.56 : 1;
    const width = 28 * tree.size * growthScale;
    const height = 39 * tree.size * growthScale;
    const sway = Math.sin(tree.sway) * (tree.stage === "burning" ? 0.045 : 0.018);
    drawGroundShadow(ctx, tree.x, tree.y + 11, width * 0.3, Math.max(1.2, height * 0.055), 0.13);
    atlas.draw(ctx, treeSprite(tree, active), tree.x, tree.y + 10, width, height, {
      rotation: sway,
      alpha: tree.stage === "charred" ? 0.94 : 1,
    });
    if (tree.stage === "burning") {
      const pulse = 1 + Math.sin(world.elapsed * 11 + tree.id) * 0.12;
      atlas.draw(ctx, "flame", tree.x, tree.y - 10, 17 * pulse, 24 * pulse, { anchorY: 1 });
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
  const forge = SCENE_LAYOUT.forge;

  if (snapshot.active) {
    const glow = ctx.createRadialGradient(forge.x, 132, 3, forge.x, 132, 53);
    glow.addColorStop(0, `rgba(255,151,42,${0.19 + world.heat * 0.17})`);
    glow.addColorStop(1, "rgba(255,104,31,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(forge.x - 55, 77, 110, 95);
  }

  drawGroundShadow(ctx, forge.x, forge.y + 3, 41, 7, 0.26);
  atlas.draw(
    ctx,
    snapshot.active ? "forgeActive" : "forgeRecovery",
    forge.x,
    forge.y,
    forge.width * pulse,
    forge.height * pulse,
    { anchorY: 1 },
  );

  if (snapshot.active) {
    atlas.draw(ctx, "smoke", forge.x + 1, 84, 27, 39, {
      rotation: Math.sin(world.elapsed * 1.4) * 0.08,
      alpha: 0.5 + world.pollution * 0.34,
    });
    atlas.draw(ctx, "smoke", forge.x + 20, 79, 20, 31, {
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
  const assistants = Math.min(SCENE_LAYOUT.active.subagents.length, Math.max(0, snapshot.activeSessions - 1));
  for (let index = 0; index < assistants; index += 1) {
    const placement = SCENE_LAYOUT.active.subagents[index];
    const bob = Math.sin(world.elapsed * 5.2 + index * 1.7) * 0.75;
    const y = placement.y + bob;

    // A small catwalk makes these read as intentional workers, not sprites floating over the forge.
    drawRoundedRect(ctx, placement.x - 9, placement.y - 2, 18, 3, 1.5, "rgba(83,52,31,.9)");
    atlas.draw(ctx, "cinder", placement.x, y, placement.width, placement.height, {
      flipX: placement.flipX,
      alpha: 0.94,
    });
    atlas.draw(
      ctx,
      "tokenCrystal",
      placement.x + placement.crystalOffsetX,
      y - 10,
      7,
      12,
      {
        rotation: Math.sin(world.elapsed * 3 + index) * 0.08,
        alpha: 0.92,
      },
    );
  }
};

const drawActiveCrew = (
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  snapshot: AgentSnapshot,
  atlas: SpriteAtlas,
): void => {
  const layout = SCENE_LAYOUT.active;
  const intensity = effortMultiplier(snapshot.effort);
  const isError = snapshot.status === "error";
  const isHolding = snapshot.status === "thinking" || snapshot.status === "compacting";
  const isStriking = snapshot.status === "working";
  const toolBoost = snapshot.tool === "apply_patch" ? 1.18 : snapshot.tool === "shell" ? 1.08 : 1;
  const hammerSpeed = (4.8 + intensity * 1.35) * toolBoost;
  const hammerCycle = world.elapsed * hammerSpeed;
  const hammerSwing = isError
    ? -0.18 + Math.sin(world.elapsed * 11) * 0.06
    : isHolding
      ? -0.88 + Math.sin(world.elapsed * 1.8) * 0.08
      : -0.88 + ((Math.sin(hammerCycle) + 1) * 0.5) * 1.05;
  const impact = isStriking ? Math.pow(Math.max(0, Math.sin(hammerCycle)), 7) : 0;
  const emberBob = Math.sin(world.elapsed * (isHolding ? 2.2 : 5.6)) * (isHolding ? 0.45 : 0.95) - impact * 1.15;

  // Hauling sits behind the forge king so the route can pass nearby without visual collisions.
  const route = layout.cart.maxX - layout.cart.minX;
  const activityFactor = isHolding ? 0.38 : isError ? 0.12 : 1;
  const cartSpeed = ((snapshot.tool === "shell" ? 7.7 : 6.1) + intensity * 1.2) * activityFactor;
  const phase = (world.elapsed * cartSpeed) % (route * 2);
  const travellingRight = phase <= route;
  const travel = travellingRight ? phase : route * 2 - phase;
  const cartX = layout.cart.minX + travel;
  const wheelBob = Math.sin(world.elapsed * Math.max(1, cartSpeed) * 1.9) * 0.35 * activityFactor;
  const axleX = cartX + (travellingRight ? 31 : -13);

  drawGroundShadow(ctx, cartX, layout.cart.y + 1, 18, 3, 0.2);
  atlas.draw(ctx, "logCart", cartX, layout.cart.y + wheelBob, layout.cart.width, layout.cart.height, {
    flipX: !travellingRight,
    rotation: wheelBob * 0.008,
  });
  atlas.draw(ctx, "logs", cartX, layout.logs.y + wheelBob, layout.logs.width, layout.logs.height, {
    flipX: !travellingRight,
  });
  drawGroundShadow(ctx, axleX, layout.axle.y + 3, 14, 3, 0.2);
  atlas.draw(ctx, "axle", axleX, layout.axle.y + wheelBob, layout.axle.width, layout.axle.height, {
    flipX: travellingRight,
  });

  drawGroundShadow(ctx, layout.emberbeak.x, layout.emberbeak.y + 2, 17, 4, 0.24);
  // Draw the hammer first so Emberbeak's wing naturally covers the grip.
  atlas.draw(
    ctx,
    "hammer",
    layout.hammer.x,
    layout.hammer.y + emberBob,
    layout.hammer.width,
    layout.hammer.height,
    {
      rotation: hammerSwing,
      anchorX: layout.hammer.anchorX,
      anchorY: layout.hammer.anchorY,
    },
  );
  atlas.draw(
    ctx,
    "emberbeak",
    layout.emberbeak.x,
    layout.emberbeak.y + emberBob,
    layout.emberbeak.width,
    layout.emberbeak.height,
  );

  const cinderBob = Math.sin(world.elapsed * (6.8 + intensity) + 0.8) * (isHolding ? 0.7 : 1.35);
  drawGroundShadow(ctx, layout.cinder.x, layout.cinder.y + 2, 13, 3, 0.22);
  atlas.draw(
    ctx,
    "cinder",
    layout.cinder.x,
    layout.cinder.y + cinderBob,
    layout.cinder.width,
    layout.cinder.height,
  );
  atlas.draw(
    ctx,
    "tokenCrystal",
    layout.crystal.x,
    layout.crystal.y + cinderBob,
    layout.crystal.width,
    layout.crystal.height,
    { rotation: Math.sin(world.elapsed * (isHolding ? 1.4 : 3)) * 0.07 },
  );

  const vapoBob = Math.sin(world.elapsed * 2.6) * 0.9;
  drawGroundShadow(ctx, layout.vapo.x, layout.vapo.y + 2, 14, 3, 0.16);
  atlas.draw(ctx, "vapo", layout.vapo.x, layout.vapo.y + vapoBob, layout.vapo.width, layout.vapo.height, {
    alpha: 0.9,
    rotation: Math.sin(world.elapsed * 2) * 0.016,
  });

  if (impact > 0.38) {
    atlas.draw(ctx, "spark", 178, 158, 11 + impact * 6, 11 + impact * 6, {
      anchorX: 0.5,
      anchorY: 0.5,
      rotation: hammerCycle,
      alpha: clamp(impact, 0, 1),
    });
  }
};

const drawWateringDrops = (ctx: CanvasRenderingContext2D, world: WorldState): void => {
  ctx.save();
  ctx.strokeStyle = "#9ce8ef";
  ctx.lineWidth = 1.25;
  ctx.globalAlpha = 0.48 + Math.sin(world.elapsed * 5) * 0.12;
  for (let index = 0; index < 3; index += 1) {
    const progress = (world.elapsed * 1.8 + index * 0.31) % 1;
    const x = 213 + progress * 8;
    const y = 151 + progress * 13;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 1, y + 3);
    ctx.stroke();
  }
  ctx.restore();
};

const drawSleepBubbles = (ctx: CanvasRenderingContext2D, world: WorldState): void => {
  ctx.save();
  ctx.strokeStyle = "rgba(243,245,227,.72)";
  ctx.lineWidth = 1;
  for (let index = 0; index < 3; index += 1) {
    const phase = (world.elapsed * 0.38 + index * 0.28) % 1;
    const radius = 1.1 + phase * 1.7;
    ctx.globalAlpha = 0.25 + (1 - phase) * 0.55;
    ctx.beginPath();
    ctx.arc(263 + phase * 7, 105 - phase * 13 - index * 2, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
};

const drawRecoveryCrew = (ctx: CanvasRenderingContext2D, world: WorldState, atlas: SpriteAtlas): void => {
  const layout = SCENE_LAYOUT.recovery;
  const cloudX = layout.drizzle.x + Math.sin(world.elapsed * 0.65) * 11;
  const cloudY = layout.drizzle.y + Math.sin(world.elapsed * 1.3) * 1.4;
  atlas.draw(ctx, "drizzle", cloudX, cloudY, layout.drizzle.width, layout.drizzle.height, { anchorY: 0.5 });
  if (world.rain > 0.58) {
    atlas.draw(ctx, "rainCloud", cloudX - 34, cloudY + 2, 26, 26, { anchorY: 0.5, alpha: 0.52 });
  }

  atlas.draw(ctx, "shrub", 116, 169, 24, 24, { alpha: 0.78 });
  atlas.draw(ctx, "shrub", 164, 170, 18, 18, { alpha: 0.68, flipX: true });

  const sprigBob = Math.sin(world.elapsed * 3.5) * 1.05;
  drawGroundShadow(ctx, layout.spriglet.x, layout.spriglet.y + 3, 14, 3, 0.2);
  atlas.draw(
    ctx,
    "spriglet",
    layout.spriglet.x,
    layout.spriglet.y + sprigBob,
    layout.spriglet.width,
    layout.spriglet.height,
  );
  atlas.draw(
    ctx,
    "wateringCan",
    layout.wateringCan.x,
    layout.wateringCan.y + sprigBob,
    layout.wateringCan.width,
    layout.wateringCan.height,
    {
      rotation: -0.31 + Math.sin(world.elapsed * 2.8) * 0.09,
      anchorX: layout.wateringCan.anchorX,
      anchorY: layout.wateringCan.anchorY,
    },
  );
  drawWateringDrops(ctx, world);
  atlas.draw(
    ctx,
    "shrub",
    layout.targetShrub.x,
    layout.targetShrub.y,
    layout.targetShrub.width,
    layout.targetShrub.height,
    { alpha: 0.92 },
  );

  const idleBob = Math.sin(world.elapsed * 1.8) * 0.55;
  drawGroundShadow(ctx, layout.emberbeak.x, layout.emberbeak.y + 2, 13, 3, 0.17);
  atlas.draw(
    ctx,
    "emberbeak",
    layout.emberbeak.x,
    layout.emberbeak.y + idleBob,
    layout.emberbeak.width,
    layout.emberbeak.height,
    { alpha: 0.96 },
  );

  // Cinder naps on the forge roof. The bubbles make the elevated placement intentional.
  atlas.draw(
    ctx,
    "cinder",
    layout.sleepingCinder.x,
    layout.sleepingCinder.y - idleBob * 0.25,
    layout.sleepingCinder.width,
    layout.sleepingCinder.height,
    { alpha: 0.92, flipX: true },
  );
  drawSleepBubbles(ctx, world);

  const vapoBob = Math.sin(world.elapsed * 2.2) * 1.05;
  drawGroundShadow(ctx, layout.vapo.x, layout.vapo.y + 3, 16, 3, 0.18);
  atlas.draw(ctx, "vapo", layout.vapo.x, layout.vapo.y + vapoBob, layout.vapo.width, layout.vapo.height, {
    rotation: Math.sin(world.elapsed * 2) * 0.022,
  });
  atlas.draw(ctx, "splash", layout.vapo.x, layout.vapo.y + 2, 42, 21, {
    alpha: 0.36 + Math.sin(world.elapsed * 3.4) * 0.07,
  });

  drawGroundShadow(ctx, layout.axle.x, layout.axle.y + 2, 13, 3, 0.17);
  atlas.draw(ctx, "axle", layout.axle.x, layout.axle.y, layout.axle.width, layout.axle.height, { alpha: 0.94 });
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

    const showActiveScene = snapshot.active || snapshot.status === "error";
    drawBackdrop(ctx, world, snapshot);
    drawLake(ctx, world, this.atlas);
    drawTrees(ctx, world, showActiveScene, this.atlas);
    drawFactory(ctx, world, showActiveScene ? { ...snapshot, active: true } : snapshot, this.atlas);
    if (showActiveScene) {
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
