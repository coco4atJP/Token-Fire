import {
  Application,
  Container,
  Graphics,
  Sprite,
  type Texture,
} from "pixi.js";
import type { WorldRenderer } from "../application/worldRenderer";
import { effortMultiplier, type AgentSnapshot } from "../domain/agent";
import type { CharacterId, CharacterMood } from "../domain/character";
import type { Particle, Tree, WorldState } from "../domain/world";
import { readWorldScene, type WorldScene } from "../domain/worldScene";
import { SCENE_LAYOUT } from "./sceneLayout";
import { SceneLayout, type StageLayoutMode } from "./stageLayout";
import type { PresentationMotionPolicy } from "./presentationMotionPolicy";
import { SpriteAtlas, type ExpressionFrame, type SpriteKey } from "./spriteAtlas";
import { STAGE_HEIGHT, STAGE_WIDTH } from "./stageViewport";
import { readWorldPatina, worldPatinaSignature, type WorldPatina } from "./worldPatina";
import {
  blinkOpennessAt,
  breathingScaleAt,
  delayedFollow,
  sampleHammerMotion,
  sampleHopMotion,
  samplePopInScale,
  sampleSecondaryFollowAt,
  volumePreservingScale,
} from "./motion/spring";

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
  stretch?: number;
}

const CHARACTER_MOTION_SEEDS: Record<CharacterId, number> = {
  hinoko: 11,
  mebuki: 23,
  fuwame: 37,
  sumi: 41,
  mizumo: 53,
  kururi: 67,
};

const CHARACTER_EXPRESSION_FRAMES: Record<CharacterId, Record<CharacterMood, ExpressionFrame>> = {
  hinoko: { proud: 2, busy: 2, sleepy: 1, scheming: 3, chill: 1, surprised: 4 },
  mebuki: { proud: 2, busy: 1, sleepy: 4, scheming: 1, chill: 4, surprised: 3 },
  fuwame: { proud: 1, busy: 1, sleepy: 4, scheming: 2, chill: 1, surprised: 3 },
  sumi: { proud: 2, busy: 2, sleepy: 3, scheming: 1, chill: 3, surprised: 4 },
  mizumo: { proud: 1, busy: 4, sleepy: 3, scheming: 4, chill: 1, surprised: 2 },
  kururi: { proud: 2, busy: 1, sleepy: 1, scheming: 3, chill: 1, surprised: 4 },
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

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

/**
 * WorldStateをPixiJSの舞台へ翻訳するpresentation実装。
 * DOM・Tauri・Codex形式を参照せず、破壊条件もここでは判断しない。
 */
export class PixiRenderer implements WorldRenderer {
  private readonly root = new Container();
  private readonly backdrop = new Graphics();
  private readonly backdropSprites = new SpritePool();
  private readonly environmentDecor = new Graphics();
  private readonly atmosphere = new Graphics();
  private readonly scenery = new Graphics();
  private readonly factoryGrowth = new Graphics();
  private readonly actorRigging = new Graphics();
  private readonly staticRigging = new Graphics();
  private readonly effects = new Graphics();
  private readonly proscenium = new Graphics();
  private readonly theatreSprites = new SpritePool();
  private readonly curtainTransition = new Graphics();
  private readonly scenerySprites = new SpritePool();
  private readonly patinaSprites = new SpritePool();
  private readonly actorSprites = new SpritePool();
  private readonly effectSprites = new SpritePool();
  private disposed = false;
  private lastSceneFamily: "active" | "recovery" | null = null;
  private transitionStartedAt = -1;
  private staticSceneSignature = "";
  private layoutMode: StageLayoutMode = "diorama";
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
      this.environmentDecor,
      this.atmosphere,
      this.scenery,
      this.factoryGrowth,
      this.scenerySprites.container,
      this.patinaSprites.container,
      this.staticRigging,
      this.actorRigging,
      this.actorSprites.container,
      this.effects,
      this.effectSprites.container,
      this.proscenium,
      this.theatreSprites.container,
      this.curtainTransition,
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
    const scene = readWorldScene(world, snapshot);
    const active = scene === "mera" || scene === "gogo" || scene === "approval" || scene === "kirari" || scene === "zero-output";
    const patina = readWorldPatina(world, this.layoutMode);
    const sceneFamily = active ? "active" : "recovery";
    const staticSignature = [
      this.layoutMode,
      sceneFamily,
      world.growthLevel,
      world.environment.weather,
      world.environment.timePhase,
      worldPatinaSignature(patina),
    ].join("|");
    const rebuildStaticScene = staticSignature !== this.staticSceneSignature;
    this.scenerySprites.begin();
    this.actorSprites.begin();
    this.effectSprites.begin();
    if (rebuildStaticScene) {
      this.staticSceneSignature = staticSignature;
      this.rebuildStaticScene(world, active, patina);
    }
    this.atmosphere.clear();
    this.scenery.clear();
    this.actorRigging.clear();
    this.effects.clear();
    this.curtainTransition.clear();

    this.updateSceneTransition(active);
    this.applyLayerMotion(world, scene);
    this.drawMovingAtmosphere(world, active);
    this.drawWeatherParticles(world);
    this.drawLake(world);
    this.drawTrees(world, active);
    this.drawFactory(world, active ? { ...snapshot, active: true } : snapshot, scene);
    if (scene === "approval") {
      this.drawApprovalCrew(world);
    } else if (scene === "zero-output") {
      this.drawZeroOutputCrew(world);
    } else if (scene === "kirari") {
      this.drawCeremonyCrew(world);
    } else if (scene === "poka") {
      this.drawIdleCrew(world);
    } else if (active) {
      this.drawSubagents(world, snapshot);
      this.drawActiveCrew(world, snapshot);
    } else {
      this.drawRecoveryCrew(world);
    }
    if (this.motion.allowParticles) {
      for (const particle of world.particles) this.drawParticle(particle);
    }
    this.drawSceneEffects(world, scene);
    this.drawStatusEffects(world, snapshot);
    this.drawCurtainTransition();

    this.scenerySprites.end();
    this.actorSprites.end();
    this.effectSprites.end();
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
    const layout = new SceneLayout(width, height);
    this.layoutMode = layout.mode;
    this.root.scale.set(layout.viewport.scale);
    this.root.position.set(layout.viewport.offsetX, layout.viewport.offsetY);
  }

  private motionTime(elapsed: number): number {
    return elapsed * this.motion.motionScale;
  }

  /**
   * 署名に含まれる値だけで決まる舞台装置を一度に更新する。
   * WorldStateの連続値やactor状態を参照する描画はここへ入れない。
   */
  private rebuildStaticScene(world: WorldState, active: boolean, patina: WorldPatina): void {
    this.backdrop.clear();
    this.environmentDecor.clear();
    this.factoryGrowth.clear();
    this.staticRigging.clear();
    this.proscenium.clear();
    this.backdropSprites.begin();
    this.patinaSprites.begin();
    this.theatreSprites.begin();

    this.drawBackdrop(active);
    this.drawStageFloor(active);
    this.drawEnvironmentDecor(world, active);
    const forge = SCENE_LAYOUT.forge;
    this.drawFactoryGrowth(
      world.growthLevel,
      active ? forge.x : 254,
      active ? forge.y : 143,
      active ? 1 : 0.54,
      active,
    );
    this.drawPatina(patina);
    this.drawRigging(active);
    this.drawProscenium(active);

    this.backdropSprites.end();
    this.patinaSprites.end();
    this.theatreSprites.end();
  }

  private updateSceneTransition(active: boolean): void {
    const family = active ? "active" : "recovery";
    if (this.lastSceneFamily !== null && family !== this.lastSceneFamily && this.motion.motionScale > 0) {
      this.transitionStartedAt = performance.now();
    }
    this.lastSceneFamily = family;
  }

  private applyLayerMotion(world: WorldState, scene: WorldScene): void {
    const time = this.motionTime(world.elapsed);
    const driftX = Math.sin(time * 0.21) * 0.8;
    const driftY = Math.cos(time * 0.16) * 0.35;
    const shakeStrength = this.motion.motionScale * (scene === "gogo" ? 0.4 + world.combustionPulse * 0.75 : scene === "zero-output" ? 0.22 : world.combustionPulse * 0.28);
    const shakeX = Math.sin(time * 37) * shakeStrength;
    const shakeY = Math.cos(time * 29) * shakeStrength * 0.55;
    this.backdrop.position.set(driftX * 0.24, driftY * 0.18);
    this.backdropSprites.container.position.set(driftX * 0.24, driftY * 0.18);
    this.environmentDecor.position.set(driftX * 0.24, driftY * 0.18);
    this.atmosphere.position.set(driftX * 0.24, driftY * 0.18);
    this.scenery.position.set(driftX * 0.62 + shakeX, driftY * 0.45 + shakeY);
    this.factoryGrowth.position.set(driftX * 0.62 + shakeX, driftY * 0.45 + shakeY);
    this.scenerySprites.container.position.set(driftX * 0.62 + shakeX, driftY * 0.45 + shakeY);
    this.patinaSprites.container.position.set(driftX * 0.62 + shakeX, driftY * 0.45 + shakeY);
    this.staticRigging.position.set(driftX + shakeX, driftY + shakeY);
    this.actorRigging.position.set(driftX + shakeX, driftY + shakeY);
    this.actorSprites.container.position.set(driftX + shakeX, driftY + shakeY);
    this.effects.position.set(shakeX, shakeY);
    this.effectSprites.container.position.set(shakeX, shakeY);
  }

  private drawBackdrop(active: boolean): void {
    const key: SpriteKey = active ? "backdropActive" : "backdropRecovery";
    if (this.atlas.has(key)) {
      this.sprite(this.backdropSprites, key, WORLD_WIDTH / 2, WORLD_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT);
    } else {
      const top = active ? 0x52272b : 0x6fa6b7;
      const middle = active ? 0x76513f : 0x86b49b;
      const bottom = active ? 0x4f382d : 0x4f7049;

      this.backdrop.rect(0, 0, WORLD_WIDTH, 72).fill(top);
      this.backdrop.rect(0, 72, WORLD_WIDTH, 48).fill(middle);
      this.backdrop.rect(0, 120, WORLD_WIDTH, 72).fill(bottom);
      this.backdrop.circle(270, 35, active ? 27 : 24).fill({ color: active ? 0xefb26a : 0xeef9d8, alpha: active ? 0.18 : 0.28 });
      this.backdrop.ellipse(158, 165, 155, 49).fill(active ? 0x5f503b : 0x557049);
      this.backdrop.ellipse(157, 158, 147, 39).fill(active ? 0x756046 : 0x6b8954);
    }
    // 背景紙の継ぎ目。奥行きをリアルにせず、舞台装置であることを見せる。
    for (let x = 20; x < 305; x += 37) {
      this.backdrop.moveTo(x, 16).lineTo(x + 3, 155).stroke({ color: active ? 0x3e302c : 0x466b58, width: 0.55, alpha: 0.18 });
    }
  }

  private drawMovingAtmosphere(world: WorldState, active: boolean): void {
    const cloudOffset = (this.motionTime(world.elapsed) * (active ? 1.2 : 2.1)) % 370;
    for (let index = 0; index < 3; index += 1) {
      const x = ((index * 138 + cloudOffset) % 370) - 30;
      const y = 34 + index * 13;
      this.atmosphere
        .ellipse(x, y, 23, 7)
        .ellipse(x + 17, y - 4, 15, 8)
        .fill({ color: active ? 0x463d3e : 0xe9f6ed, alpha: active ? 0.11 : 0.22 });
    }
  }

  private drawEnvironmentDecor(world: WorldState, active: boolean): void {
    const timeTint = {
      dawn: { color: 0xf29a55, alpha: 0.13 },
      day: { color: 0xffffff, alpha: 0 },
      dusk: { color: 0xd66f52, alpha: 0.18 },
      night: { color: 0x172957, alpha: 0.34 },
    }[world.environment.timePhase];
    if (timeTint.alpha > 0) this.environmentDecor.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).fill(timeTint);

    // duskの派手さを中性紙色で約12%だけ抑え、背景画の上へ薄い紙レイヤーを重ねる。
    if (world.environment.timePhase === "dusk") {
      this.environmentDecor.rect(0, 0, WORLD_WIDTH, 121).fill({ color: 0x786a5f, alpha: 0.12 });
    }
    const cloudColor = active ? 0x5c4d49 : 0xd9e1d0;
    const cloudAlpha = active ? 0.12 : 0.16;
    for (const cloud of [
      { x: 68, y: 43, width: 48, height: 8 },
      { x: 171, y: 59, width: 66, height: 9 },
      { x: 273, y: 35, width: 39, height: 7 },
    ]) {
      this.environmentDecor
        .ellipse(cloud.x, cloud.y, cloud.width, cloud.height)
        .ellipse(cloud.x - cloud.width * 0.28, cloud.y + 2, cloud.width * 0.54, cloud.height * 0.72)
        .fill({ color: cloudColor, alpha: cloudAlpha });
    }
    const hill = active ? 0x4f4138 : 0x50634d;
    this.environmentDecor
      .moveTo(0, 126)
      .lineTo(0, 116)
      .lineTo(38, 104)
      .lineTo(77, 114)
      .lineTo(122, 96)
      .lineTo(164, 113)
      .lineTo(210, 101)
      .lineTo(256, 115)
      .lineTo(320, 98)
      .lineTo(320, 132)
      .closePath()
      .fill({ color: hill, alpha: 0.22 });

    const weather = world.environment.weather;
    if (weather === "cloudy" || weather === "fog") {
      this.environmentDecor.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).fill({ color: 0xb7b6a9, alpha: weather === "fog" ? 0.18 : 0.09 });
    } else if (weather === "storm") {
      this.environmentDecor.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).fill({ color: 0x39455c, alpha: 0.24 });
    }
  }

  private drawWeatherParticles(world: WorldState): void {
    const weather = world.environment.weather;
    if (weather === "rain" || weather === "storm") {
      const count = this.motion.allowParticles ? (weather === "storm" ? 16 : 10) : 4;
      for (let index = 0; index < count; index += 1) {
        const x = (index * 31 + this.motionTime(world.elapsed) * 28) % 340 - 10;
        const y = (index * 47 + this.motionTime(world.elapsed) * 62) % 178;
        this.atmosphere.moveTo(x, y).lineTo(x - 3, y + 9).stroke({ color: 0xb4e1ec, width: 0.8, alpha: 0.34 });
      }
    } else if (weather === "snow") {
      for (let index = 0; index < (this.motion.allowParticles ? 13 : 5); index += 1) {
        const x = (index * 29 + this.motionTime(world.elapsed) * 4) % 320;
        const y = (index * 41 + this.motionTime(world.elapsed) * 12) % 176;
        this.atmosphere.circle(x, y, 1.1).fill({ color: 0xf4f0dc, alpha: 0.48 });
      }
    }
  }

  private drawStageFloor(active: boolean): void {
    if (this.atlas.has("stageFloor")) {
      this.sprite(this.backdropSprites, "stageFloor", WORLD_WIDTH / 2, WORLD_HEIGHT, WORLD_WIDTH, 90);
      return;
    }
    const floor = this.backdrop;
    floor
      .moveTo(5, 126)
      .lineTo(302, 119)
      .lineTo(319, 174)
      .lineTo(21, 191)
      .closePath()
      .fill(active ? 0x655444 : 0x647b4e)
      .stroke({ color: active ? 0x2a211e : 0x2d402b, width: 2.4 });

    for (let x = -24; x < 340; x += 22) {
      floor
        .moveTo(x, 119)
        .lineTo(x + 34, 188)
        .stroke({ color: active ? 0x322823 : 0x365035, width: 0.7, alpha: 0.34 });
    }
    for (let y = 132; y < 190; y += 13) {
      floor
        .moveTo(5, y)
        .lineTo(317, y - 12)
        .stroke({ color: active ? 0x352b25 : 0x3a5235, width: 0.7, alpha: 0.3 });
    }

    floor
      .moveTo(15, 180)
      .lineTo(312, 165)
      .lineTo(319, 176)
      .lineTo(23, 191)
      .closePath()
      .fill(active ? 0x3f332d : 0x45583d);
  }

  private drawPatina(patina: WorldPatina): void {
    const railLength = patina.railSegments * 26;
    if (railLength > 0) {
      this.factoryGrowth
        .moveTo(61, 176)
        .lineTo(61 + railLength, 171)
        .moveTo(64, 181)
        .lineTo(64 + railLength, 176)
        .stroke({ color: 0x52463b, width: 1.25, alpha: 0.68 });
    }
    for (let index = 0; index < patina.sleepers; index += 1) {
      const x = 65 + index * 17;
      this.factoryGrowth
        .moveTo(x, 171)
        .lineTo(x + 5, 183)
        .stroke({ color: 0x6b452b, width: 2.4, alpha: 0.72 });
    }
    for (let index = 0; index < patina.logStacks; index += 1) {
      this.sprite(this.patinaSprites, "logs", 84 + index * 19, 166 - index * 2, 25, 17, {
        flipX: index % 2 === 1,
        alpha: 0.82,
      });
    }
    if (this.atlas.has("patinaBentFence")) {
      for (let index = 0; index < patina.bentFence; index += 1) {
        this.sprite(this.patinaSprites, "patinaBentFence", 67 + index * 49, 174 - index * 3, 47, 20, {
          flipX: index % 2 === 1,
          alpha: 0.9,
        });
      }
    }
    if (this.atlas.has("patinaIncidentTag")) {
      for (let index = 0; index < patina.incidentTags; index += 1) {
        this.sprite(this.patinaSprites, "patinaIncidentTag", 219 + index * 15, 137 + (index % 2) * 8, 13, 13, {
          rotation: -0.08 + index * 0.07,
          alpha: 0.92,
        });
      }
    }
    if (this.atlas.has("patinaFadedStamp")) {
      for (let index = 0; index < patina.fadedStamps; index += 1) {
        this.sprite(this.patinaSprites, "patinaFadedStamp", 25 + index * 17, 161 - (index % 2) * 5, 15, 15, {
          rotation: -0.12 + index * 0.06,
          alpha: 0.7,
        });
      }
    }
    if (this.atlas.has("patinaPipeScar")) {
      for (let index = 0; index < patina.pipeScars; index += 1) {
        this.sprite(this.patinaSprites, "patinaPipeScar", 224 + index * 24, 157 - index * 7, 24, 10, {
          flipX: index % 2 === 1,
          alpha: 0.82,
        });
      }
    }
    if (this.atlas.has("patinaMoss")) {
      const positions = [{ x: 184, y: 176 }, { x: 267, y: 174 }, { x: 143, y: 173 }];
      for (let index = 0; index < patina.moss; index += 1) {
        const point = positions[index];
        if (!point) break;
        this.sprite(this.patinaSprites, "patinaMoss", point.x, point.y, 21 - index * 2, 14 - index, {
          flipX: index % 2 === 1,
          alpha: 0.82,
        });
      }
    }
  }

  private drawLake(world: WorldState): void {
    const waterY = 145 + (1 - world.water) * 11;
    const waterHeight = Math.max(8, 27 * world.water);
    this.scenery
      .ellipse(278, waterY, 37, waterHeight)
      .fill({ color: world.heat > 0.67 ? 0x7a8178 : 0x568f9f, alpha: 0.84 })
      .stroke({ color: world.heat > 0.67 ? 0xb5a985 : 0xc4d7c2, width: 1.1, alpha: 0.62 });
    for (const [x, y, radius, color] of [
      [252, waterY - 1, 2.2, 0xd8d7b2],
      [268, waterY - waterHeight * 0.42, 1.6, 0xe9e1c6],
      [295, waterY + 1, 2.5, 0x82956f],
      [306, waterY + 3, 1.8, 0x6f855e],
    ] as const) {
      this.scenery.circle(x, y, radius).fill({ color, alpha: 0.58 });
    }
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
    const candidates = world.trees
      .filter((tree) => tree.id % 2 === 0 || tree.stage !== "grown")
      .sort((left, right) => left.y - right.y);
    const foreground = candidates.filter((tree) => tree.stage === "burning" || tree.stage === "sapling");
    const background = candidates.filter((tree) => tree.stage !== "burning" && tree.stage !== "sapling");
    const backgroundBudget = Math.max(7, (active ? 17 : 15) - foreground.length);
    const stride = Math.max(1, Math.ceil(background.length / backgroundBudget));
    const visible = [
      ...background.filter((_, index) => index % stride === 0).slice(0, backgroundBudget),
      ...foreground,
    ].sort((left, right) => left.y - right.y);
    for (const tree of visible) {
      const growthScale = tree.stage === "sapling" ? 0.56 : 1;
      const depthScale = clamp(0.72 + (tree.y - 92) / 180, 0.72, 1.02);
      const collapse = tree.stage === "burning" ? clamp((tree.burn - 0.62) / 0.38, 0, 1) : tree.stage === "charred" ? 0.2 : 0;
      const width = 27 * tree.size * growthScale * depthScale * (1 + collapse * 0.1);
      const height = 41 * tree.size * growthScale * depthScale * (1 - collapse * 0.28);
      const sprite = this.treeSprite(tree, active);
      const sway = Math.sin(tree.sway) * (tree.stage === "burning" ? 0.045 : 0.018) * this.motion.motionScale
        + collapse * (tree.id % 2 === 0 ? -0.16 : 0.16);
      this.shadow(this.scenery, tree.x, tree.y + 10, width * 0.28, Math.max(1.1, height * 0.05), 0.11);
      if (sprite === "treeRecovery") {
        this.scenery
          .circle(tree.x, tree.y + 10 - height * 0.48, width * 0.23)
          .fill({ color: 0xffc85a, alpha: 0.32 });
      }
      this.sprite(this.scenerySprites, sprite, tree.x, tree.y + 10 + collapse * 4, width, height, {
        rotation: sway,
        alpha: tree.stage === "charred" ? 0.86 : tree.y < 120 ? 0.84 : 0.96,
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

  private drawFactory(world: WorldState, snapshot: AgentSnapshot, scene: WorldScene): void {
    const forge = SCENE_LAYOUT.forge;
    const industrialScene = scene !== "poka" && scene !== "meguri";
    const lineStopped = scene === "approval" || scene === "zero-output";
    const operating = snapshot.active && !lineStopped;
    const forgeScale = industrialScene ? 1 : 0.54;
    const forgeX = industrialScene ? forge.x : 254;
    const forgeY = industrialScene ? forge.y : 143;
    const intensity = effortMultiplier(snapshot.effort);
    const pulse = 1 + (operating ? world.combustionPulse * 0.055 : 0) + Math.sin(world.factoryPulse) * (operating ? 0.013 + intensity * 0.005 : 0.004);
    if (operating) {
      this.scenery
        .circle(forgeX, 132, 51)
        .fill({ color: 0xff8e2e, alpha: 0.12 + world.heat * 0.12 + world.combustionPulse * 0.14 });
    }
    this.shadow(this.scenery, forgeX, forgeY + 3, 41 * forgeScale, 7 * forgeScale, operating ? 0.27 : industrialScene ? 0.2 : 0.1);
    this.cutout(
      this.scenerySprites,
      operating ? "forgeActive" : "forgeRecovery",
      forgeX,
      forgeY,
      forge.width * pulse * forgeScale,
      forge.height * pulse * forgeScale,
      { alpha: operating ? 1 : industrialScene ? 0.74 : 0.42 },
    );
    this.drawFactorySecondaryMotion(world, forgeX, forgeY, forgeScale, operating);
    if (operating) {
      this.sprite(this.scenerySprites, "smoke", forgeX + 1, 84, 27, 39, {
        rotation: Math.sin(this.motionTime(world.elapsed) * 1.4) * 0.08,
        alpha: 0.39 + world.pollution * 0.18,
      });
      this.sprite(this.scenerySprites, "smoke", forgeX + 20, 79, 20, 31, {
        rotation: -Math.sin(this.motionTime(world.elapsed) * 1.1) * 0.07,
        alpha: 0.32 + world.pollution * 0.18,
      });
      if (scene === "gogo") this.drawAuxiliaryForge(world);
    } else if (lineStopped) {
      const residual = scene === "zero-output" ? 0.42 : 0.23;
      this.sprite(this.scenerySprites, "smoke", forgeX + 1, 85, 24, 35, {
        rotation: scene === "zero-output" ? 0.08 : 0,
        alpha: residual + world.pollution * 0.12,
      });
      this.sprite(this.scenerySprites, "smoke", forgeX + 18, 81, 17, 26, {
        rotation: -0.05,
        alpha: residual * 0.7,
      });
    }
  }

  private drawFactoryGrowth(growthLevel: number, forgeX: number, forgeY: number, scale: number, active: boolean): void {
    const pieces = Math.min(23, Math.max(0, growthLevel));
    const metal = active ? 0xa8794c : 0x71856d;
    const dark = active ? 0x4a342a : 0x465847;
    for (let index = 0; index < pieces; index += 1) {
      if (index < 6) {
        const x = forgeX - 50 + (index % 3) * 10;
        const y = forgeY - 18 - Math.floor(index / 3) * 12;
        this.factoryGrowth.moveTo(x, y).lineTo(x + 12, y).lineTo(x + 12, y + 8).stroke({ color: metal, width: 2.2 * scale, alpha: 0.72 });
        this.factoryGrowth.circle(x, y, 2.2 * scale).fill({ color: dark, alpha: 0.78 });
      } else if (index < 10) {
        const gauge = index - 6;
        const x = forgeX - 43 + gauge * 11;
        const y = forgeY - 54 - (gauge % 2) * 5;
        this.factoryGrowth.circle(x, y, 4.2 * scale).fill({ color: 0xd8c28b, alpha: 0.7 }).stroke({ color: dark, width: 1, alpha: 0.9 });
        this.factoryGrowth.moveTo(x, y).lineTo(x + Math.cos(gauge) * 3, y - 2.5).stroke({ color: 0x8a4027, width: 0.8, alpha: 0.9 });
      } else if (index < 14) {
        const tank = index - 10;
        const x = forgeX + 43 + (tank % 2) * 9;
        const y = forgeY - 9 - Math.floor(tank / 2) * 24;
        this.factoryGrowth.roundRect(x - 5, y - 13, 10, 19, 4).fill({ color: metal, alpha: 0.64 }).stroke({ color: dark, width: 1.1, alpha: 0.82 });
      } else if (index < 18) {
        const step = index - 14;
        const x = forgeX - 57 + step * 9;
        this.factoryGrowth.moveTo(x, forgeY + 2).lineTo(x + 5, forgeY - 44).stroke({ color: dark, width: 1.3, alpha: 0.72 });
        this.factoryGrowth.moveTo(x - 2, forgeY - 12 - step * 4).lineTo(x + 12, forgeY - 12 - step * 4).stroke({ color: metal, width: 1, alpha: 0.65 });
      } else if (index < 21) {
        const stack = index - 18;
        const x = forgeX + 30 + stack * 8;
        // 本体の根元だけを静的署名へ置き、細い煙突は毎frameの二次運動で描く。
        this.factoryGrowth.roundRect(x - 4, forgeY - 35, 8, 5, 2).fill({ color: dark, alpha: 0.78 });
        this.factoryGrowth.rect(x - 5, forgeY - 37, 10, 3).fill({ color: metal, alpha: 0.76 });
      } else {
        const vent = index - 21;
        const x = forgeX - 28 + vent * 22;
        this.factoryGrowth.circle(x, forgeY - 67, 7).stroke({ color: metal, width: 2, alpha: 0.74 });
        this.factoryGrowth.moveTo(x - 4, forgeY - 67).lineTo(x + 4, forgeY - 67).moveTo(x, forgeY - 71).lineTo(x, forgeY - 63).stroke({ color: dark, width: 1, alpha: 0.78 });
      }
    }
  }

  private drawFactorySecondaryMotion(
    world: WorldState,
    forgeX: number,
    forgeY: number,
    scale: number,
    operating: boolean,
  ): void {
    const stackCount = Math.max(0, Math.min(3, world.growthLevel - 18));
    if (stackCount === 0) return;
    const motion = sampleSecondaryFollowAt(
      this.motionTime(world.elapsed),
      this.motion.motionScale > 0 && world.activeEvent ? world.eventElapsed : null,
    );
    const metal = operating ? 0xa8794c : 0x71856d;
    const dark = operating ? 0x4a342a : 0x465847;
    for (let stack = 0; stack < stackCount; stack += 1) {
      const x = forgeX + 30 + stack * 8;
      const baseY = forgeY - 31;
      const height = (28 + stack * 5) * scale;
      const sway = motion.chimney * (0.55 + stack * 0.16) * this.motion.motionScale;
      this.scenery
        .moveTo(x - 3 * scale, baseY)
        .lineTo(x + sway - 3 * scale, baseY - height)
        .lineTo(x + sway + 3 * scale, baseY - height)
        .lineTo(x + 3 * scale, baseY)
        .closePath()
        .fill({ color: dark, alpha: 0.78 });
      this.scenery
        .rect(x + sway - 5 * scale, baseY - height - 4 * scale, 10 * scale, 4 * scale)
        .fill({ color: metal, alpha: 0.76 });
    }
  }

  private drawAuxiliaryForge(world: WorldState): void {
    const pulse = 1 + Math.sin(this.motionTime(world.elapsed) * 8) * 0.035 + world.combustionPulse * 0.04;
    this.shadow(this.scenery, 300, 162, 14, 3, 0.22);
    this.scenery.roundRect(288, 136, 24, 27, 5).fill({ color: 0x503a31, alpha: 0.96 }).stroke({ color: 0xb27c45, width: 1.5, alpha: 0.84 });
    this.scenery.circle(300, 151, 7 * pulse).fill({ color: 0xff8c2d, alpha: 0.76 }).stroke({ color: 0xffcf6c, width: 1.1, alpha: 0.88 });
    this.scenery.rect(305, 112, 6, 27).fill({ color: 0x3d302c, alpha: 0.94 });
    this.scenery.roundRect(181, 132, 22, 31, 5).fill({ color: 0x4b3730, alpha: 0.94 }).stroke({ color: 0xb27c45, width: 1.4, alpha: 0.82 });
    this.scenery.circle(192, 151, 6 * pulse).fill({ color: 0xff8c2d, alpha: 0.72 }).stroke({ color: 0xffcf6c, width: 1, alpha: 0.86 });
    this.scenery.moveTo(202, 142).lineTo(218, 142).lineTo(218, 131).stroke({ color: 0xa8794c, width: 2.4, alpha: 0.76 });
    this.sprite(this.scenerySprites, "smoke", 239, 67, 31, 44, { rotation: delayedFollow(this.motionTime(world.elapsed), 1.7, 0.12, 0.1), alpha: 0.54 });
    this.sprite(this.scenerySprites, "smoke", 270, 60, 25, 38, { rotation: -delayedFollow(this.motionTime(world.elapsed), 1.3, 0.2, 0.09), alpha: 0.5 });
    for (let index = 0; index < 3; index += 1) {
      const phase = (this.motionTime(world.elapsed) * 0.6 + index * 0.31) % 1;
      this.effects.circle(308 + Math.sin(index) * 3, 111 - phase * 25, 3 + phase * 4).fill({ color: 0x3a3435, alpha: (1 - phase) * 0.32 });
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
      this.staticRigging
        .roundRect(point.x - 4, point.y - 4, 8, 3, 1.5)
        .fill({ color: 0x543522, alpha: 0.7 })
        .moveTo(point.x, point.y - 2)
        .lineTo(point.x + 2, 192)
        .stroke({ color: 0x6b4328, width: 2.2, alpha: 0.72 });
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
    const motionTime = this.motionTime(world.elapsed);
    const hammerCycle = motionTime * hammerSpeed;
    const springHammer = sampleHammerMotion(motionTime, hammerSpeed);
    const hammerSwing = isError
      ? -0.18 + Math.sin(this.motionTime(world.elapsed) * 11) * 0.06
      : isHolding
        ? -0.88 + Math.sin(this.motionTime(world.elapsed) * 1.8) * 0.08
        : springHammer.angle;
    const impact = isStriking ? springHammer.impact : 0;
    const emberBob = Math.sin(this.motionTime(world.elapsed) * (isHolding ? 2.2 : 5.6)) * (isHolding ? 0.45 : 0.95) - impact * 1.15;

    const route = layout.cart.maxX - layout.cart.minX;
    const activityFactor = isHolding ? 0.38 : isError ? 0.12 : 1;
    const cartSpeed = ((snapshot.tool === "shell" ? 7.7 : 6.1) + intensity * 1.2) * activityFactor;
    const phase = (this.motionTime(world.elapsed) * cartSpeed) % (route * 2);
    const travellingRight = phase <= route;
    const cartX = layout.cart.minX + (travellingRight ? phase : route * 2 - phase);
    const wheelBob = Math.sin(this.motionTime(world.elapsed) * Math.max(1, cartSpeed) * 1.9) * 0.35 * activityFactor;
    const kururiX = cartX + (travellingRight ? 31 : -13);

    // 非主役は奥の小さな紙人形として先に置き、主役の輪郭へ重ねない。
    const mizumoBob = Math.sin(this.motionTime(world.elapsed) * 2.6) * 0.45;
    this.character("mizumo", world, layout.mizumo.x, layout.mizumo.y + mizumoBob, layout.mizumo.width, layout.mizumo.height, {
      alpha: 0.28,
      tint: 0xc3aa91,
      rotation: Math.sin(this.motionTime(world.elapsed) * 2) * 0.012,
    });

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
      rotation: Math.sin(this.motionTime(world.elapsed) * Math.max(1, cartSpeed) * 1.9) * 0.018,
    });

    this.sprite(this.actorSprites, "hammer", layout.hammer.x, layout.hammer.y + emberBob, layout.hammer.width, layout.hammer.height, {
      rotation: hammerSwing,
      anchorX: layout.hammer.anchorX,
      anchorY: layout.hammer.anchorY,
    });
    this.character(
      "hinoko",
      world,
      layout.hinoko.x,
      layout.hinoko.y + emberBob + impact * 1.5,
      layout.hinoko.width * (1 + impact * 0.11),
      layout.hinoko.height * (1 - impact * 0.08),
      { stretch: isStriking ? springHammer.stretch : 1 },
    );

    const sumiBob = Math.sin(this.motionTime(world.elapsed) * (6.8 + intensity) + 0.8) * (isHolding ? 0.7 : 1.35);
    this.character("sumi", world, layout.sumi.x, layout.sumi.y + sumiBob, layout.sumi.width, layout.sumi.height);
    this.sprite(this.actorSprites, "tokenCrystal", layout.crystal.x, layout.crystal.y + sumiBob, layout.crystal.width, layout.crystal.height, {
      rotation: Math.sin(this.motionTime(world.elapsed) * (isHolding ? 1.4 : 3)) * 0.07,
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

  private drawIdleCrew(world: WorldState): void {
    const time = this.motionTime(world.elapsed);
    const ember = 1 + Math.sin(time * 3.1) * 0.09;
    this.sprite(this.effectSprites, "flame", 254, 131, 10 * ember, 14 * ember, { alpha: 0.7 });

    const yawn = Math.max(0, Math.sin(time * 0.55));
    this.character("sumi", world, 221, 166 + yawn * 1.2, 30, 42 - yawn * 2, { expressionFrame: 3, alpha: 0.9 });
    this.character("kururi", world, 171, 167, 36, 42, { expressionFrame: 1, rotation: Math.sin(time * 0.8) * 0.018 });
    this.character("hinoko", world, 201, 168, 35, 44, { expressionFrame: 1, alpha: 0.92 });
    this.actorRigging.roundRect(155, 147, 25, 18, 2).fill({ color: 0xd5bd87, alpha: 0.9 }).stroke({ color: 0x6a4328, width: 1, alpha: 0.8 });
    this.actorRigging.moveTo(159, 152).lineTo(176, 152).moveTo(159, 157).lineTo(171, 157).stroke({ color: 0x755037, width: 0.8, alpha: 0.66 });
    if (yawn > 0.72) {
      this.effects.circle(224, 120 - yawn * 4, 2.2).stroke({ color: 0xf2e4c1, width: 0.8, alpha: 0.48 });
    }
  }

  private drawZeroOutputCrew(world: WorldState): void {
    const ledgerX = 218;
    const ledgerY = 154;
    this.shadow(this.actorRigging, ledgerX, ledgerY + 10, 27, 4, 0.25);
    this.actorRigging
      .moveTo(ledgerX, ledgerY - 10)
      .lineTo(ledgerX - 24, ledgerY - 15)
      .lineTo(ledgerX - 22, ledgerY + 7)
      .lineTo(ledgerX, ledgerY + 10)
      .closePath()
      .fill({ color: 0xe1c895, alpha: 0.95 })
      .stroke({ color: 0x6d432c, width: 1.2 });
    this.actorRigging
      .moveTo(ledgerX, ledgerY - 10)
      .lineTo(ledgerX + 24, ledgerY - 15)
      .lineTo(ledgerX + 22, ledgerY + 7)
      .lineTo(ledgerX, ledgerY + 10)
      .closePath()
      .fill({ color: 0xead5a8, alpha: 0.96 })
      .stroke({ color: 0x6d432c, width: 1.2 });
    for (let row = 0; row < 3; row += 1) {
      this.actorRigging.moveTo(ledgerX - 18, ledgerY - 8 + row * 5).lineTo(ledgerX - 4, ledgerY - 6 + row * 5).stroke({ color: 0x8c6544, width: 0.7, alpha: 0.72 });
      this.actorRigging.moveTo(ledgerX + 4, ledgerY - 6 + row * 5).lineTo(ledgerX + 18, ledgerY - 8 + row * 5).stroke({ color: 0x8c6544, width: 0.7, alpha: 0.72 });
    }

    this.character("hinoko", world, 178, 171, 38, 48, { expressionFrame: 4, rotation: 0.045 });
    this.character("sumi", world, 258, 170, 30, 41, { expressionFrame: 4, flipX: true, alpha: 0.9 });
    this.character("kururi", world, 143, 168, 32, 37, { expressionFrame: 4, rotation: 0.035 });
    this.character("mebuki", world, 285, 169, 27, 38, { expressionFrame: 3, flipX: true, alpha: 0.86 });
    this.character("mizumo", world, 306, 166, 23, 32, { expressionFrame: 2, flipX: true, alpha: 0.72 });
    this.character("fuwame", world, 252, 112, 32, 32, { expressionFrame: 3, anchorY: 0.5, alpha: 0.78 });
    this.effects.rect(12, 13, 296, 164).stroke({ color: 0xb05d45, width: 1.1, alpha: 0.26 });
  }

  private drawApprovalCrew(world: WorldState): void {
    // 機械を止め、六人を同じ驚き表情で観客側へ向ける。判断条件はWorldScene側だけに置く。
    this.character("kururi", world, 139, 169, 35, 41, { expressionFrame: 4 });
    this.character("hinoko", world, 179, 170, 43, 53, { expressionFrame: 4 });
    this.character("sumi", world, 219, 169, 33, 45, { expressionFrame: 4 });
    this.character("mebuki", world, 252, 169, 31, 44, { expressionFrame: 3 });
    this.character("mizumo", world, 285, 168, 29, 40, { expressionFrame: 2 });
    this.character("fuwame", world, 238, 103, 38, 38, { expressionFrame: 3, anchorY: 0.5 });
    this.effects.rect(11, 13, 298, 165).fill({ color: 0x2b2524, alpha: 0.12 });
    this.effects
      .moveTo(154, 40)
      .lineTo(166, 40)
      .lineTo(170, 50)
      .lineTo(150, 50)
      .closePath()
      .fill({ color: 0xd8a74d, alpha: 0.92 })
      .stroke({ color: 0x5f3a25, width: 1.1, alpha: 0.9 });
    this.effects.circle(160, 52, 2.5).fill({ color: 0xd07835, alpha: 0.9 });
  }

  private drawCeremonyCrew(world: WorldState): void {
    const time = this.motionTime(world.elapsed);
    const hinokoHop = sampleHopMotion(time, 1.8, 0);
    const sumiHop = sampleHopMotion(time, 1.8, 0.58);
    const kururiHop = sampleHopMotion(time, 1.8, 1.16);
    this.character("hinoko", world, 213, 167 + hinokoHop.y * 0.18, 49, 61, { expressionFrame: 2, stretch: hinokoHop.stretch });
    this.character("sumi", world, 262, 169 + sumiHop.y * 0.14, 34, 48, { expressionFrame: 2, stretch: sumiHop.stretch });
    this.character("kururi", world, 155, 169 + kururiHop.y * 0.14, 39, 45, { expressionFrame: 2, flipX: true, stretch: kururiHop.stretch });
    this.character("mebuki", world, 294, 169, 29, 41, { expressionFrame: 2, flipX: true, alpha: 0.9 });
    this.character("fuwame", world, 251, 89, 39, 39, { expressionFrame: 1, anchorY: 0.5, alpha: 0.9 });
    this.character("mizumo", world, 319, 168, 22, 31, { expressionFrame: 1, flipX: true, alpha: 0.72 });
    this.effects
      .moveTo(202, 112)
      .lineTo(207, 102)
      .lineTo(213, 109)
      .lineTo(219, 101)
      .lineTo(225, 112)
      .closePath()
      .fill({ color: 0xf6cc4f, alpha: 0.96 })
      .stroke({ color: 0x8d5b23, width: 1 });
    this.effects.rect(204, 110, 19, 5).fill({ color: 0xd89831, alpha: 0.98 });
    this.effects.roundRect(184, 118, 56, 9, 2).fill({ color: 0xe8c96b, alpha: 0.82 }).stroke({ color: 0x80522c, width: 1 });
    this.effects.circle(212, 122, 3).fill({ color: 0xb75b2c, alpha: 0.92 });
  }

  private drawRecoveryCrew(world: WorldState): void {
    const layout = SCENE_LAYOUT.recovery;
    const motionTime = this.motionTime(world.elapsed);
    const idleBob = Math.sin(motionTime * 1.8) * 0.32;
    const secondary = sampleSecondaryFollowAt(motionTime);

    // 休止中の非主役は奥の待機列へ。半透明の巨大像にせず、劇団が居る気配だけ残す。
    this.character("kururi", world, layout.kururi.x, layout.kururi.y, layout.kururi.width, layout.kururi.height, {
      alpha: 0.26,
      tint: 0xb9a48c,
    });
    this.character("hinoko", world, layout.hinoko.x, layout.hinoko.y + idleBob, layout.hinoko.width, layout.hinoko.height, {
      alpha: 0.26,
      tint: 0xb9a48c,
    });
    this.sprite(
      this.actorSprites,
      "sumi",
      layout.sleepingSumi.x,
      layout.sleepingSumi.y - idleBob * 0.25,
      layout.sleepingSumi.width,
      layout.sleepingSumi.height,
      { alpha: 0.26, flipX: true, expressionFrame: 3, tint: 0xb9a48c },
    );
    for (let index = 0; index < 2; index += 1) {
      const phase = (this.motionTime(world.elapsed) * 0.32 + index * 0.38) % 1;
      this.effects
        .circle(layout.sleepingSumi.x + 3 + phase * 6, layout.sleepingSumi.y - 24 - phase * 10 - index * 2, 0.9 + phase)
        .stroke({ color: 0xf3f5e3, width: 0.8, alpha: 0.2 + (1 - phase) * 0.34 });
    }

    const cloudX = layout.fuwame.x + Math.sin(this.motionTime(world.elapsed) * 0.65) * 11 + world.interaction.fuwameOffsetX;
    const cloudY = layout.fuwame.y + Math.sin(this.motionTime(world.elapsed) * 1.3) * 1.4;
    this.actorRigging
      .moveTo(layout.fuwame.x - 8, 9)
      .lineTo(cloudX - 7 - delayedFollow(this.motionTime(world.elapsed), 0.65, 0.22, 1.8), cloudY - 18)
      .moveTo(layout.fuwame.x + 8, 9)
      .lineTo(cloudX + 7 - delayedFollow(this.motionTime(world.elapsed), 0.65, 0.3, 1.4), cloudY - 18)
      .stroke({ color: 0xd8c5a2, width: 0.65, alpha: 0.48 });
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
        rotation: -0.31 + secondary.tool * 0.1 * this.motion.motionScale,
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

    const mizumoBob = Math.sin(this.motionTime(world.elapsed) * 2.2) * 1.05;
    this.character("mizumo", world, layout.mizumo.x, layout.mizumo.y + mizumoBob, layout.mizumo.width, layout.mizumo.height, {
      rotation: Math.sin(this.motionTime(world.elapsed) * 2) * 0.022,
    });
    this.sprite(this.actorSprites, "splash", layout.mizumo.x, layout.mizumo.y + 2, 42, 21, {
      alpha: 0.36 + Math.sin(this.motionTime(world.elapsed) * 3.4) * 0.07,
    });
  }

  private drawParticle(particle: Particle): void {
    const alpha = Math.max(0, particle.life / particle.maxLife);
    if (particle.kind === "smoke") {
      this.sprite(this.effectSprites, "smoke", particle.x, particle.y, particle.size * 5.4, particle.size * 7.1, {
        alpha: alpha * 0.5,
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

  private drawSceneEffects(world: WorldState, scene: WorldScene): void {
    const time = this.motionTime(world.elapsed);
    if ((scene === "mera" || scene === "gogo") && world.combustionPulse > 0.025) {
      const count = scene === "gogo" ? 6 : 4;
      for (let index = 0; index < count; index += 1) {
        const progress = (time * (scene === "gogo" ? 1.7 : 1.2) + index / count) % 1;
        const eased = progress * progress;
        const x = 138 + (238 - 138) * eased;
        const y = 72 + Math.sin(progress * Math.PI) * 28 + (129 - 72) * eased;
        this.sprite(this.effectSprites, "token", x, y, 5 + progress * 3, 5 + progress * 3, {
          anchorX: 0.5,
          anchorY: 0.5,
          rotation: time * 5 + index,
          alpha: clamp(world.combustionPulse * 1.4, 0.2, 0.92) * (0.55 + progress * 0.45),
        });
      }
    }

    if (scene === "gogo") {
      for (let index = 0; index < 2; index += 1) {
        const x = 58 + ((time * 18 + index * 91) % 120);
        this.sprite(this.effectSprites, "logCart", x, 176 - index * 5, 29, 21, { flipX: index % 2 === 1, alpha: 0.76 });
        this.sprite(this.effectSprites, "logs", x, 163 - index * 5, 22, 15, { flipX: index % 2 === 1, alpha: 0.8 });
      }
    }

    if (scene === "kirari" && this.motion.allowParticles) {
      const palette = [0xf2ca54, 0x79b66c, 0xd86a43, 0xf0e0a0];
      for (let index = 0; index < 18; index += 1) {
        const fall = (time * 0.32 + index * 0.083) % 1;
        const x = 42 + ((index * 47) % 252) + Math.sin(time * 2 + index) * 4;
        const y = 34 + fall * 126;
        this.effects.rect(x, y, 2 + (index % 2), 4).fill({ color: palette[index % palette.length], alpha: 0.72 });
        if (index % 5 === 0 && fall > 0.55) this.sprite(this.effectSprites, "flame", x + 1, y + 2, 5, 7, { alpha: 0.66 });
      }
    }
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
  }

  private drawProscenium(active: boolean): void {
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
      const glow = 0.58 + (index % 3) * 0.04;
      this.proscenium.circle(x, 183, 2.8).fill({ color: active ? 0xffbc4e : 0xd8e8ad, alpha: glow });
      this.proscenium.circle(x, 183, 5.5).fill({ color: active ? 0xff8a32 : 0xb5d98f, alpha: glow * 0.08 });
    }
    this.proscenium.rect(0.5, 0.5, 319, 191).stroke({ color: 0xd59d54, width: 1, alpha: 0.55 });
  }

  private drawCurtainTransition(): void {
    if (this.motion.motionScale === 0) {
      this.transitionStartedAt = -1;
      return;
    }
    if (this.transitionStartedAt < 0) return;
    const progress = (performance.now() - this.transitionStartedAt) / 860;
    if (progress >= 1) {
      this.transitionStartedAt = -1;
      return;
    }
    const closure = Math.sin(progress * Math.PI);
    const width = 8 + closure * 154;
    this.curtainTransition.rect(0, 0, width, WORLD_HEIGHT).fill({ color: 0x672128, alpha: 0.98 });
    this.curtainTransition.rect(WORLD_WIDTH - width, 0, width, WORLD_HEIGHT).fill({ color: 0x672128, alpha: 0.98 });
    for (let index = 0; index < 5; index += 1) {
      const fold = width * ((index + 1) / 6);
      this.curtainTransition.moveTo(fold, 0).lineTo(fold * 0.92, WORLD_HEIGHT).stroke({ color: 0xa94743, width: 1.4, alpha: 0.34 });
      this.curtainTransition.moveTo(WORLD_WIDTH - fold, 0).lineTo(WORLD_WIDTH - fold * 0.92, WORLD_HEIGHT).stroke({ color: 0xa94743, width: 1.4, alpha: 0.34 });
    }
    this.curtainTransition.rect(width - 3, 0, 3, WORLD_HEIGHT).fill({ color: 0xd08a58, alpha: 0.42 });
    this.curtainTransition.rect(WORLD_WIDTH - width, 0, 3, WORLD_HEIGHT).fill({ color: 0xd08a58, alpha: 0.42 });
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
    const reacting = life.act === "react" && life.until > world.elapsed;
    const reactionWave = reacting ? Math.abs(Math.sin(this.motionTime(world.elapsed) * 13)) : 0;
    const scale = hovered ? 1.045 : 1;
    const time = this.motionTime(world.elapsed);
    const blinkOpenness = this.motion.motionScale === 0 ? 1 : blinkOpennessAt(time, CHARACTER_MOTION_SEEDS[id]);
    const expressionFrame = options.expressionFrame
      ?? (blinkOpenness < 0.22 && !reacting ? CHARACTER_EXPRESSION_FRAMES[id].sleepy : CHARACTER_EXPRESSION_FRAMES[id][life.mood]);
    const breath = this.motion.motionScale === 0 ? 1 : breathingScaleAt(time, CHARACTER_MOTION_SEEDS[id]);
    const volume = volumePreservingScale(breath, (options.stretch ?? 1) * (1 - reactionWave * 0.08));
    const entranceScale = this.motion.motionScale > 0 && reacting && world.activeEvent && world.eventElapsed < 1
      ? samplePopInScale(world.eventElapsed)
      : 1;
    this.cutout(
      this.actorSprites,
      id,
      x + life.offsetX,
      y + life.offsetY - reactionWave * 2.2,
      width * scale * entranceScale * volume.sx,
      height * scale * entranceScale * volume.sy,
      {
        ...options,
        rotation: (options.rotation ?? 0) + (reacting ? Math.sin(this.motionTime(world.elapsed) * 15) * 0.035 : 0),
        expressionFrame,
      },
    );
  }

  private shadow(graphics: Graphics, x: number, y: number, radiusX: number, radiusY: number, alpha: number): void {
    graphics.ellipse(x, y, radiusX, radiusY).fill({ color: 0x241711, alpha });
  }
}
