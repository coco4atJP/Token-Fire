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
    hinoko: { x: 186, y: 166, width: 48, height: 60 },
    hammer: {
      x: 181,
      y: 151,
      width: 31,
      height: 42,
      anchorX: 0.6,
      anchorY: 0.87,
    },
    sumi: { x: 269, y: 165, width: 34, height: 50 },
    crystal: { x: 280, y: 138, width: 14, height: 22 },
    mizumo: { x: 293, y: 144, width: 25, height: 34 },
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
    fuwame: { x: 243, y: 69, width: 50, height: 50 },
    mebuki: { x: 183, y: 166, width: 40, height: 56 },
    wateringCan: {
      x: 207,
      y: 151,
      width: 30,
      height: 25,
      anchorX: 0.58,
      anchorY: 0.72,
    },
    targetShrub: { x: 224, y: 166, width: 20, height: 20 },
    hinoko: { x: 132, y: 149, width: 25, height: 32 },
    sleepingSumi: { x: 154, y: 148, width: 18, height: 26 },
    mizumo: { x: 282, y: 166, width: 38, height: 52 },
    kururi: { x: 106, y: 150, width: 27, height: 31 },
  },
} as const;
