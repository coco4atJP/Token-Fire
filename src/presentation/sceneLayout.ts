export interface ActorPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SubagentPlacement extends ActorPlacement {
  flipX: boolean;
  crystalOffsetX: number;
}

/**
 * 320 × 192 の舞台内で使用するワールド座標。
 * 座標と寸法をRendererから分離し、状態ロジックと見た目調整の境界を保つ。
 */
export const SCENE_LAYOUT = {
  forge: { x: 240, y: 162, width: 88, height: 84 },
  lake: { x: 278, y: 145, radiusX: 37 },
  active: {
    hinoko: { x: 191, y: 167, width: 50, height: 62 },
    hammer: {
      x: 181,
      y: 151,
      width: 31,
      height: 42,
      anchorX: 0.6,
      anchorY: 0.87,
    },
    sumi: { x: 278, y: 166, width: 36, height: 53 },
    crystal: { x: 289, y: 138, width: 15, height: 24 },
    mizumo: { x: 304, y: 169, width: 42, height: 57 },
    kururi: { y: 168, width: 44, height: 49 },
    cart: { minX: 90, maxX: 126, y: 168, width: 37, height: 27 },
    logs: { y: 151, width: 28, height: 20 },
    subagents: [
      { x: 211, y: 145, width: 22, height: 31, flipX: false, crystalOffsetX: 8 },
      { x: 266, y: 145, width: 22, height: 31, flipX: true, crystalOffsetX: -8 },
      { x: 241, y: 120, width: 21, height: 29, flipX: false, crystalOffsetX: 8 },
    ] satisfies SubagentPlacement[],
  },
  recovery: {
    fuwame: { x: 226, y: 64, width: 54, height: 54 },
    mebuki: { x: 184, y: 168, width: 42, height: 59 },
    wateringCan: {
      x: 207,
      y: 151,
      width: 30,
      height: 25,
      anchorX: 0.58,
      anchorY: 0.72,
    },
    targetShrub: { x: 225, y: 168, width: 21, height: 21 },
    hinoko: { x: 250, y: 167, width: 38, height: 48 },
    sleepingSumi: { x: 261, y: 128, width: 23, height: 33 },
    mizumo: { x: 286, y: 169, width: 40, height: 55 },
    kururi: { x: 144, y: 168, width: 39, height: 45 },
  },
} as const;
