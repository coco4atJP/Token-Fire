import { describe, expect, it } from "vitest";
import { IDLE_SNAPSHOT } from "./agent";
import { createWorld } from "./world";
import { readWorldScene } from "./worldScene";

describe("WorldScene", () => {
  it("外部状態を六つの舞台状態へ一度だけ分類する", () => {
    const world = createWorld();
    expect(readWorldScene(world, IDLE_SNAPSHOT)).toBe("poka");
    expect(readWorldScene(world, { ...IDLE_SNAPSHOT, active: true, status: "working", activeSessions: 1 })).toBe("mera");
    expect(readWorldScene(world, { ...IDLE_SNAPSHOT, active: true, status: "working", activeSessions: 3 })).toBe("gogo");
    expect(readWorldScene(world, { ...IDLE_SNAPSHOT, status: "completed" })).toBe("kirari");
    expect(readWorldScene(world, { ...IDLE_SNAPSHOT, status: "error" })).toBe("zero-output");
    world.debt.totalTokensBurned = 1;
    expect(readWorldScene(world, IDLE_SNAPSHOT)).toBe("meguri");
  });
});
