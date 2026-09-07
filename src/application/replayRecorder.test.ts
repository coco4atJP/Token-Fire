import { describe, expect, it, vi } from "vitest";
import { IDLE_SNAPSHOT } from "../domain/agent";
import { createWorld } from "../domain/world";
import { ReplayRecorder } from "./replayRecorder";

describe("ReplayRecorder project handoff", () => {
  it("操業中のproject切替を未完了として閉じ、次projectの記録を開始する", () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    const recorder = new ReplayRecorder();
    const world = createWorld({ projectKey: "a", projectLabel: "A" });
    const a = { ...IDLE_SNAPSHOT, active: true, status: "working" as const, projectKey: "a", projectLabel: "A", sessionId: "a" };
    recorder.onSnapshot(world, IDLE_SNAPSHOT, a);
    world.elapsed = 1.1;
    world.taskTokens = 100;
    recorder.update(world, a);

    const b = { ...a, projectKey: "b", projectLabel: "B", sessionId: "b" };
    recorder.onSnapshot(world, a, b);
    expect(world.replays[0]?.wasted).toBe(true);
    expect(world.replays[0]?.projectKey).toBe("a");

    world.elapsed = 2.2;
    recorder.update(world, b);
    recorder.onSnapshot(world, b, { ...b, active: false, status: "completed" });
    expect(world.replays.some((replay) => replay.projectKey === "b")).toBe(true);
    vi.restoreAllMocks();
  });
});
