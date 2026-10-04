import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_SNAPSHOT, type AgentSnapshot } from "../domain/agent";
import { createWorld, manuallyCharNearestTree, type WorldState } from "../domain/world";
import type { AgentSource } from "../infrastructure/codexClient";
import type { WorldPersistence } from "../infrastructure/worldPersistence";
import type { AudioDirector } from "../presentation/audioDirector";
import type { ExperiencePresenter } from "../presentation/experienceOverlay";
import type { AttentionDirector } from "./attentionDirector";
import type { EnvironmentDirector } from "./environmentDirector";
import type { PackEventDirector } from "./packEventDirector";
import type { ReplayRecorder } from "./replayRecorder";
import type { WorldRenderer } from "./worldRenderer";
import { AppController, type ControllerView } from "./appController";

const controllers = new Set<AppController>();

describe("AppController scheduler", () => {
  let visibility: DocumentVisibilityState;
  let nextAnimationFrameId: number;
  let animationFrames: Map<number, FrameRequestCallback>;

  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    nextAnimationFrameId = 1;
    animationFrames = new Map();
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      const id = nextAnimationFrameId;
      nextAnimationFrameId += 1;
      animationFrames.set(id, callback);
      return id;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => animationFrames.delete(id)));
  });

  afterEach(() => {
    for (const controller of controllers) controller.stop();
    controllers.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const advanceVisibleTime = async (milliseconds: number, frameInterval = 50): Promise<void> => {
    let remaining = milliseconds;
    while (remaining > 0) {
      const step = Math.min(frameInterval, remaining);
      await vi.advanceTimersByTimeAsync(step);
      const pending = [...animationFrames.values()];
      animationFrames.clear();
      for (const frame of pending) frame(performance.now());
      remaining -= step;
    }
  };

  const setVisibility = (next: DocumentVisibilityState): void => {
    visibility = next;
    document.dispatchEvent(new Event("visibilitychange"));
  };

  it("rAFを実行しなくても700msごとに入力をpollし、stopでtimerを破棄する", async () => {
    const harness = createHarness();
    harness.controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.poll).toHaveBeenCalledTimes(1);
    expect(harness.renderer.render).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(700);
    expect(harness.poll).toHaveBeenCalledTimes(2);
    expect(harness.renderer.render).not.toHaveBeenCalled();

    harness.controller.stop();
    await vi.advanceTimersByTimeAsync(1_400);
    expect(harness.poll).toHaveBeenCalledTimes(2);
  });

  it("hiddenでは描画せず、80ms timerでsimulationだけを継続する", async () => {
    const harness = createHarness();
    harness.controller.start();
    await vi.advanceTimersByTimeAsync(0);
    const elapsedBefore = harness.controller.getWorld().elapsed;

    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(240);

    expect(harness.controller.getWorld().elapsed).toBeGreaterThanOrEqual(elapsedBefore + 0.23);
    expect(harness.renderer.render).not.toHaveBeenCalled();
    expect(harness.experience.update).not.toHaveBeenCalled();
    expect(harness.audio.update).toHaveBeenCalledTimes(1);
    harness.controller.stop();
  });

  it("visible idleの30分は回復simulationを続けても周期保存しない", async () => {
    const harness = createHarness();
    harness.controller.start();
    await advanceVisibleTime(30 * 60_000, 5_000);

    expect(harness.controller.getWorld().elapsed).toBeCloseTo(30 * 60, 5);
    expect(harness.persistence.save).not.toHaveBeenCalled();
    expect(harness.persistence.flush).not.toHaveBeenCalled();
  }, 15_000);

  it.each([false, true])("hiddenの30分はTokenが増えなければ周期保存しない（active=%s）", async (active) => {
    visibility = "hidden";
    const harness = createHarness({ active, status: active ? "thinking" : "idle" });
    harness.controller.start();
    await vi.advanceTimersByTimeAsync(0);
    harness.clearCheckpoints();
    await vi.advanceTimersByTimeAsync(30 * 60_000);

    expect(harness.controller.getWorld().elapsed).toBeCloseTo(30 * 60, 5);
    expect(harness.persistence.save).not.toHaveBeenCalled();
    expect(harness.persistence.flush).not.toHaveBeenCalled();
    expect(harness.renderer.render).not.toHaveBeenCalled();
  }, 15_000);

  it("visible activeは5秒以内に保存し、同じ時刻のframeで重複保存しない", async () => {
    const harness = createHarness({ active: true, status: "working" });
    harness.controller.start();
    await vi.advanceTimersByTimeAsync(0);
    harness.clearCheckpoints();
    await advanceVisibleTime(4_999);
    expect(harness.persistence.save).not.toHaveBeenCalled();
    await advanceVisibleTime(1);
    expect(harness.checkpoints.map((checkpoint) => checkpoint.at)).toEqual([5_000]);
    await advanceVisibleTime(5_000);
    expect(harness.checkpoints.map((checkpoint) => checkpoint.at)).toEqual([5_000, 10_000]);
  });

  it("長時間idleの後にactiveへ戻っても次の保存を5秒より先へ延期しない", async () => {
    const harness = createHarness();
    harness.controller.start();
    await advanceVisibleTime(30 * 60_000, 5_000);
    harness.setSnapshot({ active: true, status: "working" });
    await advanceVisibleTime(700);
    const resumedAt = harness.checkpoints.at(-1)!.at;
    harness.clearCheckpoints();
    await advanceVisibleTime(5_000);

    expect(harness.checkpoints).toHaveLength(1);
    expect(harness.checkpoints[0].at - resumedAt).toBeLessThanOrEqual(5_000);
  }, 15_000);

  it("hidden移行でflushし、長時間hiddenからvisible activeへ戻ると直ちに保存する", async () => {
    const harness = createHarness({ active: true, status: "thinking" });
    harness.controller.start();
    await advanceVisibleTime(1_000);
    harness.clearCheckpoints();
    setVisibility("hidden");
    expect(harness.persistence.save).toHaveBeenCalledTimes(1);
    expect(harness.persistence.flush).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(harness.persistence.save).toHaveBeenCalledTimes(1);
    setVisibility("visible");
    expect(harness.persistence.save).toHaveBeenCalledTimes(2);
  }, 15_000);

  it("hiddenの新規Tokenと燃焼結果を5秒以内のcheckpointへ集約する", async () => {
    visibility = "hidden";
    const harness = createHarness({ active: true, status: "working" });
    harness.controller.start();
    await vi.advanceTimersByTimeAsync(0);
    harness.clearCheckpoints();

    harness.setSnapshot({ tokenDelta: 100 });
    await vi.advanceTimersByTimeAsync(700);
    harness.setSnapshot({ tokenDelta: 0 });
    expect(harness.checkpoints).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(4_340);
    expect(harness.checkpoints).toHaveLength(1);
    expect(harness.checkpoints[0].world.tokenProduced).toBeCloseTo(100, 6);
    expect(harness.checkpoints[0].world.tokenQueue).toBe(0);
    expect(harness.checkpoints[0].at - 700).toBeLessThanOrEqual(5_000);
    expect(harness.persistence.flush).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(harness.checkpoints).toHaveLength(1);
  });

  it("hiddenの700ms連続Token入力でも約5秒に1回へ集約し、保存を延期し続けない", async () => {
    visibility = "hidden";
    const harness = createHarness({ active: true, status: "working" });
    harness.controller.start();
    await vi.advanceTimersByTimeAsync(0);
    harness.clearCheckpoints();
    harness.setSnapshot({ tokenDelta: 100 });
    await vi.advanceTimersByTimeAsync(30_000);

    expect(harness.checkpoints).toHaveLength(5);
    expect(harness.persistence.flush).toHaveBeenCalledTimes(5);
    let previousAt = 0;
    for (const checkpoint of harness.checkpoints) {
      expect(checkpoint.at - previousAt).toBeGreaterThanOrEqual(5_000);
      expect(checkpoint.at - previousAt).toBeLessThanOrEqual(5_080);
      const receivedTokens = Math.floor(checkpoint.at / 700) * 100;
      expect(checkpoint.world.tokenQueue + checkpoint.world.tokenProduced).toBeCloseTo(receivedTokens, 6);
      previousAt = checkpoint.at;
    }

    harness.setSnapshot({ tokenDelta: 0 });
    await vi.advanceTimersByTimeAsync(20_000);
    const finalCheckpoint = harness.checkpoints.at(-1)!;
    expect(finalCheckpoint.world.tokenQueue).toBe(0);
    expect(finalCheckpoint.world.tokenProduced).toBeCloseTo(4_200, 6);
    const saveCount = harness.checkpoints.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(harness.checkpoints).toHaveLength(saveCount);
  });

  it("Token燃焼の周期保存とhidden境界が重なっても同じ世界を二重保存しない", async () => {
    const harness = createHarness({ active: true, status: "working", tokenDelta: 100 });
    harness.controller.start();
    await vi.advanceTimersByTimeAsync(0);
    harness.setSnapshot({ tokenDelta: 0 });
    harness.clearCheckpoints();
    await vi.advanceTimersByTimeAsync(5_000);
    setVisibility("hidden");

    expect(harness.checkpoints).toHaveLength(1);
    expect(harness.checkpoints[0].world.tokenProduced).toBeCloseTo(100, 6);
    expect(harness.persistence.flush).toHaveBeenCalledTimes(1);
  });

  it.each(["visible", "hidden"] as const)("%s idleに届いたTokenも5秒以内にQueueごとflushする", async (initialVisibility) => {
    visibility = initialVisibility;
    const harness = createHarness();
    harness.controller.start();
    await vi.advanceTimersByTimeAsync(0);
    harness.setSnapshot({ tokenDelta: 42 });
    await vi.advanceTimersByTimeAsync(700);
    harness.setSnapshot({ tokenDelta: 0 });
    expect(harness.checkpoints).toHaveLength(0);
    if (initialVisibility === "visible") await advanceVisibleTime(5_000);
    else await vi.advanceTimersByTimeAsync(5_000);

    expect(harness.checkpoints).toHaveLength(1);
    expect(harness.checkpoints[0].world.tokenQueue).toBe(42);
    expect(harness.checkpoints[0].at - 700).toBeLessThanOrEqual(5_000);
    expect(harness.persistence.flush).toHaveBeenCalledTimes(1);
    if (initialVisibility === "visible") await advanceVisibleTime(60_000, 5_000);
    else await vi.advanceTimersByTimeAsync(60_000);
    expect(harness.checkpoints).toHaveLength(1);
  });

  it.each(["hide", "stop"] as const)("%s境界では5秒未満の未保存Token Queueも直ちにflushする", async (boundary) => {
    const harness = createHarness();
    harness.controller.start();
    await vi.advanceTimersByTimeAsync(0);
    harness.setSnapshot({ tokenDelta: 42 });
    await vi.advanceTimersByTimeAsync(700);
    harness.setSnapshot({ tokenDelta: 0 });
    expect(harness.checkpoints).toHaveLength(0);

    if (boundary === "hide") setVisibility("hidden");
    else harness.controller.stop();
    expect(harness.checkpoints).toHaveLength(1);
    expect(harness.checkpoints[0].world.tokenQueue).toBe(42);
    expect(harness.persistence.flush).toHaveBeenCalledTimes(1);
  });

  it("project切替で未保存Token Queueをflushし、dirtyを次のidle projectへ持ち越さない", async () => {
    visibility = "hidden";
    const harness = createHarness();
    harness.controller.start();
    await vi.advanceTimersByTimeAsync(0);
    harness.setSnapshot({ tokenDelta: 42 });
    await vi.advanceTimersByTimeAsync(700);
    expect(harness.checkpoints).toHaveLength(0);

    harness.setSnapshot({ projectKey: "next-project", tokenDelta: 0 });
    await vi.advanceTimersByTimeAsync(700);
    expect(harness.checkpoints).toHaveLength(2);
    expect(harness.checkpoints[0].world.projectKey).toBe("global");
    expect(harness.checkpoints[0].world.tokenQueue).toBe(42);
    expect(harness.checkpoints[1].world.projectKey).toBe("next-project");
    expect(harness.checkpoints[1].world.tokenQueue).toBe(0);
    harness.clearCheckpoints();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(harness.persistence.save).not.toHaveBeenCalled();
  });

  it.each([
    { active: false, status: "completed" as const },
    { active: false, status: "error" as const },
    { active: false, status: "idle" as const },
    { active: true, status: "compacting" as const },
    { active: true, status: "thinking" as const, tool: "approval_review" },
  ])("hiddenでも重要遷移$status/$toolを1回だけflushする", async (next) => {
    visibility = "hidden";
    const harness = createHarness({ active: true, status: "working", tokenDelta: 250 });
    harness.controller.start();
    await vi.advanceTimersByTimeAsync(0);
    harness.clearCheckpoints();
    harness.setSnapshot({ ...next, tokenDelta: 0 });
    await vi.advanceTimersByTimeAsync(700);

    expect(harness.persistence.save).toHaveBeenCalledTimes(1);
    expect(harness.persistence.flush).toHaveBeenCalledTimes(1);
    if (!next.active) {
      expect(harness.checkpoints[0].world.tokenQueue).toBe(0);
      expect(harness.checkpoints[0].world.debt.totalTokensBurned).toBeCloseTo(250, 6);
    }
    await vi.advanceTimersByTimeAsync(1_400);
    expect(harness.persistence.save).toHaveBeenCalledTimes(1);
  });

  it("承認待ち解除もflushし、通常のthinking/working往復は追加保存しない", async () => {
    const harness = createHarness({ active: true, status: "thinking", tool: "approval_review" });
    harness.controller.start();
    await vi.advanceTimersByTimeAsync(0);
    harness.clearCheckpoints();
    harness.setSnapshot({ tool: null });
    await vi.advanceTimersByTimeAsync(700);
    expect(harness.persistence.flush).toHaveBeenCalledTimes(1);
    harness.setSnapshot({ status: "working" });
    await vi.advanceTimersByTimeAsync(700);
    harness.setSnapshot({ status: "thinking" });
    await vi.advanceTimersByTimeAsync(700);
    expect(harness.persistence.save).toHaveBeenCalledTimes(1);
  });

  it("監視errorは最初の遷移でflushし、同じerrorのpoll反復では保存しない", async () => {
    const harness = createHarness();
    harness.controller.start();
    await vi.advanceTimersByTimeAsync(0);
    harness.poll.mockRejectedValue(new Error("monitor unavailable"));
    await vi.advanceTimersByTimeAsync(700);
    expect(harness.controller.getSnapshot().status).toBe("error");
    expect(harness.persistence.flush).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_400);
    expect(harness.persistence.save).toHaveBeenCalledTimes(1);
  });

  it("project切替とstopではReplay確定後の世界をflushし、stopは重複しない", async () => {
    const harness = createHarness();
    harness.replay.stop.mockImplementation((world) => { world.debt.wastedTokens += 1; });
    harness.controller.start();
    await vi.advanceTimersByTimeAsync(0);
    harness.setSnapshot({ projectKey: "next-project", projectLabel: "Next Project" });
    await vi.advanceTimersByTimeAsync(700);

    expect(harness.checkpoints.map((checkpoint) => checkpoint.world.projectKey)).toEqual(["global", "next-project"]);
    expect(harness.checkpoints[0].world.debt.wastedTokens).toBe(1);
    expect(harness.persistence.flush).toHaveBeenCalledTimes(2);
    harness.controller.stop();
    harness.controller.stop();
    expect(harness.checkpoints).toHaveLength(3);
    expect(harness.checkpoints[2].world.projectKey).toBe("next-project");
    expect(harness.checkpoints[2].world.debt.wastedTokens).toBe(1);
    expect(harness.persistence.flush).toHaveBeenCalledTimes(3);
  });

  it("idleの直接操作と手動伐採は保存し、その後の見た目だけの変化では保存しない", async () => {
    const harness = createHarness();
    harness.controller.start();
    await advanceVisibleTime(50);
    harness.controller.getCharacterDirector().interact(harness.controller.getWorld(), "hinoko");
    await advanceVisibleTime(50);
    expect(harness.checkpoints).toHaveLength(1);
    expect(harness.checkpoints[0].world.characters.hinoko.interactions).toBe(1);
    expect(manuallyCharNearestTree(harness.controller.getWorld(), 84, 112)).toBe(true);
    await advanceVisibleTime(50);
    expect(harness.checkpoints).toHaveLength(2);
    expect(harness.checkpoints[1].world.debt.manualDamage).toBe(1);
    expect(harness.persistence.flush).toHaveBeenCalledTimes(2);
    await advanceVisibleTime(60_000, 5_000);
    expect(harness.checkpoints).toHaveLength(2);
  });

  it("flush失敗でもsimulationを継続し、次の境界で再試行する", async () => {
    const harness = createHarness();
    harness.persistence.flush.mockRejectedValue(new Error("disk full"));
    harness.controller.start();
    await vi.advanceTimersByTimeAsync(0);
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(240);
    expect(harness.controller.getWorld().elapsed).toBeGreaterThanOrEqual(0.23);
    harness.controller.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.persistence.flush).toHaveBeenCalledTimes(2);
  });
});

const createHarness = (initial: Partial<AgentSnapshot> = {}) => {
  let snapshot = { ...IDLE_SNAPSHOT, ...initial };
  const poll = vi.fn(async () => ({ ...snapshot, updatedAtMs: Date.now() }));
  const source: AgentSource = { poll };
  const renderer = {
    render: vi.fn(),
    dispose: vi.fn(),
  } satisfies WorldRenderer;
  const audio = {
    enabled: true,
    supported: true,
    unlock: vi.fn(async () => true),
    toggle: vi.fn(async () => true),
    update: vi.fn(),
    dispose: vi.fn(),
  } satisfies AudioDirector;
  const experience = {
    update: vi.fn(),
    toggleRealityCheck: vi.fn(),
  } satisfies ExperiencePresenter;
  const checkpoints: Array<{ at: number; world: WorldState }> = [];
  const persistence = {
    loadProject: vi.fn((meta) => createWorld({
      projectKey: meta.key,
      projectLabel: meta.label,
      projectPath: meta.path,
      model: meta.model,
    })),
    save: vi.fn((world: WorldState) => { checkpoints.push({ at: performance.now(), world: structuredClone(world) }); }),
    flush: vi.fn(async () => {}),
    listProjects: vi.fn(() => []),
    exportDatabase: vi.fn(() => "{}"),
  } satisfies WorldPersistence;
  const environment = { update: vi.fn() } as unknown as EnvironmentDirector;
  const attention = {
    isQuiet: vi.fn(() => document.visibilityState === "hidden"),
    modeMultiplier: vi.fn(() => 1),
    onSnapshot: vi.fn(),
  } as unknown as AttentionDirector;
  const packEvents = { update: vi.fn() } as unknown as PackEventDirector;
  const replay = {
    update: vi.fn(),
    onSnapshot: vi.fn(),
    stop: vi.fn((_world: WorldState) => {}),
  };
  const view: ControllerView = {
    setSourceMode: vi.fn(),
    setConnectionLabel: vi.fn(),
    setStatus: vi.fn(),
  };
  const controller = new AppController(
    source,
    renderer,
    audio,
    experience,
    persistence,
    environment,
    attention,
    packEvents,
    replay as unknown as ReplayRecorder,
    view,
  );
  controllers.add(controller);
  return {
    controller, poll, renderer, audio, experience, persistence, checkpoints, replay,
    setSnapshot: (next: Partial<AgentSnapshot>) => { snapshot = { ...snapshot, ...next }; },
    clearCheckpoints: () => {
      checkpoints.length = 0;
      persistence.save.mockClear();
      persistence.flush.mockClear();
    },
  };
};
