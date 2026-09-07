import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_SNAPSHOT } from "../domain/agent";
import { createWorld } from "../domain/world";
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
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

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
});

const createHarness = () => {
  const poll = vi.fn(async () => ({ ...IDLE_SNAPSHOT, updatedAtMs: Date.now() }));
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
  const persistence = {
    loadProject: vi.fn((meta) => createWorld({
      projectKey: meta.key,
      projectLabel: meta.label,
      projectPath: meta.path,
      model: meta.model,
    })),
    save: vi.fn(),
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
    stop: vi.fn(),
  } as unknown as ReplayRecorder;
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
    replay,
    view,
  );
  return { controller, poll, renderer, audio, experience };
};
