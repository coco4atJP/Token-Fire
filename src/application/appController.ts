import { IDLE_SNAPSHOT, type AgentSnapshot } from "../domain/agent";
import { addTokenDelta, createWorld, updateWorld, type WorldState } from "../domain/world";
import type { AgentSource } from "../infrastructure/codexClient";
import { DemoAgentSource } from "../infrastructure/demoSource";
import { PixelRenderer } from "../presentation/pixelRenderer";

export type SourceMode = "codex" | "demo";

export interface ControllerView {
  setSourceMode(mode: SourceMode): void;
  setConnectionLabel(label: string): void;
  setStatus(snapshot: AgentSnapshot): void;
}

export class AppController {
  private readonly world: WorldState = createWorld();
  private readonly demoSource = new DemoAgentSource();
  private activeSource: AgentSource;
  private sourceMode: SourceMode = "codex";
  private snapshot: AgentSnapshot = IDLE_SNAPSHOT;
  private lastFrame = performance.now();
  private lastPoll = 0;
  private polling = false;
  private animationFrame = 0;

  constructor(
    private readonly codexSource: AgentSource,
    private readonly renderer: PixelRenderer,
    private readonly view: ControllerView,
  ) {
    this.activeSource = codexSource;
  }

  start(): void {
    this.view.setSourceMode(this.sourceMode);
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  stop(): void {
    cancelAnimationFrame(this.animationFrame);
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
    const dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    updateWorld(this.world, this.snapshot, dt);
    this.renderer.render(this.world, this.snapshot);

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
      this.snapshot = {
        ...IDLE_SNAPSHOT,
        status: "error",
        source: "monitor-error",
        updatedAtMs: Date.now(),
      };
      this.view.setStatus(this.snapshot);
      this.view.setConnectionLabel(error instanceof Error ? error.message : "MONITOR ERROR");
    } finally {
      this.polling = false;
    }
  }
}
