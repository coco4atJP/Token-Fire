import { IDLE_SNAPSHOT, projectKeyOf, projectLabelOf, type AgentSnapshot } from "../domain/agent";
import { CharacterDirector } from "../domain/characterDirector";
import { EventDirector } from "../domain/eventDirector";
import { enqueueTokenFuel } from "../domain/tokenFuel";
import { enqueueWorldEvent, updateWorld, type WorldState } from "../domain/world";
import { readWorldScene } from "../domain/worldScene";
import type { AgentSource } from "../infrastructure/codexClient";
import { DemoAgentSource } from "../infrastructure/demoSource";
import type { ProjectMeta, WorldPersistence } from "../infrastructure/worldPersistence";
import type { AudioDirector } from "../presentation/audioDirector";
import type { ExperiencePresenter } from "../presentation/experienceOverlay";
import type { AttentionDirector } from "./attentionDirector";
import type { EnvironmentDirector } from "./environmentDirector";
import type { PackEventDirector } from "./packEventDirector";
import {
  advancePresentationFrameClock,
  forEachLogicalStep,
  isPresentationFrameDue,
  MAX_LOGICAL_STEP_SECONDS,
  type PresentationContext,
} from "./presentationContext";
import type { ReplayRecorder } from "./replayRecorder";
import type { WorldRenderer } from "./worldRenderer";

export type SourceMode = "codex" | "demo";

export interface ControllerView {
  setSourceMode(mode: SourceMode): void;
  setConnectionLabel(label: string): void;
  setStatus(snapshot: AgentSnapshot): void;
}

export type ControllerSubscriber = (world: WorldState, snapshot: AgentSnapshot) => void;

export class AppController {
  private world: WorldState;
  private readonly demoSource = new DemoAgentSource();
  private readonly eventDirector = new EventDirector();
  private readonly characterDirector = new CharacterDirector();
  private readonly subscribers = new Set<ControllerSubscriber>();
  private activeSource: AgentSource;
  private sourceMode: SourceMode = "codex";
  private snapshot: AgentSnapshot = IDLE_SNAPSHOT;
  private lastSimulationAt = 0;
  private lastPresentationAt = Number.NEGATIVE_INFINITY;
  private polling = false;
  private pollPending = false;
  private animationFrame = 0;
  private pollTimer = 0;
  private hiddenSimulationTimer = 0;
  private persistenceTimer = 0;
  private sourceRevision = 0;
  private started = false;
  private stopped = false;

  constructor(
    private readonly codexSource: AgentSource,
    private readonly renderer: WorldRenderer,
    private readonly audio: AudioDirector,
    private readonly experience: ExperiencePresenter,
    private readonly persistence: WorldPersistence,
    private readonly environment: EnvironmentDirector,
    private readonly attention: AttentionDirector,
    private readonly packEvents: PackEventDirector,
    private readonly replay: ReplayRecorder,
    private readonly view: ControllerView,
    private readonly readPlayActive: () => boolean = () => false,
    private readonly beforePresent: () => void = () => {},
    private readonly readQuietActive: () => boolean = () => this.attention.isQuiet(),
  ) {
    this.activeSource = codexSource;
    this.world = persistence.loadProject(metaFromSnapshot(IDLE_SNAPSHOT));
  }

  start(): void {
    if (this.stopped || this.started) return;
    this.started = true;
    this.lastSimulationAt = performance.now();
    this.view.setSourceMode(this.sourceMode);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.pollTimer = window.setInterval(this.requestPoll, 700);
    this.requestPoll();
    this.syncVisibilityLoop();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.sourceRevision += 1;
    this.pollPending = false;
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    cancelAnimationFrame(this.animationFrame);
    window.clearInterval(this.pollTimer);
    window.clearInterval(this.hiddenSimulationTimer);
    this.animationFrame = 0;
    this.pollTimer = 0;
    this.hiddenSimulationTimer = 0;
    this.replay.stop(this.world);
    this.persistence.save(this.world);
    this.audio.dispose();
    this.renderer.dispose();
  }

  setMode(mode: SourceMode): void {
    if (this.stopped) return;
    this.sourceMode = mode;
    if (mode === "demo") {
      this.demoSource.restart();
      this.activeSource = this.demoSource;
    } else {
      this.activeSource = this.codexSource;
    }
    this.sourceRevision += 1;
    this.view.setSourceMode(mode);
    this.requestPoll();
  }

  subscribe(subscriber: ControllerSubscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.world, this.snapshot);
    return () => this.subscribers.delete(subscriber);
  }

  getWorld(): WorldState {
    return this.world;
  }

  getSnapshot(): AgentSnapshot {
    return this.snapshot;
  }

  getCharacterDirector(): CharacterDirector {
    return this.characterDirector;
  }

  private readonly tick = (now: number): void => {
    if (this.stopped || document.visibilityState === "hidden") return;
    this.advanceSimulationTo(now);
    this.beforePresent();
    const context = this.readPresentationContext();
    if (isPresentationFrameDue(now - this.lastPresentationAt, context)) {
      this.present(context);
      this.lastPresentationAt = advancePresentationFrameClock(this.lastPresentationAt, now, context);
    }
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  private advanceSimulationTo(now: number): void {
    const elapsed = Math.max(0, (now - this.lastSimulationAt) / 1_000);
    this.lastSimulationAt = now;
    forEachLogicalStep(elapsed, (dt) => this.advanceLogicalWorld(dt));

    this.persistenceTimer += elapsed;
    if (this.persistenceTimer >= 5) {
      this.persistenceTimer %= 5;
      this.persistence.save(this.world);
    }
  }

  private advanceLogicalWorld(dt: number): void {
    this.environment.update(this.world);
    this.characterDirector.update(this.world, this.snapshot, dt);
    this.packEvents.update(this.world, this.snapshot, dt);
    this.eventDirector.update(this.world, this.snapshot, dt, this.attention.modeMultiplier(), this.readQuietActive());
    updateWorld(this.world, this.snapshot, dt);
    this.replay.update(this.world, this.snapshot);
  }

  private present(context: PresentationContext): void {
    const presentationSnapshot = this.presentationSnapshot();
    this.audio.update(this.world, presentationSnapshot);
    this.renderer.render(this.world, presentationSnapshot);
    this.experience.update(this.world, this.snapshot, context);
    for (const subscriber of this.subscribers) subscriber(this.world, this.snapshot);
  }

  private presentationSnapshot(): AgentSnapshot {
    return this.snapshot.status === "working" && this.world.combustionPulse < 0.04
      ? { ...this.snapshot, status: "thinking" as const }
      : this.snapshot;
  }

  private readPresentationContext(): PresentationContext {
    return {
      scene: readWorldScene(this.world, this.snapshot),
      quiet: this.readQuietActive(),
      playActive: this.readPlayActive(),
      visibility: document.visibilityState === "hidden" ? "hidden" : "visible",
    };
  }

  private readonly handleVisibilityChange = (): void => {
    if (this.stopped || !this.started) return;
    const now = performance.now();
    this.advanceSimulationTo(now);
    if (document.visibilityState === "hidden") {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
      this.startHiddenSimulation();
      // renderは止めるが、既に鳴っている音は即座にQuiet状態へ遷移させる。
      this.audio.update(this.world, this.presentationSnapshot());
      return;
    }
    window.clearInterval(this.hiddenSimulationTimer);
    this.hiddenSimulationTimer = 0;
    this.lastPresentationAt = Number.NEGATIVE_INFINITY;
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  private syncVisibilityLoop(): void {
    if (document.visibilityState === "hidden") {
      this.startHiddenSimulation();
      return;
    }
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  private startHiddenSimulation(): void {
    if (this.hiddenSimulationTimer !== 0) return;
    this.hiddenSimulationTimer = window.setInterval(
      () => this.advanceSimulationTo(performance.now()),
      MAX_LOGICAL_STEP_SECONDS * 1_000,
    );
  }

  private readonly requestPoll = (): void => {
    if (this.stopped || !this.started) return;
    if (this.polling) {
      this.pollPending = true;
      return;
    }
    void this.pollSource();
  };

  private async pollSource(): Promise<void> {
    if (this.stopped) return;
    this.polling = true;
    const revision = this.sourceRevision;
    const source = this.activeSource;
    try {
      const next = await source.poll();
      if (this.stopped || revision !== this.sourceRevision) return;
      const nextProjectKey = projectKeyOf(next);
      if (nextProjectKey !== this.world.projectKey) this.switchProject(next);
      enqueueTokenFuel(this.world, next.tokenDelta);
      this.replay.onSnapshot(this.world, this.snapshot, next);
      this.attention.onSnapshot(this.world, this.snapshot, next);
      this.eventDirector.onSnapshot(this.world, this.snapshot, next);
      this.snapshot = next;
      this.world.model = next.model ?? this.world.model;
      this.view.setStatus(next);
      this.view.setConnectionLabel(
        this.sourceMode === "demo"
          ? "DEMO SIGNAL"
          : next.source === "codex-jsonl"
            ? `CODEX · ${projectLabelOf(next)}`
            : "WAITING FOR CODEX",
      );
    } catch (error) {
      if (this.stopped || revision !== this.sourceRevision) return;
      const next: AgentSnapshot = {
        ...IDLE_SNAPSHOT,
        projectKey: this.world.projectKey,
        projectLabel: this.world.projectLabel,
        projectPath: this.world.projectPath,
        model: this.world.model,
        status: "error",
        source: "monitor-error",
        updatedAtMs: Date.now(),
      };
      this.replay.onSnapshot(this.world, this.snapshot, next);
      this.attention.onSnapshot(this.world, this.snapshot, next);
      this.eventDirector.onSnapshot(this.world, this.snapshot, next);
      this.snapshot = next;
      this.view.setStatus(this.snapshot);
      this.view.setConnectionLabel(error instanceof Error ? error.message : "MONITOR ERROR");
    } finally {
      this.polling = false;
      if (this.pollPending && !this.stopped) {
        this.pollPending = false;
        queueMicrotask(this.requestPoll);
      }
    }
  }

  private switchProject(next: AgentSnapshot): void {
    this.replay.stop(this.world);
    this.persistence.save(this.world);
    this.world = this.persistence.loadProject(metaFromSnapshot(next));
    enqueueWorldEvent(this.world, "project-arrival", 1, {
      line: `${projectLabelOf(next)}事業所へ作業員と環境債務台帳を移動しました。`,
    });
  }
}

const metaFromSnapshot = (snapshot: AgentSnapshot): ProjectMeta => ({
  key: projectKeyOf(snapshot),
  label: projectLabelOf(snapshot),
  path: snapshot.projectPath ?? null,
  model: snapshot.model ?? null,
});
