import { describe, expect, it } from "vitest";
import { AudioCueGate, audioCueSpacingForMode, isPresentationAudioSuppressed } from "./audioPacing";
import { readBaseAudioTargets } from "./audioDirector";
import { readExperienceAudioTargets } from "./experienceAudio";

describe("Audio pacing", () => {
  it("同じ拍では一音だけを通し、重要音だけ250ms後に割り込める", () => {
    const gate = new AudioCueGate();
    expect(gate.tryAcquire(0, 900)).toBe(true);
    expect(gate.tryAcquire(100, 900)).toBe(false);
    expect(gate.tryAcquire(260, 900, "important")).toBe(true);
    expect(gate.tryAcquire(500, 900, "important")).toBe(false);
    expect(gate.tryAcquire(1_200, 900)).toBe(true);
  });

  it("Calmはstandardより間を長くし、Chaosでも650ms未満にしない", () => {
    expect(audioCueSpacingForMode("calm")).toBe(1_400);
    expect(audioCueSpacingForMode("balanced")).toBe(900);
    expect(audioCueSpacingForMode("chaos")).toBe(650);
  });

  it("Quietと開発fixtureはいずれも基礎音を含めて無音にする", () => {
    expect(isPresentationAudioSuppressed(false, false)).toBe(false);
    expect(isPresentationAudioSuppressed(true, false)).toBe(true);
    expect(isPresentationAudioSuppressed(false, true)).toBe(true);
  });
});

describe("実Audio graphのQuiet目標", () => {
  const world = { heat: 0.8, pollution: 0.6, rain: 0.7, water: 0.9, chill: 0.8 };

  it("Quietでは炉・雨・Chill・両masterを無音床へ落とす", () => {
    const base = readBaseAudioTargets(world, { active: true, effort: "high" }, true);
    const experience = readExperienceAudioTargets(world, { active: false }, true, true);
    expect(base.forge).toBe(0.0001);
    expect(base.rain).toBe(0.0001);
    expect(base.master).toBe(0.0001);
    expect(experience.chill).toBe(0.0001);
    expect(experience.master).toBe(0.0001);
  });

  it("通常時はActive炉とRecovery環境音を役割別に開く", () => {
    expect(readBaseAudioTargets(world, { active: true, effort: "medium" }, false).forge).toBeGreaterThan(0.0001);
    expect(readBaseAudioTargets(world, { active: false, effort: "medium" }, false).rain).toBeGreaterThan(0.0001);
    expect(readExperienceAudioTargets(world, { active: false }, false, true).chill).toBeGreaterThan(0.0001);
  });
});
