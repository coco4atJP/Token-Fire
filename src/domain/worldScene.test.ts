import { describe, expect, it } from "vitest";
import { IDLE_SNAPSHOT } from "./agent";
import { createWorld } from "./world";
import { readWorldScene } from "./worldScene";

describe("WorldScene", () => {
  it("外部状態を七つの舞台状態へ一度だけ分類する", () => {
    const world = createWorld();
    expect(readWorldScene(world, IDLE_SNAPSHOT)).toBe("poka");
    expect(readWorldScene(world, { ...IDLE_SNAPSHOT, active: true, status: "working", activeSessions: 1 })).toBe("mera");
    expect(readWorldScene(world, { ...IDLE_SNAPSHOT, active: true, status: "working", activeSessions: 3 })).toBe("gogo");
    expect(readWorldScene(world, { ...IDLE_SNAPSHOT, tool: "approval_review" })).toBe("approval");
    expect(readWorldScene(world, { ...IDLE_SNAPSHOT, status: "completed" })).toBe("kirari");
    expect(readWorldScene(world, { ...IDLE_SNAPSHOT, status: "error" })).toBe("zero-output");
    world.debt.totalTokensBurned = 1;
    expect(readWorldScene(world, IDLE_SNAPSHOT)).toBe("meguri");
  });

  it("Error → Approval → Complete → Active → Idle/Recoveryの優先順位を守る", () => {
    const world = createWorld();
    const overloaded = {
      ...IDLE_SNAPSHOT,
      active: true,
      activeSessions: 4,
      status: "completed" as const,
      tool: "approval_review",
    };

    expect(readWorldScene(world, overloaded)).toBe("approval");
    expect(readWorldScene(world, { ...overloaded, status: "error" })).toBe("zero-output");

    world.activeEvent = {
      id: 1,
      type: "greenwash-ceremony",
      tone: "ceremony",
      title: "式典",
      line: "完了",
      magnitude: 1,
      duration: 1,
      createdAt: 0,
    };
    expect(readWorldScene(world, { ...overloaded, tool: null })).toBe("kirari");

    world.activeEvent = null;
    expect(readWorldScene(world, { ...overloaded, status: "working", tool: null })).toBe("gogo");
  });

  it("承認bellが残っても、外部状態の承認が解決済みなら機械を止めない", () => {
    const world = createWorld();
    world.activeEvent = {
      id: 1,
      type: "approval-bell",
      tone: "warning",
      title: "承認",
      line: "通知",
      magnitude: 1,
      duration: 6,
      createdAt: 0,
    };
    expect(readWorldScene(world, { ...IDLE_SNAPSHOT, active: true, status: "working", tool: null })).toBe("mera");
  });
});
