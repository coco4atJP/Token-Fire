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
 * 320 × 192 のジオラマ内で使用するワールド座標。
 * 座標と寸法をRendererから分離し、状態ロジックと見た目調整の境界を保つ。
 */
export const SCENE_LAYOUT = {
  forge: { x: 238, y: 158, width: 81, height: 75 },
  lake: { x: 278, y: 145, radiusX: 37 },
  active: {
    emberbeak: { x: 191, y: 164, width: 52, height: 55 },
    hammer: {
      x: 181,
      y: 151,
      width: 31,
      height: 42,
      anchorX: 0.6,
      anchorY: 0.87,
    },
    cinder: { x: 274, y: 164, width: 38, height: 42 },
    crystal: { x: 289, y: 138, width: 15, height: 24 },
    vapo: { x: 301, y: 166, width: 36, height: 35 },
    axle: { y: 165, width: 41, height: 45 },
    cart: { minX: 90, maxX: 126, y: 168, width: 37, height: 27 },
    logs: { y: 151, width: 28, height: 20 },
    subagents: [
      { x: 211, y: 143, width: 22, height: 25, flipX: false, crystalOffsetX: 8 },
      { x: 263, y: 143, width: 22, height: 25, flipX: true, crystalOffsetX: -8 },
      { x: 238, y: 119, width: 21, height: 24, flipX: false, crystalOffsetX: 8 },
    ] satisfies SubagentPlacement[],
  },
  recovery: {
    drizzle: { x: 226, y: 61, width: 48, height: 48 },
    spriglet: { x: 184, y: 165, width: 43, height: 47 },
    wateringCan: {
      x: 207,
      y: 151,
      width: 30,
      height: 25,
      anchorX: 0.58,
      anchorY: 0.72,
    },
    targetShrub: { x: 225, y: 168, width: 21, height: 21 },
    emberbeak: { x: 249, y: 164, width: 37, height: 40 },
    sleepingCinder: { x: 258, y: 124, width: 23, height: 26 },
    vapo: { x: 296, y: 166, width: 38, height: 37 },
    axle: { x: 144, y: 166, width: 37, height: 41 },
  },
} as const;
