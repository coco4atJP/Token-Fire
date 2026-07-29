import { Application, Container, Graphics, Sprite, Text } from "pixi.js";
import type { ReplayFrame, ReplaySession } from "../domain/experienceData";
import { SCENE_LAYOUT } from "./sceneLayout";
import { SpriteAtlas } from "./spriteAtlas";
import { StageViewport, STAGE_HEIGHT, STAGE_WIDTH } from "./stageViewport";

const REPLAY_WIDTH = 960;
const REPLAY_HEIGHT = 540;

export const exportReplayData = (replay: ReplaySession): void => {
  downloadBlob(new Blob([JSON.stringify(replay, null, 2)], { type: "application/json" }), `${safeName(replay.title)}.token-fire.json`);
};

export const exportReplayVideo = async (replay: ReplaySession): Promise<"video" | "data"> => {
  const canvas = document.createElement("canvas");
  if (typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
    exportReplayData(replay);
    return "data";
  }
  const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
    .find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!mimeType) {
    exportReplayData(replay);
    return "data";
  }

  let stage: ReplayStage;
  try {
    stage = await ReplayStage.create(canvas);
  } catch {
    exportReplayData(replay);
    return "data";
  }
  const stream = canvas.captureStream(30);
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  const stopped = new Promise<void>((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));
  recorder.start(250);

  const videoDuration = Math.max(7, Math.min(18, 7 + replay.frames.length / 75));
  const started = performance.now();
  await new Promise<void>((resolve) => {
    const draw = (now: number): void => {
      const progress = Math.min(1, (now - started) / (videoDuration * 1000));
      const frameIndex = Math.min(replay.frames.length - 1, Math.floor(progress * replay.frames.length));
      stage.render(replay, replay.frames[Math.max(0, frameIndex)], progress);
      if (progress < 1) requestAnimationFrame(draw);
      else resolve();
    };
    requestAnimationFrame(draw);
  });

  recorder.stop();
  await stopped;
  for (const track of stream.getTracks()) track.stop();
  stage.dispose();
  downloadBlob(new Blob(chunks, { type: mimeType }), `${safeName(replay.title)}.webm`);
  return "video";
};

class ReplayStage {
  private readonly root = new Container();
  private readonly graphics = new Graphics();
  private readonly background: Sprite;
  private readonly floor: Sprite;
  private readonly leftCurtain: Sprite;
  private readonly rightCurtain: Sprite;
  private readonly valance: Sprite;
  private readonly frame: Sprite;
  private readonly headline = label(9.4, 0xffd36b, "800");
  private readonly metrics = label(6.5, 0xf4ead8, "600");

  private constructor(
    private readonly app: Application,
    private readonly atlas: SpriteAtlas,
  ) {
    const viewport = new StageViewport(REPLAY_WIDTH, REPLAY_HEIGHT);
    this.root.scale.set(viewport.scale);
    this.root.position.set(viewport.offsetX, viewport.offsetY);
    this.background = sprite(atlas, "backdropRecovery", STAGE_WIDTH / 2, STAGE_HEIGHT, STAGE_WIDTH, STAGE_HEIGHT);
    this.floor = sprite(atlas, "stageFloor", STAGE_WIDTH / 2, STAGE_HEIGHT, STAGE_WIDTH, 90);
    this.leftCurtain = sprite(atlas, "curtainLeft", 0, 0, 48, 142, 0, 0);
    this.rightCurtain = sprite(atlas, "curtainRight", STAGE_WIDTH, 0, 48, 142, 1, 0);
    this.valance = sprite(atlas, "curtainValance", STAGE_WIDTH / 2, 0, STAGE_WIDTH, 38, 0.5, 0);
    this.frame = sprite(atlas, "prosceniumFrame", STAGE_WIDTH / 2, STAGE_HEIGHT, STAGE_WIDTH, STAGE_HEIGHT);
    this.headline.position.set(23, 35);
    this.metrics.position.set(23, 52);
    this.root.addChild(
      this.background,
      this.floor,
      this.graphics,
      this.leftCurtain,
      this.rightCurtain,
      this.valance,
      this.frame,
      this.headline,
      this.metrics,
    );
    this.app.stage.addChild(this.root);
  }

  static async create(canvas: HTMLCanvasElement): Promise<ReplayStage> {
    const app = new Application();
    await app.init({
      canvas,
      width: REPLAY_WIDTH,
      height: REPLAY_HEIGHT,
      antialias: true,
      autoStart: false,
      backgroundAlpha: 1,
      preference: "webgl",
      resolution: 1,
    });
    app.ticker.stop();
    return new ReplayStage(app, await SpriteAtlas.load());
  }

  render(replay: ReplaySession, frame: ReplayFrame, progress: number): void {
    const active = frame.active || frame.heat > 0.32;
    this.background.texture = this.atlas.get(active ? "backdropActive" : "backdropRecovery");
    const hasTheatreAssets = this.atlas.has("prosceniumFrame") && this.atlas.has("stageFloor");
    for (const item of [this.background, this.floor, this.leftCurtain, this.rightCurtain, this.valance, this.frame]) {
      item.visible = hasTheatreAssets;
    }

    const g = this.graphics.clear();
    if (!hasTheatreAssets) {
      g.rect(0, 0, STAGE_WIDTH, STAGE_HEIGHT).fill(active ? 0x684238 : 0x7eb6a0);
      this.drawFallbackFrame(g, active);
    }
    this.drawTrees(g, frame);
    this.drawFactory(g, frame, progress);
    this.drawLake(g, frame);
    g.roundRect(17, 31, 286, 37, 4).fill({ color: 0x1b1614, alpha: 0.8 });
    g.rect(17, 180, 286, 3).fill({ color: 0xffffff, alpha: 0.16 });
    g.rect(17, 180, 286 * progress, 3).fill(active ? 0xf2aa3f : 0x9bd3a5);

    this.headline.text = frame.event ? String(frame.event).toUpperCase() : active ? "TOKEN FORGE · ACTIVE" : "RECOVERY GROVE · CHILL";
    this.headline.style.fill = active ? 0xffc24a : 0xc9f0d4;
    this.metrics.text = `${replay.projectLabel} · ${frame.taskTokens.toLocaleString()} TOK · ENERGY ${frame.energyLevel + 1}/24 · FACTORY ${frame.growthLevel + 1}/24`;
    this.app.render();
  }

  dispose(): void {
    this.app.destroy(false, { children: true });
  }

  private drawTrees(g: Graphics, frame: ReplayFrame): void {
    for (let index = 0; index < frame.trees.length; index += 1) {
      const column = index % 7;
      const row = Math.floor(index / 7);
      const x = 23 + column * 20 + row * 3;
      const y = 166 - row * 26 + Math.sin(index * 1.7) * 1.5;
      const stage = frame.trees[index];
      g.moveTo(x, y + 8).lineTo(x, y - 4).stroke({ color: 0x4a3023, width: 2 });
      if (stage === "c") g.rect(x - 3, y - 8, 6, 7).fill(0x302825);
      else if (stage === "b") g.circle(x, y - 8, 6).fill(0xff8a2a);
      else g.circle(x, y - 8, stage === "s" ? 4 : 7).fill(stage === "s" ? 0x8fc46b : 0x4f995e);
    }
  }

  private drawFactory(g: Graphics, frame: ReplayFrame, progress: number): void {
    const { x, y, width, height } = SCENE_LAYOUT.forge;
    g.roundRect(x - width / 2, y - height, width, height, 5).fill(0x3c3c40);
    g.roundRect(x - 13, y - 34, 27, 29, 3).fill({ color: 0xff7e26, alpha: 0.35 + frame.heat * 0.65 });
    const chimneys = 1 + Math.floor(frame.growthLevel / 5);
    for (let index = 0; index < chimneys; index += 1) {
      const chimneyHeight = 22 + (index % 3) * 5 + frame.growthLevel * 0.4;
      const chimneyX = x - 34 + index * 10;
      g.rect(chimneyX, y - height - chimneyHeight, 7, chimneyHeight).fill(0x55565a);
      if (frame.active) {
        g.circle(chimneyX + 3 + Math.sin(progress * 25 + index) * 3, y - height - chimneyHeight - 5, 6 + frame.pollution * 4)
          .fill({ color: 0x443a3d, alpha: 0.35 + frame.pollution * 0.55 });
      }
    }
  }

  private drawLake(g: Graphics, frame: ReplayFrame): void {
    g.ellipse(SCENE_LAYOUT.lake.x, 154, SCENE_LAYOUT.lake.radiusX, Math.max(5, 18 * frame.water))
      .fill({ color: frame.heat > 0.7 ? 0x737d75 : 0x45a3bf, alpha: 0.88 });
  }

  private drawFallbackFrame(g: Graphics, active: boolean): void {
    const wood = active ? 0x4d2f24 : 0x49352a;
    g.rect(0, 0, STAGE_WIDTH, 10).fill(wood);
    g.rect(0, 0, 10, STAGE_HEIGHT).fill(wood);
    g.rect(STAGE_WIDTH - 10, 0, 10, STAGE_HEIGHT).fill(wood);
    g.rect(0, STAGE_HEIGHT - 10, STAGE_WIDTH, 10).fill(wood);
  }
}

const label = (fontSize: number, fill: number, fontWeight: "600" | "800"): Text =>
  new Text({
    style: {
      fill,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize,
      fontWeight,
    },
  });

const sprite = (
  atlas: SpriteAtlas,
  key: Parameters<SpriteAtlas["get"]>[0],
  x: number,
  y: number,
  width: number,
  height: number,
  anchorX = 0.5,
  anchorY = 1,
): Sprite => {
  const value = new Sprite({ texture: atlas.get(key) });
  value.anchor.set(anchorX, anchorY);
  value.position.set(x, y);
  value.width = width;
  value.height = height;
  return value;
};

export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
};

const safeName = (name: string): string =>
  name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 80) || "token-fire-replay";
