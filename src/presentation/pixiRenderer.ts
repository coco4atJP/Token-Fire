import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  type Texture,
} from "pixi.js";
import type { WorldRenderer } from "../application/worldRenderer";
import { effortMultiplier, type AgentSnapshot } from "../domain/agent";
import type { CharacterId, CharacterMood } from "../domain/character";
import { getWorldMetrics, type Particle, type Tree, type WorldState } from "../domain/world";
import { SCENE_LAYOUT } from "./sceneLayout";
import type { PresentationMotionPolicy } from "./presentationMotionPolicy";
import { SpriteAtlas, type ExpressionFrame, type SpriteKey } from "./spriteAtlas";
import { StageViewport, STAGE_HEIGHT, STAGE_WIDTH } from "./stageViewport";

const WORLD_WIDTH = STAGE_WIDTH;
const WORLD_HEIGHT = STAGE_HEIGHT;
const MAX_DEVICE_PIXEL_RATIO = 2;

interface SpriteOptions {
  alpha?: number;
  rotation?: number;
  flipX?: boolean;
  anchorX?: number;
  anchorY?: number;
  expressionFrame?: ExpressionFrame;
  tint?: number;
}

interface TextOptions {
  color: number;
  size: number;
  weight?: "500" | "600" | "700" | "800";
  family?: string;
  letterSpacing?: number;
}

const CHARACTER_EXPRESSION_FRAMES: Record<CharacterId, Record<CharacterMood, ExpressionFrame>> = {
  hinoko: { proud: 2, busy: 2, sleepy: 1, scheming: 3, chill: 1, surprised: 4 },
  mebuki: { proud: 2, busy: 1, sleepy: 4, scheming: 1, chill: 4, surprised: 3 },
  fuwame: { proud: 1, busy: 1, sleepy: 4, scheming: 2, chill: 1, surprised: 3 },
  sumi: { proud: 2, busy: 2, sleepy: 3, scheming: 1, chill: 3, surprised: 4 },
  mizumo: { proud: 1, busy: 4, sleepy: 3, scheming: 4, chill: 1, surprised: 2 },
  kururi: { proud: 2, busy: 1, sleepy: 1, scheming: 3, chill: 1, surprised: 4 },
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const color = (red: number, green: number, blue: number): number =>
  (clamp(Math.round(red), 0, 255) << 16)
  | (clamp(Math.round(green), 0, 255) << 8)
  | clamp(Math.round(blue), 0, 255);

class SpritePool {
  readonly container = new Container();
  private readonly sprites: Sprite[] = [];
  private cursor = 0;

  begin(): void {
    this.cursor = 0;
  }

  add(
    texture: Texture,
    x: number,
    y: number,
    width: number,
    height: number,
    options: SpriteOptions = {},
  ): Sprite {
    const sprite = this.sprites[this.cursor] ?? new Sprite({ texture });
    if (!this.sprites[this.cursor]) {
      this.sprites.push(sprite);
      this.container.addChild(sprite);
    }
    this.cursor += 1;
    sprite.visible = true;
    sprite.texture = texture;
    sprite.anchor.set(options.anchorX ?? 0.5, options.anchorY ?? 1);
    sprite.position.set(x, y);
    sprite.rotation = options.rotation ?? 0;
    sprite.alpha = clamp(options.alpha ?? 1, 0, 1);
    sprite.tint = options.tint ?? 0xffffff;
    sprite.scale.set(1);
    sprite.width = Math.max(0.01, width);
    sprite.height = Math.max(0.01, height);
    if (options.flipX) sprite.scale.x = -Math.abs(sprite.scale.x);
    return sprite;
  }

  end(): void {
    for (let index = this.cursor; index < this.sprites.length; index += 1) {
      this.sprites[index].visible = false;
    }
  }
}

class TextPool {
  readonly container = new Container();
  private readonly labels: Text[] = [];
  private cursor = 0;

  begin(): void {
    this.cursor = 0;
  }

  add(value: string, x: number, y: number, options: TextOptions): Text {
    const label = this.labels[this.cursor] ?? new Text();
    if (!this.labels[this.cursor]) {
      this.labels.push(label);
      this.container.addChild(label);
    }
    this.cursor += 1;
    label.visible = true;
    label.text = value;
    label.position.set(x, y);
    label.alpha = 1;
    label.style = {
      fill: options.color,
      fontFamily: options.family ?? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: options.size,
      fontWeight: options.weight ?? "600",
      letterSpacing: options.letterSpacing ?? 0,
    };
    return label;
  }

  end(): void {
    for (let index = this.cursor; index < this.labels.length; index += 1) {
      this.labels[index].visible = false;
    }
  }
}

/**
 * WorldStateをPixiJSの舞台へ翻訳するpresentation実装。
 * DOM・Tauri・Codex形式を参照せず、破壊条件もここでは判断しない。
 */
export class PixiRenderer implements WorldRenderer {
  private readonly root = new Container();
  private readonly backdrop = new Graphics();
  private readonly backdropSprites = new SpritePool();
  private readonly scenery = new Graphics();
  private readonly actorRigging = new Graphics();
  private readonly effects = new Graphics();
  private readonly proscenium = new Graphics();
  private readonly theatreSprites = new SpritePool();
  private readonly hud = new Graphics();
  private readonly scenerySprites = new SpritePool();
  private readonly actorSprites = new SpritePool();
  private readonly effectSprites = new SpritePool();
  private readonly text = new TextPool();
  private disposed = false;
  private motion: PresentationMotionPolicy = {
    motionScale: 1,
    allowParticles: true,
    allowFlash: true,
    allowNonEssentialEvents: true,
  };

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly app: Application,
    private readonly atlas: SpriteAtlas,
    private readonly motionPolicy: () => PresentationMotionPolicy,
  ) {
    this.root.addChild(
      this.backdrop,
      this.backdropSprites.container,
      this.scenery,
      this.scenerySprites.container,
      this.actorRigging,
      this.actorSprites.container,
      this.effects,
      this.effectSprites.container,
      this.proscenium,
      this.theatreSprites.container,
      this.hud,
      this.text.container,
    );
    this.app.stage.addChild(this.root);
  }

  static async create(
    canvas: HTMLCanvasElement,
    motionPolicy: () => PresentationMotionPolicy = () => ({
      motionScale: 1,
      allowParticles: true,
      allowFlash: true,
      allowNonEssentialEvents: true,
    }),
  ): Promise<PixiRenderer> {
    const app = new Application();
    const initialWidth = Math.max(1, Math.round(canvas.clientWidth));
    const initialHeight = Math.max(1, Math.round(canvas.clientHeight));
    await app.init({
      canvas,
      width: initialWidth,
      height: initialHeight,
      antialias: true,
      autoDensity: true,
      autoStart: false,
      backgroundAlpha: 0,
      preference: "webgl",
      resolution: clamp(window.devicePixelRatio || 1, 1, MAX_DEVICE_PIXEL_RATIO),
    });
    // Application.initが設定するpx指定を外し、Tauri windowの可変サイズへCSSで追従させる。
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    app.ticker.stop();
    return new PixiRenderer(canvas, app, await SpriteAtlas.load(), motionPolicy);
  }

  render(world: WorldState, snapshot: AgentSnapshot): void {
    if (this.disposed) return;
    this.motion = this.motionPolicy();
    this.resize();
    this.scenerySprites.begin();
    this.backdropSprites.begin();
    this.actorSprites.begin();
    this.effectSprites.begin();
    this.theatreSprites.begin();
    this.text.begin();
    this.backdrop.clear();
    this.scenery.clear();
    this.actorRigging.clear();
    this.effects.clear();
    this.proscenium.clear();
    this.hud.clear();

    const active = snapshot.active || snapshot.status === "error";
    this.drawBackdrop(world, snapshot, active);
    this.drawStageFloor(active);
    this.drawLake(world);
    this.drawTrees(world, active);
    this.drawFactory(world, active ? { ...snapshot, active: true } : snapshot);
    this.drawRigging(active);
    if (active) {
      this.drawSubagents(world, snapshot);
      this.drawActiveCrew(world, snapshot);
    } else {
      this.drawRecoveryCrew(world);
    }
    if (this.motion.allowParticles) {
      for (const particle of world.particles) this.drawParticle(particle);
    }
    this.drawStatusEffects(world, snapshot);
    this.drawProscenium(world, active);
    this.drawHud(world, snapshot);

    this.scenerySprites.end();
    this.backdropSprites.end();
    this.actorSprites.end();
    this.effectSprites.end();
    this.theatreSprites.end();
    this.text.end();
    this.app.render();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.app.destroy(false, { children: true });
  }

  private resize(): void {
    const host = this.canvas.parentElement;
    const width = Math.max(1, Math.round(host?.clientWidth ?? this.canvas.clientWidth));
    const height = Math.max(1, Math.round(host?.clientHeight ?? this.canvas.clientHeight));
    if (this.app.renderer.screen.width !== width || this.app.renderer.screen.height !== height) {
      this.app.renderer.resize(width, height);
      // autoDensityが設定するpx幅を残すと、次回の自由リサイズでCanvas自身の旧寸法へ固定される。
      this.canvas.style.width = "100%";
      this.canvas.style.height = "100%";
    }
    const viewport = new StageViewport(width, height);
    this.root.scale.set(viewport.scale);
    this.root.position.set(viewport.offsetX, viewport.offsetY);
  }

  private motionTime(elapsed: number): number {
    return elapsed * this.motion.motionScale;
  }

  private drawBackdrop(world: WorldState, snapshot: AgentSnapshot, active: boolean): void {
    const key: SpriteKey = active ? "backdropActive" : "backdropRecovery";
    if (this.atlas.has(key)) {
      this.sprite(this.backdropSprites, key, WORLD_WIDTH / 2, WORLD_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT);
      return;
    }
    const top = snapshot.status === "error"
      ? 0x6f3536
      : active
        ? color(61 + world.heat * 45, 39, 43)
        : 0x6fa6b7;
    const middle = active ? 0x76513f : 0x86b49b;
    const bottom = active ? 0x4f382d : 0x4f7049;

    this.backdrop.rect(0, 0, WORLD_WIDTH, 72).fill(top);
    this.backdrop.rect(0, 72, WORLD_WIDTH, 48).fill(middle);
    this.backdrop.rect(0, 120, WORLD_WIDTH, 72).fill(bottom);

    this.backdrop
      .circle(270, 35, active ? 27 : 24)
      .fill({ color: active ? 0xefb26a : 0xeef9d8, alpha: active ? 0.18 : 0.28 });

    const cloudOffset = (this.motionTime(world.elapsed) * (active ? 1.2 : 2.1)) % 370;
    for (let index = 0; index < 3; index += 1) {
      const x = ((index * 138 + cloudOffset) % 370) - 30;
      const y = 34 + index * 13;
      this.backdrop
        .ellipse(x, y, 23, 7)
        .ellipse(x + 17, y - 4, 15, 8)
        .fill({ color: active ? 0x463d3e : 0xe9f6ed, alpha: active ? 0.11 : 0.22 });
    }

    this.backdrop.ellipse(158, 165, 155, 49).fill(active ? 0x5f503b : 0x557049);
    this.backdrop.ellipse(157, 158, 147, 39).fill(active ? 0x756046 : 0x6b8954);

    // 背景紙の継ぎ目。奥行きをリアルにせず、舞台装置であることを見せる。
    for (let x = 20; x < 305; x += 37) {
      this.backdrop
        .moveTo(x, 16)
        .lineTo(x + 3, 155)
        .stroke({ color: active ? 0x3e302c : 0x466b58, width: 0.55, alpha: 0.18 });
    }
  }

  private drawStageFloor(active: boolean): void {
    if (this.atlas.has("stageFloor")) {
      this.sprite(this.backdropSprites, "stageFloor", WORLD_WIDTH / 2, WORLD_HEIGHT, WORLD_WIDTH, 90);
      return;
    }
    this.scenery
      .moveTo(5, 126)
      .lineTo(302, 119)
      .lineTo(319, 174)
      .lineTo(21, 191)
      .closePath()
      .fill(active ? 0x655444 : 0x647b4e)
      .stroke({ color: active ? 0x2a211e : 0x2d402b, width: 2.4 });

    for (let x = -24; x < 340; x += 22) {
      this.scenery
        .moveTo(x, 119)
        .lineTo(x + 34, 188)
        .stroke({ color: active ? 0x322823 : 0x365035, width: 0.7, alpha: 0.34 });
    }
    for (let y = 132; y < 190; y += 13) {
      this.scenery
        .moveTo(5, y)
        .lineTo(317, y - 12)
        .stroke({ color: active ? 0x352b25 : 0x3a5235, width: 0.7, alpha: 0.3 });
    }

    this.scenery
      .moveTo(15, 180)
      .lineTo(312, 165)
      .lineTo(319, 176)
      .lineTo(23, 191)
      .closePath()
      .fill(active ? 0x3f332d : 0x45583d);
  }

  private drawLake(world: WorldState): void {
    const waterY = 145 + (1 - world.water) * 11;
    const waterHeight = Math.max(8, 27 * world.water);
    this.scenery
      .ellipse(278, waterY, 37, waterHeight)
      .fill({ color: world.heat > 0.67 ? 0x7a8178 : 0x409bb7, alpha: 0.86 })
      .stroke({ color: world.heat > 0.67 ? 0xb5a985 : 0xa8edf1, width: 1.1, alpha: 0.55 });
    if (world.heat < 0.72) {
      for (let index = 0; index < 3; index += 1) {
        const x = 257 + ((this.motionTime(world.elapsed) * 8 + index * 17) % 43);
        this.scenery
          .moveTo(x, waterY - 2 + index * 5)
          .lineTo(x + 8, waterY - 2 + index * 5)
          .stroke({ color: 0xe5ffff, width: 1, alpha: 0.3 });
      }
    }
    this.sprite(this.scenerySprites, "waterfall", 305, 157, 38, 31, { alpha: 0.94 });
  }

  private drawTrees(world: WorldState, active: boolean): void {
    const visible = world.trees
      .filter((tree) => tree.id % 2 === 0 || tree.stage !== "grown")
      .sort((left, right) => left.y - right.y);
    for (const tree of visible) {
      const growthScale = tree.stage === "sapling" ? 0.56 : 1;
      const width = 28 * tree.size * growthScale;
      const height = 43 * tree.size * growthScale;
      const sprite = this.treeSprite(tree, active);
      const sway = Math.sin(tree.sway) * (tree.stage === "burning" ? 0.045 : 0.018);
      this.shadow(this.scenery, tree.x, tree.y + 11, width * 0.3, Math.max(1.2, height * 0.055), 0.13);
      if (sprite === "treeRecovery") {
        this.scenery
          .circle(tree.x, tree.y + 10 - height * 0.48, width * 0.23)
          .fill({ color: 0xffc85a, alpha: 0.32 });
      }
      this.sprite(this.scenerySprites, sprite, tree.x, tree.y + 10, width, height, {
        rotation: sway,
        alpha: tree.stage === "charred" ? 0.94 : 1,
      });
      if (tree.stage === "burning") {
        const pulse = 1 + Math.sin(this.motionTime(world.elapsed) * 11 + tree.id) * 0.12;
        this.sprite(this.scenerySprites, "flame", tree.x, tree.y - 10, 17 * pulse, 24 * pulse);
      }
    }
  }

  private treeSprite(tree: Tree, active: boolean): SpriteKey {
    if (tree.stage === "charred") return "treeScorched";
    if (tree.stage === "burning") return tree.burn > 0.52 ? "treeScorched" : "treeHealthy";
    if (tree.stage === "sapling") return "shrub";
    return !active && tree.id % 9 === 0 ? "treeRecovery" : "treeHealthy";
  }

  private drawFactory(world: WorldState, snapshot: AgentSnapshot): void {
    const forge = SCENE_LAYOUT.forge;
    const forgeScale = snapshot.active ? 1 : 0.54;
    const forgeX = snapshot.active ? forge.x : 254;
    const forgeY = snapshot.active ? forge.y : 143;
    const intensity = effortMultiplier(snapshot.effort);
    const pulse = 1 + Math.sin(world.factoryPulse) * (snapshot.active ? 0.013 + intensity * 0.005 : 0.009);
    if (snapshot.active) {
      this.scenery
        .circle(forgeX, 132, 51)
        .fill({ color: 0xff8e2e, alpha: 0.12 + world.heat * 0.12 });
    }
    this.shadow(this.scenery, forgeX, forgeY + 3, 41 * forgeScale, 7 * forgeScale, snapshot.active ? 0.27 : 0.1);
    this.cutout(
      this.scenerySprites,
      snapshot.active ? "forgeActive" : "forgeRecovery",
      forgeX,
      forgeY,
      forge.width * pulse * forgeScale,
      forge.height * pulse * forgeScale,
      { alpha: snapshot.active ? 1 : 0.42 },
    );
    if (snapshot.active) {
      this.sprite(this.scenerySprites, "smoke", forgeX + 1, 84, 27, 39, {
        rotation: Math.sin(this.motionTime(world.elapsed) * 1.4) * 0.08,
        alpha: 0.5 + world.pollution * 0.34,
      });
      this.sprite(this.scenerySprites, "smoke", forgeX + 20, 79, 20, 31, {
        rotation: -Math.sin(this.motionTime(world.elapsed) * 1.1) * 0.07,
        alpha: 0.38 + world.pollution * 0.3,
      });
    }
  }

  private drawRigging(active: boolean): void {
    const groundPoints = active
      ? [
          SCENE_LAYOUT.active.hinoko,
          SCENE_LAYOUT.active.sumi,
          { x: 112, y: SCENE_LAYOUT.active.kururi.y },
        ]
      : [
          SCENE_LAYOUT.recovery.mebuki,
          SCENE_LAYOUT.recovery.mizumo,
        ];
    for (const point of groundPoints) {
      this.actorRigging
        .roundRect(point.x - 4, point.y - 4, 8, 3, 1.5)
        .fill({ color: 0x543522, alpha: 0.7 })
        .moveTo(point.x, point.y - 2)
        .lineTo(point.x + 2, 192)
        .stroke({ color: 0x6b4328, width: 2.2, alpha: 0.72 });
    }
    if (!active) {
      const fuwame = SCENE_LAYOUT.recovery.fuwame;
      this.actorRigging
        .moveTo(fuwame.x - 8, 9)
        .lineTo(fuwame.x - 7, fuwame.y - 18)
        .moveTo(fuwame.x + 8, 9)
        .lineTo(fuwame.x + 7, fuwame.y - 18)
        .stroke({ color: 0xd8c5a2, width: 0.65, alpha: 0.48 });
    }
  }

  private drawSubagents(world: WorldState, snapshot: AgentSnapshot): void {
    const assistants = Math.min(SCENE_LAYOUT.active.subagents.length, Math.max(0, snapshot.activeSessions - 1));
    for (let index = 0; index < assistants; index += 1) {
      const placement = SCENE_LAYOUT.active.subagents[index];
      const y = placement.y + Math.sin(this.motionTime(world.elapsed) * 5.2 + index * 1.7) * 0.75;
      this.actorRigging.roundRect(placement.x - 9, placement.y - 2, 18, 3, 1.5).fill(0x53341f);
      this.character("sumi", world, placement.x, y, placement.width, placement.height, {
        flipX: placement.flipX,
        alpha: 0.94,
      });
      this.sprite(
        this.actorSprites,
        "tokenCrystal",
        placement.x + placement.crystalOffsetX,
        y - 10,
        7,
        12,
        { rotation: Math.sin(this.motionTime(world.elapsed) * 3 + index) * 0.08, alpha: 0.92 },
      );
    }
  }

  private drawActiveCrew(world: WorldState, snapshot: AgentSnapshot): void {
    const layout = SCENE_LAYOUT.active;
    const intensity = effortMultiplier(snapshot.effort);
    const isError = snapshot.status === "error";
    const isHolding = snapshot.status === "thinking" || snapshot.status === "compacting";
    const isStriking = snapshot.status === "working";
    const toolBoost = snapshot.tool === "apply_patch" ? 1.18 : snapshot.tool === "shell" ? 1.08 : 1;
    const hammerSpeed = (4.8 + intensity * 1.35) * toolBoost;
    const hammerCycle = this.motionTime(world.elapsed) * hammerSpeed;
    const hammerSwing = isError
      ? -0.18 + Math.sin(this.motionTime(world.elapsed) * 11) * 0.06
      : isHolding
        ? -0.88 + Math.sin(this.motionTime(world.elapsed) * 1.8) * 0.08
        : -0.88 + ((Math.sin(hammerCycle) + 1) * 0.5) * 1.05;
    const impact = isStriking ? Math.pow(Math.max(0, Math.sin(hammerCycle)), 7) : 0;
    const emberBob = Math.sin(this.motionTime(world.elapsed) * (isHolding ? 2.2 : 5.6)) * (isHolding ? 0.45 : 0.95) - impact * 1.15;

    const route = layout.cart.maxX - layout.cart.minX;
    const activityFactor = isHolding ? 0.38 : isError ? 0.12 : 1;
    const cartSpeed = ((snapshot.tool === "shell" ? 7.7 : 6.1) + intensity * 1.2) * activityFactor;
    const phase = (this.motionTime(world.elapsed) * cartSpeed) % (route * 2);
    const travellingRight = phase <= route;
    const cartX = layout.cart.minX + (travellingRight ? phase : route * 2 - phase);
    const wheelBob = Math.sin(this.motionTime(world.elapsed) * Math.max(1, cartSpeed) * 1.9) * 0.35 * activityFactor;
    const kururiX = cartX + (travellingRight ? 31 : -13);

    this.shadow(this.actorRigging, cartX, layout.cart.y + 1, 18, 3, 0.2);
    this.sprite(this.actorSprites, "logCart", cartX, layout.cart.y + wheelBob, layout.cart.width, layout.cart.height, {
      flipX: !travellingRight,
      rotation: wheelBob * 0.008,
    });
    this.sprite(this.actorSprites, "logs", cartX, layout.logs.y + wheelBob, layout.logs.width, layout.logs.height, {
      flipX: !travellingRight,
    });
    this.character("kururi", world, kururiX, layout.kururi.y + wheelBob, layout.kururi.width, layout.kururi.height, {
      flipX: travellingRight,
    });

    this.sprite(this.actorSprites, "hammer", layout.hammer.x, layout.hammer.y + emberBob, layout.hammer.width, layout.hammer.height, {
      rotation: hammerSwing,
      anchorX: layout.hammer.anchorX,
      anchorY: layout.hammer.anchorY,
    });
    this.character("hinoko", world, layout.hinoko.x, layout.hinoko.y + emberBob, layout.hinoko.width, layout.hinoko.height);

    const sumiBob = Math.sin(this.motionTime(world.elapsed) * (6.8 + intensity) + 0.8) * (isHolding ? 0.7 : 1.35);
    this.character("sumi", world, layout.sumi.x, layout.sumi.y + sumiBob, layout.sumi.width, layout.sumi.height);
    this.sprite(this.actorSprites, "tokenCrystal", layout.crystal.x, layout.crystal.y + sumiBob, layout.crystal.width, layout.crystal.height, {
      rotation: Math.sin(this.motionTime(world.elapsed) * (isHolding ? 1.4 : 3)) * 0.07,
    });

    const mizumoBob = Math.sin(this.motionTime(world.elapsed) * 2.6) * 0.9;
    this.character("mizumo", world, layout.mizumo.x, layout.mizumo.y + mizumoBob, layout.mizumo.width, layout.mizumo.height, {
      alpha: 0.38,
      rotation: Math.sin(this.motionTime(world.elapsed) * 2) * 0.016,
    });

    if (impact > 0.38) {
      this.sprite(this.effectSprites, "spark", 178, 158, 11 + impact * 6, 11 + impact * 6, {
        anchorX: 0.5,
        anchorY: 0.5,
        rotation: hammerCycle,
        alpha: clamp(impact, 0, 1),
      });
    }
  }

  private drawRecoveryCrew(world: WorldState): void {
    const layout = SCENE_LAYOUT.recovery;
    const cloudX = layout.fuwame.x + Math.sin(this.motionTime(world.elapsed) * 0.65) * 11 + world.interaction.fuwameOffsetX;
    const cloudY = layout.fuwame.y + Math.sin(this.motionTime(world.elapsed) * 1.3) * 1.4;
    this.character("fuwame", world, cloudX, cloudY, layout.fuwame.width, layout.fuwame.height, { anchorY: 0.5 });
    if (world.rain > 0.58) {
      this.sprite(this.actorSprites, "rainCloud", cloudX - 34, cloudY + 2, 26, 26, { anchorY: 0.5, alpha: 0.52 });
    }

    this.sprite(this.actorSprites, "shrub", 116, 169, 24, 24, { alpha: 0.78 });
    this.sprite(this.actorSprites, "shrub", 164, 170, 18, 18, { alpha: 0.68, flipX: true });

    const sprigBob = Math.sin(this.motionTime(world.elapsed) * 3.5) * 1.05;
    this.character("mebuki", world, layout.mebuki.x, layout.mebuki.y + sprigBob, layout.mebuki.width, layout.mebuki.height);
    this.sprite(
      this.actorSprites,
      "wateringCan",
      layout.wateringCan.x,
      layout.wateringCan.y + sprigBob,
      layout.wateringCan.width,
      layout.wateringCan.height,
      {
        rotation: -0.31 + Math.sin(this.motionTime(world.elapsed) * 2.8) * 0.09,
        anchorX: layout.wateringCan.anchorX,
        anchorY: layout.wateringCan.anchorY,
      },
    );
    for (let index = 0; index < 3; index += 1) {
      const progress = (this.motionTime(world.elapsed) * 1.8 + index * 0.31) % 1;
      this.effects
        .moveTo(213 + progress * 8, 151 + progress * 13)
        .lineTo(212 + progress * 8, 154 + progress * 13)
        .stroke({ color: 0x9ce8ef, width: 1.25, alpha: 0.5 });
    }
    this.sprite(this.actorSprites, "shrub", layout.targetShrub.x, layout.targetShrub.y, layout.targetShrub.width, layout.targetShrub.height, {
      alpha: 0.92,
    });

    const idleBob = Math.sin(this.motionTime(world.elapsed) * 1.8) * 0.55;
    this.character("hinoko", world, layout.hinoko.x, layout.hinoko.y + idleBob, layout.hinoko.width, layout.hinoko.height, {
      alpha: 0.34,
    });
    this.sprite(
      this.actorSprites,
      "sumi",
      layout.sleepingSumi.x,
      layout.sleepingSumi.y - idleBob * 0.25,
      layout.sleepingSumi.width,
      layout.sleepingSumi.height,
      { alpha: 0.34, flipX: true, expressionFrame: 3 },
    );
    for (let index = 0; index < 3; index += 1) {
      const phase = (this.motionTime(world.elapsed) * 0.38 + index * 0.28) % 1;
      this.effects
        .circle(263 + phase * 7, 105 - phase * 13 - index * 2, 1.1 + phase * 1.7)
        .stroke({ color: 0xf3f5e3, width: 1, alpha: 0.25 + (1 - phase) * 0.55 });
    }

    const mizumoBob = Math.sin(this.motionTime(world.elapsed) * 2.2) * 1.05;
    this.character("mizumo", world, layout.mizumo.x, layout.mizumo.y + mizumoBob, layout.mizumo.width, layout.mizumo.height, {
      rotation: Math.sin(this.motionTime(world.elapsed) * 2) * 0.022,
    });
    this.sprite(this.actorSprites, "splash", layout.mizumo.x, layout.mizumo.y + 2, 42, 21, {
      alpha: 0.36 + Math.sin(this.motionTime(world.elapsed) * 3.4) * 0.07,
    });
    this.character("kururi", world, layout.kururi.x, layout.kururi.y, layout.kururi.width, layout.kururi.height, { alpha: 0.34 });
  }

  private drawParticle(particle: Particle): void {
    const alpha = Math.max(0, particle.life / particle.maxLife);
    if (particle.kind === "smoke") {
      this.sprite(this.effectSprites, "smoke", particle.x, particle.y, particle.size * 5.4, particle.size * 7.1, {
        alpha: alpha * 0.6,
        rotation: particle.x * 0.01,
      });
      return;
    }
    if (particle.kind === "steam") {
      this.effects.circle(particle.x, particle.y, particle.size * 1.2).fill({ color: 0xe9f5f0, alpha: alpha * 0.62 });
      return;
    }
    if (particle.kind === "rain") {
      this.effects
        .moveTo(particle.x, particle.y)
        .lineTo(particle.x - 2, particle.y + 7)
        .stroke({ color: 0xa6e9f3, width: 1.2, alpha: alpha * 0.68 });
      return;
    }
    const key = particle.kind === "token" ? "token" : "spark";
    const size = particle.size * (particle.kind === "token" ? 4.4 : 5.5);
    this.sprite(this.effectSprites, key, particle.x, particle.y, size, size, {
      alpha,
      anchorX: 0.5,
      anchorY: 0.5,
      rotation: particle.kind === "token" ? particle.life * 4 : 0,
    });
  }

  private drawStatusEffects(world: WorldState, snapshot: AgentSnapshot): void {
    if (snapshot.status === "compacting") {
      for (let index = 0; index < 4; index += 1) {
        const angle = this.motionTime(world.elapsed) * 2.4 + index * (Math.PI / 2);
        this.sprite(this.effectSprites, "token", 239 + Math.cos(angle) * 31, 116 + Math.sin(angle) * 14, 9, 9, {
          anchorX: 0.5,
          anchorY: 0.5,
          rotation: -angle,
          alpha: 0.78,
        });
      }
    }
    if (snapshot.status === "error") {
      const pulse = this.motion.allowFlash
        ? 0.15 + (Math.sin(this.motionTime(world.elapsed) * 9) * 0.5 + 0.5) * 0.1
        : 0.18;
      this.effects.rect(11, 12, 298, 166).fill({ color: 0xff3b28, alpha: pulse });
      for (let index = 0; index < (this.motion.allowParticles ? 5 : 0); index += 1) {
        const angle = this.motionTime(world.elapsed) * (1.8 + index * 0.08) + index * 1.2;
        this.sprite(this.effectSprites, "spark", 239 + Math.cos(angle) * 34, 118 + Math.sin(angle) * 23, 10, 10, {
          anchorX: 0.5,
          anchorY: 0.5,
          rotation: angle,
          alpha: 0.84,
        });
      }
    }
  }

  private drawProscenium(world: WorldState, active: boolean): void {
    if (
      this.atlas.has("prosceniumFrame")
      && this.atlas.has("curtainLeft")
      && this.atlas.has("curtainRight")
      && this.atlas.has("curtainValance")
    ) {
      this.sprite(this.theatreSprites, "curtainLeft", 0, 0, 48, 142, { anchorX: 0, anchorY: 0 });
      this.sprite(this.theatreSprites, "curtainRight", WORLD_WIDTH, 0, 48, 142, { anchorX: 1, anchorY: 0 });
      this.sprite(this.theatreSprites, "curtainValance", WORLD_WIDTH / 2, 0, WORLD_WIDTH, 38, { anchorY: 0 });
      this.sprite(this.theatreSprites, "prosceniumFrame", WORLD_WIDTH / 2, WORLD_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT);
      return;
    }
    const wood = active ? 0x4d2f24 : 0x49352a;
    const woodLight = active ? 0x835136 : 0x71513a;
    const curtain = active ? 0x6e1f25 : 0x4e2434;
    const curtainLight = active ? 0xa63c34 : 0x74415a;

    this.proscenium.rect(0, 0, WORLD_WIDTH, 13).fill(wood);
    this.proscenium.rect(0, 0, WORLD_WIDTH, 5).fill(woodLight);
    this.proscenium.rect(0, 0, 11, WORLD_HEIGHT).fill(wood);
    this.proscenium.rect(309, 0, 11, WORLD_HEIGHT).fill(wood);
    this.proscenium.rect(4, 12, 7, 166).fill(woodLight);
    this.proscenium.rect(309, 12, 7, 166).fill(woodLight);
    this.proscenium.rect(0, 178, WORLD_WIDTH, 14).fill(0x2e211d);
    this.proscenium.rect(0, 178, WORLD_WIDTH, 4).fill(woodLight);

    this.proscenium
      .moveTo(10, 8)
      .lineTo(46, 10)
      .lineTo(35, 88)
      .lineTo(10, 104)
      .closePath()
      .fill(curtain);
    this.proscenium
      .moveTo(310, 8)
      .lineTo(274, 10)
      .lineTo(285, 88)
      .lineTo(310, 104)
      .closePath()
      .fill(curtain);
    this.proscenium
      .moveTo(14, 10)
      .lineTo(306, 10)
      .lineTo(293, 27)
      .lineTo(160, 20)
      .lineTo(27, 27)
      .closePath()
      .fill(curtain);
    for (let x = 20; x <= 300; x += 20) {
      this.proscenium.circle(x, 24 + Math.abs(160 - x) * 0.018, 8).fill(curtain);
    }
    for (let x = 18; x < 44; x += 9) {
      this.proscenium.moveTo(x, 13).lineTo(x - 3, 94).stroke({ color: curtainLight, width: 1.5, alpha: 0.52 });
    }
    for (let x = 302; x > 276; x -= 9) {
      this.proscenium.moveTo(x, 13).lineTo(x + 3, 94).stroke({ color: curtainLight, width: 1.5, alpha: 0.52 });
    }

    for (let index = 0; index < 10; index += 1) {
      const x = 28 + index * 29;
      const glow = 0.55 + Math.sin(this.motionTime(world.elapsed) * 2.1 + index) * 0.12;
      this.proscenium.circle(x, 183, 2.8).fill({ color: active ? 0xffbc4e : 0xd8e8ad, alpha: glow });
      this.proscenium.circle(x, 183, 5.5).fill({ color: active ? 0xff8a32 : 0xb5d98f, alpha: glow * 0.08 });
    }
    this.proscenium.rect(0.5, 0.5, 319, 191).stroke({ color: 0xd59d54, width: 1, alpha: 0.55 });
  }

  private drawHud(world: WorldState, snapshot: AgentSnapshot): void {
    const metrics = getWorldMetrics(world);
    this.hud.roundRect(17, 31, 286, 37, 4).fill({ color: 0x1b1614, alpha: 0.78 });
    const accent = snapshot.status === "error" ? 0xff8b72 : snapshot.active ? 0xffc24a : 0xc5ed94;
    const headline = world.activeEvent?.title ?? (snapshot.status === "error"
      ? "TOKEN FORGE · BLOCKED"
      : snapshot.active
        ? "TOKEN FORGE · ACTIVE"
        : "RECOVERY GROVE · CHILL");
    const agents = snapshot.activeSessions === 1 ? "AGENT" : "AGENTS";
    const detail = world.activeEvent?.line ?? (snapshot.active
      ? `${snapshot.effort.toUpperCase()} · ${Math.max(1, snapshot.activeSessions)} ${agents} · +${snapshot.tokenDelta} TOK`
      : `RAIN ${Math.round(world.rain * 100)}% · WATER ${metrics.waterPercent}% · TREE ${metrics.livingTrees}`);
    this.text.add(headline, 23, 35, { color: accent, size: 9.4, weight: "800", letterSpacing: 0.2 });
    this.text.add(detail, 23, 51, { color: 0xf3eadb, size: 9.4, weight: "600" });
    if (world.quoteVisible && snapshot.status !== "error") {
      this.hud.roundRect(163, 42, 139, 20, 5).fill({ color: 0x271812, alpha: 0.86 });
      this.text.add("環境破壊はたのしいZOY!!", 170, 48, {
        color: 0xffd65e,
        size: 7.4,
        weight: "800",
        family: "Inter, Hiragino Maru Gothic ProN, Yu Gothic UI, sans-serif",
      });
    }
  }

  private sprite(
    pool: SpritePool,
    key: SpriteKey,
    x: number,
    y: number,
    width: number,
    height: number,
    options: SpriteOptions = {},
  ): Sprite {
    return pool.add(this.atlas.get(key, options.expressionFrame), x, y, width, height, options);
  }

  private cutout(
    pool: SpritePool,
    key: SpriteKey,
    x: number,
    y: number,
    width: number,
    height: number,
    options: SpriteOptions = {},
  ): void {
    this.sprite(pool, key, x + 1.7, y + 2.1, width, height, {
      ...options,
      alpha: (options.alpha ?? 1) * 0.34,
      tint: 0x1f1714,
    });
    this.sprite(pool, key, x, y, width, height, options);
  }

  private character(
    id: CharacterId,
    world: WorldState,
    x: number,
    y: number,
    width: number,
    height: number,
    options: SpriteOptions = {},
  ): void {
    const life = world.characters[id];
    const hovered = world.interaction.hovered === id;
    const scale = hovered ? 1.06 : 1;
    this.cutout(
      this.actorSprites,
      id,
      x + life.offsetX,
      y + life.offsetY,
      width * scale,
      height * scale,
      {
        ...options,
        expressionFrame: options.expressionFrame ?? CHARACTER_EXPRESSION_FRAMES[id][life.mood],
      },
    );
  }

  private shadow(graphics: Graphics, x: number, y: number, radiusX: number, radiusY: number, alpha: number): void {
    graphics.ellipse(x, y, radiusX, radiusY).fill({ color: 0x241711, alpha });
  }
}
