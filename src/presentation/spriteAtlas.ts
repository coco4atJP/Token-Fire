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

export class SpriteAtlas {
  private readonly image = new Image();
  private loaded = false;

  constructor(onReady?: () => void) {
    this.image.decoding = "async";
    this.image.addEventListener("load", () => {
      this.loaded = true;
      onReady?.();
    });
    this.image.src = "/assets/token-fire/sprites.svg";
  }

  get ready(): boolean {
    return this.loaded;
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
    if (!this.loaded) return false;
    const frame = SPRITE_FRAMES[key];
    const alpha = options.alpha ?? 1;
    const rotation = options.rotation ?? 0;
    const anchorX = options.anchorX ?? 0.5;
    const anchorY = options.anchorY ?? 1;

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
