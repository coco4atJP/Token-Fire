import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../domain/experienceData";
import { readPresentationMotionPolicy } from "./presentationMotionPolicy";
import { StageViewport } from "./stageViewport";

describe("presentation共通契約", () => {
  it("320×192をcontain投影して逆変換できる", () => {
    const viewport = new StageViewport(560, 350);
    expect(viewport.scale).toBeCloseTo(1.75);
    expect(viewport.offsetX).toBe(0);
    expect(viewport.offsetY).toBe(7);
    expect(viewport.project({ x: 160, y: 96 })).toEqual({ x: 280, y: 175 });
    const bounds = { left: 10, top: 20 } as DOMRect;
    expect(viewport.unproject(290, 195, bounds)).toEqual({ x: 160, y: 96 });
  });

  it("reduced-motion・Quiet・Calm・Reduce Flashを表現だけへ反映する", () => {
    expect(readPresentationMotionPolicy(DEFAULT_SETTINGS, false, true)).toEqual({
      motionScale: 0, allowParticles: false, allowFlash: false, allowNonEssentialEvents: true,
    });
    const calm = structuredClone(DEFAULT_SETTINGS);
    calm.attention.mode = "calm";
    calm.attention.reduceFlash = true;
    expect(readPresentationMotionPolicy(calm, false, false)).toEqual({
      motionScale: 0.38, allowParticles: false, allowFlash: false, allowNonEssentialEvents: false,
    });
    expect(readPresentationMotionPolicy(DEFAULT_SETTINGS, true, false).motionScale).toBe(0);
  });
});
