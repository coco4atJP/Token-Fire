import { Application, Container, Graphics, Sprite, Text } from "pixi.js";
import type { ReplayFrame, ReplaySession } from "../domain/experienceData";
import { SCENE_LAYOUT } from "./sceneLayout";
import { SpriteAtlas } from "./spriteAtlas";
import { StageViewport, STAGE_HEIGHT, STAGE_WIDTH } from "./stageViewport";
import { sampleSecondaryFollowAt } from "./motion/spring";

const REPLAY_WIDTH = 960;
const REPLAY_HEIGHT = 540;

/**
 * ReplaySessionの保存形式は変えず、帳簿を開いた時だけ代表場面を選ぶ。
 * 未完了は最後に残った現場、完了済みは相対Energyが最大の場面を採用する。
 */
export const selectReplayRepresentativeFrame = (replay: ReplaySession): ReplayFrame | null => {
  if (replay.frames.length === 0) return null;
  if (replay.wasted) return replay.frames.at(-1) ?? null;
  return replay.frames.reduce((selected, frame) => {
    const selectedScore = [selected.energyLevel, selected.heat, selected.pollution, selected.taskTokens];
    const frameScore = [frame.energyLevel, frame.heat, frame.pollution, frame.taskTokens];
    for (let index = 0; index < frameScore.length; index += 1) {
      if (frameScore[index] > selectedScore[index]) return frame;
      if (frameScore[index] < selectedScore[index]) return selected;
    }
    return selected;
  });
};

export const readReplayFrameProgress = (replay: ReplaySession, frame: ReplayFrame): number => {
  const durationSeconds = Math.max(1, (replay.endedAt - replay.startedAt) / 1_000);
  return Math.max(0, Math.min(1, frame.t / durationSeconds));
};

export interface ReplayEventMotion {
  readonly type: string;
  readonly ageSeconds: number;
  readonly impulse: number;
}

/** ReplayFrame形式を変えず、連続するevent列とframe時刻からevent impulseを再構成する。 */
export const readReplayEventMotion = (replay: ReplaySession, frame: ReplayFrame): ReplayEventMotion | null => {
  if (!frame.event) return null;
  let frameIndex = replay.frames.indexOf(frame);
  if (frameIndex < 0) {
    frameIndex = replay.frames.findIndex((candidate) => candidate.t === frame.t && candidate.event === frame.event);
  }
  if (frameIndex < 0) return null;
  let startIndex = frameIndex;
  while (startIndex > 0 && replay.frames[startIndex - 1].event === frame.event) startIndex -= 1;
  const ageSeconds = Math.max(0, frame.t - replay.frames[startIndex].t);
  const withEvent = sampleSecondaryFollowAt(frame.t, ageSeconds).chimney;
  const ambient = sampleSecondaryFollowAt(frame.t).chimney;
  return {
    type: frame.event,
    ageSeconds,
    impulse: withEvent - ambient,
  };
};

export const renderReplayThumbnail = async (replay: ReplaySession): Promise<string | null> => {
  const frame = selectReplayRepresentativeFrame(replay);
  if (!frame) return null;
  const canvas = document.createElement("canvas");
  let stage: ReplayStage | null = null;
  try {
    stage = await ReplayStage.create(canvas, 320, 180);
    stage.render(replay, frame, readReplayFrameProgress(replay, frame));
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    stage?.dispose();
  }
};

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
    width: number,
    height: number,
  ) {
    const viewport = new StageViewport(width, height);
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

  static async create(canvas: HTMLCanvasElement, width = REPLAY_WIDTH, height = REPLAY_HEIGHT): Promise<ReplayStage> {
    const app = new Application();
    await app.init({
      canvas,
      width,
      height,
      antialias: true,
      autoStart: false,
      backgroundAlpha: 1,
      preference: "webgl",
      resolution: 1,
    });
    app.ticker.stop();
    return new ReplayStage(app, await SpriteAtlas.load(), width, height);
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
    this.drawFactory(g, frame, readReplayEventMotion(replay, frame)?.impulse ?? 0);
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

  private drawFactory(g: Graphics, frame: ReplayFrame, eventImpulse: number): void {
    const { x, y, width, height } = SCENE_LAYOUT.forge;
    g.roundRect(x - width / 2, y - height, width, height, 5).fill(0x3c3c40);
    g.roundRect(x - 13, y - 34, 27, 29, 3).fill({ color: 0xff7e26, alpha: 0.35 + frame.heat * 0.65 });
    const chimneys = 1 + Math.floor(frame.growthLevel / 5);
    for (let index = 0; index < chimneys; index += 1) {
      const chimneyHeight = 22 + (index % 3) * 5 + frame.growthLevel * 0.4;
      const chimneyX = x - 34 + index * 10;
      const follow = sampleSecondaryFollowAt(frame.t + index * 0.03).chimney + eventImpulse;
      const topX = chimneyX + follow * (0.45 + index * 0.08);
      g.moveTo(chimneyX, y - height)
        .lineTo(topX, y - height - chimneyHeight)
        .lineTo(topX + 7, y - height - chimneyHeight)
        .lineTo(chimneyX + 7, y - height)
        .closePath()
        .fill(0x55565a);
      if (frame.active) {
        g.circle(topX + 3 + Math.sin(frame.t * 2.5 + index) * 3, y - height - chimneyHeight - 5, 6 + frame.pollution * 4)
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
