import type { WorldScene } from "../domain/worldScene";

export const MAX_LOGICAL_STEP_SECONDS = 0.08;
export const MAX_LOGICAL_CATCH_UP_SECONDS = 5;

export type PresentationVisibility = "visible" | "hidden";

/**
 * 表現の更新頻度だけを決める入力。WorldStateへQuietやDOM visibilityを混ぜない。
 */
export interface PresentationContext {
  scene: WorldScene;
  quiet: boolean;
  playActive: boolean;
  visibility: PresentationVisibility;
}

const FULL_RATE_SCENES = new Set<WorldScene>(["mera", "gogo", "kirari"]);

/**
 * sceneの意味はdomainで確定済みとし、ここでは媒体側のfpsへだけ翻訳する。
 */
export const readPresentationFrameRate = (context: PresentationContext): 0 | 15 | 30 | 60 => {
  if (context.visibility === "hidden") return 0;
  if (context.playActive) return 60;
  if (context.quiet) return 15;
  if (FULL_RATE_SCENES.has(context.scene)) return 60;
  return 30;
};

export const isPresentationFrameDue = (
  elapsedMs: number,
  context: PresentationContext,
): boolean => {
  const frameRate = readPresentationFrameRate(context);
  if (frameRate === 0) return false;
  // rAF timestampの丸めで60fpsが30fpsへ落ちないよう、1msだけ許容する。
  return elapsedMs + 1 >= 1_000 / frameRate;
};

/**
 * 高refresh-rateでも描画時刻をnowへ丸めず、目標intervalぶんだけ進める。
 * 長い停止後だけはcatch-up burstを避けて現在時刻へ同期する。
 */
export const advancePresentationFrameClock = (
  previousMs: number,
  nowMs: number,
  context: PresentationContext,
): number => {
  const frameRate = readPresentationFrameRate(context);
  if (frameRate === 0 || !Number.isFinite(previousMs)) return nowMs;
  const interval = 1_000 / frameRate;
  if (nowMs - previousMs > interval * 2.5) return nowMs;
  return previousMs + interval;
};

/**
 * 復帰時や長いtaskで生じたdeltaを分割し、domainへ80ms超のstepを渡さない。
 */
export const forEachLogicalStep = (
  elapsedSeconds: number,
  advance: (stepSeconds: number) => void,
): number => {
  let remaining = Number.isFinite(elapsedSeconds)
    ? Math.min(MAX_LOGICAL_CATCH_UP_SECONDS, Math.max(0, elapsedSeconds))
    : 0;
  let count = 0;
  while (remaining > 0) {
    const step = Math.min(MAX_LOGICAL_STEP_SECONDS, remaining);
    advance(step);
    remaining = Math.max(0, remaining - step);
    count += 1;
  }
  return count;
};
