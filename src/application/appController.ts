import { IDLE_SNAPSHOT, projectKeyOf, projectLabelOf, type AgentSnapshot } from "../domain/agent";
import { CharacterDirector } from "../domain/characterDirector";
import { EventDirector } from "../domain/eventDirector";
import { addTokenDelta, enqueueWorldEvent, updateWorld, type WorldState } from "../domain/world";
import type { AgentSource } from "../infrastructure/codexClient";
import { DemoAgentSource } from "../infrastructure/demoSource";
import type { ProjectMeta, WorldPersistence } from "../infrastructure/worldPersistence";
import type { AudioDirector } from "../presentation/audioDirector";
import type { ExperiencePresenter } from "../presentation/experienceOverlay";
import { PixelRenderer } from "../presentation/pixelRenderer";
import type { AttentionDirector } from "./attentionDirector";
import type { EnvironmentDirector } from "./environmentDirector";
import type { PackEventDirector } from "./packEventDirector";
import type { ReplayRecorder } from "./replayRecorder";

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
  private lastFrame = performance.now();
  private lastPoll = 0;
  private polling = false;
  private animationFrame = 0;
  private persistenceTimer = 0;
  private stopped = false;

  constructor(
    private readonly codexSource: AgentSource,
    private readonly renderer: PixelRenderer,
    private readonly audio: AudioDirector,
    private readonly experience: ExperiencePresenter,
    private readonly persistence: WorldPersistence,
    private readonly environment: EnvironmentDirector,
    private readonly attention: AttentionDirector,
    private readonly packEvents: PackEventDirector,
    private readonly replay: ReplayRecorder,
    private readonly view: ControllerView,
  ) {
    this.activeSource = codexSource;
    this.world = persistence.loadProject(metaFromSnapshot(IDLE_SNAPSHOT));
  }

  start(): void {
    if (this.stopped) return;
    this.view.setSourceMode(this.sourceMode);
    void this.audio.unlock();
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    cancelAnimationFrame(this.animationFrame);
    this.replay.stop(this.world);
    this.persistence.save(this.world);
    this.audio.dispose();
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
    this.view.setSourceMode(mode);
    this.lastPoll = 0;
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
    if (this.stopped) return;
    const dt = Math.min(0.08, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;

    this.environment.update(this.world);
    this.characterDirector.update(this.world, this.snapshot, dt);
    this.packEvents.update(this.world, this.snapshot, dt);
    this.eventDirector.update(this.world, this.snapshot, dt, this.attention.modeMultiplier(), this.attention.isQuiet());
    updateWorld(this.world, this.snapshot, dt);
    this.replay.update(this.world, this.snapshot);

    const presentationSnapshot =
      this.snapshot.status === "working" && this.world.combustionPulse < 0.04
        ? { ...this.snapshot, status: "thinking" as const }
        : this.snapshot;
    this.audio.update(this.world, presentationSnapshot);
    this.renderer.render(this.world, presentationSnapshot);
    this.experience.update(this.world, this.snapshot);
    for (const subscriber of this.subscribers) subscriber(this.world, this.snapshot);

    this.persistenceTimer += dt;
    if (this.persistenceTimer >= 5) {
      this.persistenceTimer = 0;
      this.persistence.save(this.world);
    }

    if (now - this.lastPoll > 700 && !this.polling) {
      this.lastPoll = now;
      void this.pollSource();
    }
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  private async pollSource(): Promise<void> {
    if (this.stopped) return;
    this.polling = true;
    try {
      const next = await this.activeSource.poll();
      const nextProjectKey = projectKeyOf(next);
      if (nextProjectKey !== this.world.projectKey) this.switchProject(next);
      addTokenDelta(this.world, next.tokenDelta);
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
