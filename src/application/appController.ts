import { IDLE_SNAPSHOT, type AgentSnapshot } from "../domain/agent";
import { EventDirector } from "../domain/eventDirector";
import { addTokenDelta, updateWorld, type WorldState } from "../domain/world";
import type { AgentSource } from "../infrastructure/codexClient";
import { DemoAgentSource } from "../infrastructure/demoSource";
import type { WorldPersistence } from "../infrastructure/worldPersistence";
import type { AudioDirector } from "../presentation/audioDirector";
import type { ExperiencePresenter } from "../presentation/experienceOverlay";
import { PixelRenderer } from "../presentation/pixelRenderer";

export type SourceMode = "codex" | "demo";

export interface ControllerView {
  setSourceMode(mode: SourceMode): void;
  setConnectionLabel(label: string): void;
  setStatus(snapshot: AgentSnapshot): void;
}

export class AppController {
  private readonly world: WorldState;
  private readonly demoSource = new DemoAgentSource();
  private readonly eventDirector = new EventDirector();
  private activeSource: AgentSource;
  private sourceMode: SourceMode = "codex";
  private snapshot: AgentSnapshot = IDLE_SNAPSHOT;
  private lastFrame = performance.now();
  private lastPoll = 0;
  private polling = false;
  private animationFrame = 0;
  private persistenceTimer = 0;

  constructor(
    private readonly codexSource: AgentSource,
    private readonly renderer: PixelRenderer,
    private readonly audio: AudioDirector,
    private readonly experience: ExperiencePresenter,
    private readonly persistence: WorldPersistence,
    private readonly view: ControllerView,
  ) {
    this.activeSource = codexSource;
    this.world = persistence.load();
  }

  start(): void {
    this.view.setSourceMode(this.sourceMode);
    void this.audio.unlock();
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  stop(): void {
    cancelAnimationFrame(this.animationFrame);
    this.persistence.save(this.world);
    this.audio.dispose();
  }

  setMode(mode: SourceMode): void {
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

  private readonly tick = (now: number): void => {
    const dt = Math.min(0.08, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;

    this.eventDirector.update(this.world, this.snapshot, dt);
    updateWorld(this.world, this.snapshot, dt);
    const presentationSnapshot =
      this.snapshot.status === "working" && this.world.combustionPulse < 0.04
        ? { ...this.snapshot, status: "thinking" as const }
        : this.snapshot;
    this.audio.update(this.world, presentationSnapshot);
    this.renderer.render(this.world, presentationSnapshot);
    this.experience.update(this.world, this.snapshot);

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
    this.polling = true;
    try {
      const next = await this.activeSource.poll();
      this.eventDirector.onSnapshot(this.world, this.snapshot, next);
      this.snapshot = next;
      addTokenDelta(this.world, next.tokenDelta);
      this.view.setStatus(next);
      this.view.setConnectionLabel(
        this.sourceMode === "demo"
          ? "DEMO SIGNAL"
          : next.source === "codex-jsonl"
            ? "CODEX DESKTOP"
            : "WAITING FOR CODEX",
      );
    } catch (error) {
      const next: AgentSnapshot = {
        ...IDLE_SNAPSHOT,
        status: "error",
        source: "monitor-error",
        updatedAtMs: Date.now(),
      };
      this.eventDirector.onSnapshot(this.world, this.snapshot, next);
      this.snapshot = next;
      this.view.setStatus(this.snapshot);
      this.view.setConnectionLabel(error instanceof Error ? error.message : "MONITOR ERROR");
    } finally {
      this.polling = false;
    }
  }
}
