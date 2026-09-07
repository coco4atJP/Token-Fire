import { describe, expect, it, vi } from "vitest";
import {
  advancePresentationFrameClock,
  forEachLogicalStep,
  isPresentationFrameDue,
  MAX_LOGICAL_CATCH_UP_SECONDS,
  MAX_LOGICAL_STEP_SECONDS,
  readPresentationFrameRate,
  type PresentationContext,
} from "./presentationContext";

const context = (patch: Partial<PresentationContext> = {}): PresentationContext => ({
  scene: "meguri",
  quiet: false,
  playActive: false,
  visibility: "visible",
  ...patch,
});

describe("presentation cadence", () => {
  it("操業・式典・PLAYを60fps、承認・エラー・回復を30fpsへ分類する", () => {
    expect(readPresentationFrameRate(context({ scene: "mera" }))).toBe(60);
    expect(readPresentationFrameRate(context({ scene: "gogo" }))).toBe(60);
    expect(readPresentationFrameRate(context({ scene: "kirari" }))).toBe(60);
    expect(readPresentationFrameRate(context({ scene: "approval" }))).toBe(30);
    expect(readPresentationFrameRate(context({ scene: "zero-output" }))).toBe(30);
    expect(readPresentationFrameRate(context({ scene: "meguri" }))).toBe(30);
    expect(readPresentationFrameRate(context({ scene: "poka", playActive: true }))).toBe(60);
  });

  it("Quietを15fpsへ落とし、hiddenでは描画しない", () => {
    expect(readPresentationFrameRate(context({ scene: "gogo", quiet: true }))).toBe(15);
    expect(readPresentationFrameRate(context({ scene: "meguri", quiet: true, playActive: true }))).toBe(60);
    expect(readPresentationFrameRate(context({ scene: "gogo", playActive: true, visibility: "hidden" }))).toBe(0);
    expect(isPresentationFrameDue(1_000, context({ visibility: "hidden" }))).toBe(false);
    expect(isPresentationFrameDue(16, context({ scene: "mera" }))).toBe(true);
    expect(isPresentationFrameDue(32, context({ scene: "approval" }))).toBe(false);
    expect(isPresentationFrameDue(33, context({ scene: "approval" }))).toBe(true);
  });

  it("75／90／144／165HzのdisplayでもActiveを約60fpsに保つ", () => {
    for (const refreshRate of [75, 90, 144, 165]) {
      let last = Number.NEGATIVE_INFINITY;
      let rendered = 0;
      for (let now = 0; now < 1_000; now += 1_000 / refreshRate) {
        const active = context({ scene: "mera" });
        if (!isPresentationFrameDue(now - last, active)) continue;
        rendered += 1;
        last = advancePresentationFrameClock(last, now, active);
      }
      expect(rendered, `${refreshRate}Hz`).toBeGreaterThanOrEqual(59);
      expect(rendered, `${refreshRate}Hz`).toBeLessThanOrEqual(61);
    }
  });

  it("長い論理時間を80ms以下のstepへ分割する", () => {
    const advance = vi.fn<(stepSeconds: number) => void>();
    const count = forEachLogicalStep(0.205, advance);
    const steps = advance.mock.calls.map(([step]) => step);
    expect(count).toBe(3);
    expect(steps).toHaveLength(3);
    expect(Math.max(...steps)).toBeLessThanOrEqual(MAX_LOGICAL_STEP_SECONDS);
    expect(steps.reduce((total, step) => total + step, 0)).toBeCloseTo(0.205);
    expect(forEachLogicalStep(-1, advance)).toBe(0);
    expect(forEachLogicalStep(Number.POSITIVE_INFINITY, advance)).toBe(0);
    advance.mockClear();
    forEachLogicalStep(3_600, advance);
    expect(advance.mock.calls.reduce((total, [step]) => total + step, 0)).toBeCloseTo(MAX_LOGICAL_CATCH_UP_SECONDS);
  });
});
