import { describe, expect, it } from "vitest";
import {
  blinkOpennessAt,
  FIXED_SPRING_STEP,
  sampleHammerMotion,
  sampleHopMotion,
  samplePopInScale,
  sampleSecondaryFollowAt,
  sampleSpringAt,
  sampleVelocityImpulseAt,
  Spring,
  SPRING_TOKENS,
  volumePreservingScale,
} from "./spring";

describe("presentation spring", () => {
  it("popは約19% overshootしてから収束する", () => {
    const spring = new Spring(0.04, SPRING_TOKENS.pop, 1);
    let peak = spring.value;
    for (let index = 0; index < 360; index += 1) {
      spring.step();
      peak = Math.max(peak, spring.value);
    }
    expect(peak).toBeGreaterThan(1.15);
    expect(peak).toBeLessThan(1.24);
    expect(spring.settled).toBe(true);
    const samples = Array.from({ length: 120 }, (_, index) => samplePopInScale(index / 120));
    expect(Math.max(...samples)).toBeGreaterThan(1.18);
  });

  it("全tokenが収束し、coarse seekでもNaNを作らない", () => {
    for (const token of Object.values(SPRING_TOKENS)) {
      const sample = sampleSpringAt(30, { initial: -8, target: 3, velocity: 12, token });
      expect(Number.isFinite(sample.value)).toBe(true);
      expect(Number.isFinite(sample.velocity)).toBe(true);
      expect(sample.value).toBeCloseTo(3, 3);
    }
    expect(FIXED_SPRING_STEP).toBe(1 / 120);
  });

  it("impactはtargetではなくvelocityを蹴り、同じseekを再現する", () => {
    for (const time of [0, 0.08, 0.24, 0.8, 2.5]) {
      const first = sampleVelocityImpulseAt(time, -6);
      const second = sampleVelocityImpulseAt(time, -6);
      expect(first).toEqual(second);
      expect(Number.isFinite(first.value)).toBe(true);
    }
  });

  it("squash & stretchは面積を保存する", () => {
    for (const stretch of [0.72, 1, 1.24]) {
      const scale = volumePreservingScale(1.18, stretch);
      expect(scale.sx * scale.sy).toBeCloseTo(1.18 ** 2, 12);
    }
  });

  it("hammer・hop・blinkは30秒の任意seekで有限かつ再現可能", () => {
    for (let time = 0; time <= 30; time += 0.137) {
      const first = [sampleHammerMotion(time, 6.2), sampleHopMotion(time, 1.8, 0.3), blinkOpennessAt(time, 17)];
      const second = [sampleHammerMotion(time, 6.2), sampleHopMotion(time, 1.8, 0.3), blinkOpennessAt(time, 17)];
      expect(first).toEqual(second);
      expect(JSON.stringify(first)).not.toContain("null");
    }
  });

  it("道具・煙突・吊り糸は主運動へ遅延追従し、Replay seekでも再現する", () => {
    for (let time = 0; time <= 30; time += 0.137) {
      const first = sampleSecondaryFollowAt(time, time % 1.1);
      const second = sampleSecondaryFollowAt(time, time % 1.1);
      expect(first).toEqual(second);
      expect(Object.values(first).every(Number.isFinite)).toBe(true);
    }
    const sample = sampleSecondaryFollowAt(0.16, 0);
    expect(sample.tool).not.toBe(sample.primary);
    expect(sample.chimney).not.toBe(sample.tool);
    expect(sample.string).not.toBe(sample.chimney);
  });
});
