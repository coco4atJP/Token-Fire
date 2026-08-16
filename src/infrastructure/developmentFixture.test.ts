import { describe, expect, it } from "vitest";
import { createWorld } from "../domain/world";
import { readWorldScene } from "../domain/worldScene";
import { applyDevelopmentWorldFixture, DevelopmentFixturePersistence, DevelopmentFixtureSource, readDevelopmentFixture } from "./developmentFixture";

describe("development fixture", () => {
  it("本番ではqueryを無効化し、開発時だけ固定sceneを読む", async () => {
    expect(readDevelopmentFixture("?tfFixture=approval", false)).toBeNull();
    const fixture = readDevelopmentFixture("?tfFixture=approval&tfTime=night&tfGrowth=99", true);
    expect(fixture).toEqual({ scene: "approval", timePhase: "night", weather: "clear", growthLevel: 23, quiet: false, width: 560, height: 350 });
    const world = createWorld();
    applyDevelopmentWorldFixture(world, fixture!);
    const snapshot = await new DevelopmentFixtureSource(fixture!).poll();
    expect(readWorldScene(world, snapshot)).toBe("approval");
    expect(world.growthLevel).toBe(23);
    expect(snapshot.tokenDelta).toBe(0);
    world.growthLevel = 2;
    world.activeEvent = {
      id: 1, type: "token-burn", tone: "destruction", title: "drift", line: "drift",
      magnitude: 1, duration: 1, createdAt: 0,
    };
    applyDevelopmentWorldFixture(world, fixture!);
    expect(world.growthLevel).toBe(23);
    expect(world.activeEvent).toBeNull();
  });

  it("fixture世界をlocalStorageへ保存せず、履歴とReplayを毎回同じ内容へ戻す", () => {
    localStorage.clear();
    const fixture = readDevelopmentFixture("?tfFixture=mera", true)!;
    const persistence = new DevelopmentFixturePersistence(fixture);
    const world = persistence.loadProject({ key: "global", label: "Global", path: null, model: null });
    expect(world.replays.map((replay) => replay.id)).toEqual(["fixture-complete", "fixture-incomplete"]);
    world.elapsed = 999;
    world.particles.push({ kind: "smoke", x: 0, y: 0, vx: 0, vy: 0, life: 1, maxLife: 1, size: 1 });
    world.history = [];
    persistence.save(world);
    applyDevelopmentWorldFixture(world, fixture);
    expect(world.elapsed).toBe(120);
    expect(world.particles).toHaveLength(0);
    expect(world.history).toHaveLength(3);
    expect(localStorage.getItem("token-fire.worlds.v3")).toBeNull();
  });
});
