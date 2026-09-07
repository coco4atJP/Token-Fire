import { describe, expect, it } from "vitest";
import { IDLE_SNAPSHOT } from "./agent";
import { CharacterDirector } from "./characterDirector";
import { createWorld } from "./world";

describe("CharacterDirector pacing", () => {
  it("act・表情・位置を同じframeで変更しない", () => {
    const world = createWorld();
    const director = new CharacterDirector();
    const before = structuredClone(world.characters);

    world.elapsed = 7;
    director.update(world, IDLE_SNAPSHOT, 0.08);
    const actor = Object.values(world.characters).find((state) => state.line !== null);
    expect(actor).toBeDefined();
    expect(actor?.offsetY).toBe(0);
    expect(actor?.mood).toBe(before[actor!.id].mood);

    world.elapsed = 7.9;
    director.update(world, IDLE_SNAPSHOT, 0.08);
    expect(actor?.offsetY).toBe(0);

    world.elapsed = 8.7;
    director.update(world, IDLE_SNAPSHOT, 0.08);
    expect(actor?.offsetY).not.toBe(0);
    expect(Object.values(world.characters).filter((state) => state.line !== null)).toHaveLength(1);
  });
});
