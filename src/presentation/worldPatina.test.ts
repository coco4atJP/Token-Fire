import { describe, expect, it } from "vitest";
import { createWorld } from "../domain/world";
import { deriveWorldPatina, readWorldPatina, worldPatinaSignature } from "./worldPatina";

describe("WorldPatina", () => {
  it("既存WorldStateだけから閾値と上限を使って導出する", () => {
    const world = createWorld();
    world.debt.forestWipeouts = 8;
    world.discoveries["sunk-cost-error"] = {
      eventType: "sunk-cost-error",
      firstSeenAt: 1,
      lastSeenAt: 2,
      count: 9,
      title: "事故",
      line: "赤伝票",
    };
    world.debt.greenwashCeremonies = 12;
    world.growthLevel = 23;
    world.restorationScore = 240;

    expect(deriveWorldPatina(world)).toEqual({
      bentFence: 2,
      incidentTags: 3,
      fadedStamps: 4,
      pipeScars: 3,
      moss: 3,
    });
  });

  it("苔は0を起点に80・240で一段ずつ増える", () => {
    const world = createWorld();
    for (const [score, expected] of [[0, 0], [1, 1], [79, 1], [80, 2], [239, 2], [240, 3], [480, 3]] as const) {
      world.restorationScore = score;
      expect(deriveWorldPatina(world).moss).toBe(expected);
    }
  });

  it("Wideは全数、Dioramaは各1個、Compactは省略する", () => {
    const world = createWorld();
    world.debt.forestWipeouts = 2;
    world.debt.greenwashCeremonies = 4;
    world.growthLevel = 23;
    world.restorationScore = 240;

    expect(readWorldPatina(world, "wide")).toEqual({
      bentFence: 2, incidentTags: 0, fadedStamps: 4, pipeScars: 3, moss: 3,
    });
    expect(readWorldPatina(world, "diorama")).toEqual({
      bentFence: 1, incidentTags: 0, fadedStamps: 1, pipeScars: 1, moss: 1,
    });
    expect(readWorldPatina(world, "compact")).toEqual({
      bentFence: 0, incidentTags: 0, fadedStamps: 0, pipeScars: 0, moss: 0,
    });
    expect(worldPatinaSignature(readWorldPatina(world, "wide"))).toBe("2:0:4:3:3");
  });
});
