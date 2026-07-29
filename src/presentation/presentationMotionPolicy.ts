import type { AppSettings } from "../domain/experienceData";

export interface PresentationMotionPolicy {
  motionScale: number;
  allowParticles: boolean;
  allowFlash: boolean;
  allowNonEssentialEvents: boolean;
}

export const readPresentationMotionPolicy = (
  settings: AppSettings,
  quiet: boolean,
  reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
): PresentationMotionPolicy => {
  const calm = settings.attention.mode === "calm";
  const still = reducedMotion || quiet;
  return {
    motionScale: still ? 0 : calm ? 0.38 : 1,
    allowParticles: !still && !calm,
    allowFlash: !still && !settings.attention.reduceFlash,
    allowNonEssentialEvents: !quiet && !calm,
  };
};
