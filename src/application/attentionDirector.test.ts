import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_SNAPSHOT } from "../domain/agent";
import { createWorld, enqueueWorldEvent } from "../domain/world";
import { SettingsStore } from "../infrastructure/settingsStore";
import type { PlatformBridge } from "../infrastructure/platformBridge";
import { AttentionDirector } from "./attentionDirector";

describe("AttentionDirector approval lifecycle", () => {
  beforeEach(() => localStorage.clear());

  it("承認解決時にactive／queuedのbellを除き、停止表示を残さない", () => {
    const platform = { notify: vi.fn(async () => true) } as unknown as PlatformBridge;
    const director = new AttentionDirector(new SettingsStore(), platform);
    const approval = { ...IDLE_SNAPSHOT, active: true, status: "thinking" as const, tool: "approval_review" };

    const activeWorld = createWorld();
    director.onSnapshot(activeWorld, IDLE_SNAPSHOT, approval);
    expect(activeWorld.activeEvent?.type).toBe("approval-bell");
    director.onSnapshot(activeWorld, approval, { ...approval, status: "working", tool: null });
    expect(activeWorld.activeEvent).toBeNull();

    const queuedWorld = createWorld();
    enqueueWorldEvent(queuedWorld, "token-burn");
    director.onSnapshot(queuedWorld, IDLE_SNAPSHOT, approval);
    expect(queuedWorld.eventQueue.some((event) => event.type === "approval-bell")).toBe(true);
    director.onSnapshot(queuedWorld, approval, { ...approval, status: "working", tool: null });
    expect(queuedWorld.eventQueue.some((event) => event.type === "approval-bell")).toBe(false);
  });

  it("開発fixture等で通知副作用を明示的に無効化できる", () => {
    const platform = { notify: vi.fn(async () => true) } as unknown as PlatformBridge;
    const director = new AttentionDirector(new SettingsStore(), platform, () => false);
    director.onSnapshot(
      createWorld(),
      IDLE_SNAPSHOT,
      { ...IDLE_SNAPSHOT, active: true, status: "thinking", tool: "approval_review" },
    );
    expect(platform.notify).not.toHaveBeenCalled();
  });
});
