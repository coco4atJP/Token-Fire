export type SpriteKey =
  | "emberbeak"
  | "spriglet"
  | "drizzle"
  | "cinder"
  | "vapo"
  | "axle"
  | "forgeActive"
  | "forgeRecovery"
  | "treeHealthy"
  | "treeScorched"
  | "treeRecovery"
  | "shrub"
  | "waterfall"
  | "hammer"
  | "wateringCan"
  | "tokenCrystal"
  | "logCart"
  | "logs"
  | "smoke"
  | "flame"
  | "spark"
  | "token"
  | "rainCloud"
  | "splash";

interface SpriteFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DrawSpriteOptions {
  alpha?: number;
  rotation?: number;
  flipX?: boolean;
  anchorX?: number;
  anchorY?: number;
}

export type SpriteAtlasState = "loading" | "ready" | "error";

const CELL = 128;

export const SPRITE_FRAMES: Record<SpriteKey, SpriteFrame> = {
  emberbeak: { x: 0, y: 0, width: CELL, height: CELL },
  spriglet: { x: CELL, y: 0, width: CELL, height: CELL },
  drizzle: { x: CELL * 2, y: 0, width: CELL, height: CELL },
  cinder: { x: CELL * 3, y: 0, width: CELL, height: CELL },
  vapo: { x: CELL * 4, y: 0, width: CELL, height: CELL },
  axle: { x: CELL * 5, y: 0, width: CELL, height: CELL },
  forgeActive: { x: CELL * 6, y: 0, width: CELL, height: CELL },
  forgeRecovery: { x: CELL * 7, y: 0, width: CELL, height: CELL },
  treeHealthy: { x: 0, y: CELL, width: CELL, height: CELL },
  treeScorched: { x: CELL, y: CELL, width: CELL, height: CELL },
  treeRecovery: { x: CELL * 2, y: CELL, width: CELL, height: CELL },
  shrub: { x: CELL * 3, y: CELL, width: CELL, height: CELL },
  waterfall: { x: CELL * 4, y: CELL, width: CELL, height: CELL },
  hammer: { x: CELL * 5, y: CELL, width: CELL, height: CELL },
  wateringCan: { x: CELL * 6, y: CELL, width: CELL, height: CELL },
  tokenCrystal: { x: CELL * 7, y: CELL, width: CELL, height: CELL },
  logCart: { x: 0, y: CELL * 2, width: CELL, height: CELL },
  logs: { x: CELL, y: CELL * 2, width: CELL, height: CELL },
  smoke: { x: CELL * 2, y: CELL * 2, width: CELL, height: CELL },
  flame: { x: CELL * 3, y: CELL * 2, width: CELL, height: CELL },
  spark: { x: CELL * 4, y: CELL * 2, width: CELL, height: CELL },
  token: { x: CELL * 5, y: CELL * 2, width: CELL, height: CELL },
  rainCloud: { x: CELL * 6, y: CELL * 2, width: CELL, height: CELL },
  splash: { x: CELL * 7, y: CELL * 2, width: CELL, height: CELL },
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export class SpriteAtlas {
  private readonly image = new Image();
  private currentState: SpriteAtlasState = "loading";

  constructor(onReady?: () => void) {
    this.image.decoding = "async";
    this.image.addEventListener("load", () => {
      this.currentState = "ready";
      onReady?.();
    });
    this.image.addEventListener("error", () => {
      this.currentState = "error";
    });
    this.image.src = "/assets/token-fire/sprites.svg";
  }

  get state(): SpriteAtlasState {
    return this.currentState;
  }

  get ready(): boolean {
    return this.currentState === "ready";
  }

  draw(
    ctx: CanvasRenderingContext2D,
    key: SpriteKey,
    x: number,
    y: number,
    width: number,
    height: number,
    options: DrawSpriteOptions = {},
  ): boolean {
    if (!this.ready || width <= 0 || height <= 0) return false;
    const frame = SPRITE_FRAMES[key];
    const alpha = clamp01(options.alpha ?? 1);
    const rotation = Number.isFinite(options.rotation) ? (options.rotation ?? 0) : 0;
    const anchorX = clamp01(options.anchorX ?? 0.5);
    const anchorY = clamp01(options.anchorY ?? 1);

    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(options.flipX ? -1 : 1, 1);
    ctx.drawImage(
      this.image,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      -width * anchorX,
      -height * anchorY,
      width,
      height,
    );
    ctx.restore();
    return true;
  }
}
