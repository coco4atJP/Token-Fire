import { Assets, Rectangle, Texture } from "pixi.js";

export type SpriteKey =
  | "hinoko"
  | "mebuki"
  | "fuwame"
  | "sumi"
  | "mizumo"
  | "kururi"
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
  | "splash"
  | "backdropActive"
  | "backdropRecovery"
  | "stageFloor"
  | "prosceniumFrame"
  | "curtainLeft"
  | "curtainRight"
  | "curtainValance";

export type ExpressionFrame = 1 | 2 | 3 | 4;

interface SpriteFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

const CELL = 128;

const GENERATED_SPRITE_PATHS: Partial<Record<SpriteKey, string>> = {
  hinoko: "/assets/token-fire/generated/characters/hinoko.png",
  mebuki: "/assets/token-fire/generated/characters/mebuki.png",
  fuwame: "/assets/token-fire/generated/characters/fuwame.png",
  sumi: "/assets/token-fire/generated/characters/sumi.png",
  mizumo: "/assets/token-fire/generated/characters/mizumo.png",
  kururi: "/assets/token-fire/generated/characters/kururi.png",
  forgeActive: "/assets/token-fire/generated/environment/forge-active.png",
  forgeRecovery: "/assets/token-fire/generated/environment/forge-recovery.png",
  treeHealthy: "/assets/token-fire/generated/environment/tree-healthy.png",
  treeScorched: "/assets/token-fire/generated/environment/tree-scorched.png",
  treeRecovery: "/assets/token-fire/generated/environment/tree-recovery.png",
  backdropActive: "/assets/token-fire/generated/theatre/backdrops/active-paper.png",
  backdropRecovery: "/assets/token-fire/generated/theatre/backdrops/recovery-paper.png",
  stageFloor: "/assets/token-fire/generated/theatre/stage/floor.png",
  prosceniumFrame: "/assets/token-fire/generated/theatre/proscenium/frame.png",
  curtainLeft: "/assets/token-fire/generated/theatre/curtains/left.png",
  curtainRight: "/assets/token-fire/generated/theatre/curtains/right.png",
  curtainValance: "/assets/token-fire/generated/theatre/curtains/valance.png",
};

const EXPRESSION_SPRITE_PATHS: Record<string, string> = Object.fromEntries(
  ["hinoko", "mebuki", "fuwame", "sumi", "mizumo", "kururi"].flatMap((character) =>
    [1, 2, 3, 4].map((frame) => [
      `${character}:${frame}`,
      `/assets/token-fire/generated/expressions/${character}/0${frame}.png`,
    ]),
  ),
);

const SPRITE_FRAMES: Partial<Record<SpriteKey, SpriteFrame>> = {
  hinoko: { x: 0, y: 0, width: CELL, height: CELL },
  mebuki: { x: CELL, y: 0, width: CELL, height: CELL },
  fuwame: { x: CELL * 2, y: 0, width: CELL, height: CELL },
  sumi: { x: CELL * 3, y: 0, width: CELL, height: CELL },
  mizumo: { x: CELL * 4, y: 0, width: CELL, height: CELL },
  kururi: { x: CELL * 5, y: 0, width: CELL, height: CELL },
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

/**
 * PixiJSだけが外部画像形式を知る境界。
 * 生成PNGが欠けていても、同じ意味の軽量Atlas frameへ縮退する。
 */
export class SpriteAtlas {
  private readonly textures = new Map<SpriteKey, Texture>();
  private readonly expressions = new Map<string, Texture>();

  private constructor() {}

  static async load(): Promise<SpriteAtlas> {
    const library = new SpriteAtlas();
    const atlas = await Assets.load<Texture>("/assets/token-fire/sprites.svg");

    for (const [key, frame] of Object.entries(SPRITE_FRAMES) as [SpriteKey, SpriteFrame][]) {
      library.textures.set(
        key,
        new Texture({
          source: atlas.source,
          frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
        }),
      );
    }

    await Promise.all([
      ...Object.entries(GENERATED_SPRITE_PATHS).map(async ([key, path]) => {
        try {
          library.textures.set(key as SpriteKey, await Assets.load<Texture>(path));
        } catch {
          // Atlas fallback is already registered.
        }
      }),
      ...Object.entries(EXPRESSION_SPRITE_PATHS).map(async ([key, path]) => {
        try {
          library.expressions.set(key, await Assets.load<Texture>(path));
        } catch {
          // Character base texture remains available.
        }
      }),
    ]);

    return library;
  }

  get(key: SpriteKey, expressionFrame?: ExpressionFrame): Texture {
    return (
      (expressionFrame ? this.expressions.get(`${key}:${expressionFrame}`) : undefined)
      ?? this.textures.get(key)
      ?? Texture.WHITE
    );
  }

  has(key: SpriteKey): boolean {
    return this.textures.has(key);
  }
}
