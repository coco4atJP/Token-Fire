import type { AgentSnapshot } from "./agent";
import { enqueueWorldEvent, type WorldState } from "./world";
import type { WorldEventType } from "./worldEvent";

export class EventDirector {
  private rareTimer = 24;
  private chillTimer = 32;
  private rngState = 0x9e3779b9;

  onSnapshot(world: WorldState, previous: AgentSnapshot, next: AgentSnapshot): void {
    const started = next.active && !previous.active;
    const stopped = !next.active && previous.active;
    const errored = next.status === "error" && previous.status !== "error";
    const compacted = next.status === "compacting" && previous.status !== "compacting";
    const agentExpansion = next.activeSessions > previous.activeSessions && next.activeSessions > 1;
    const toolChanged = next.active && next.tool !== previous.tool && next.tool !== null;

    if (started) {
      world.taskTokens = 0;
      world.taskPeakAgents = Math.max(1, next.activeSessions);
    }

    if (agentExpansion) {
      world.factoryTier = Math.max(world.factoryTier, Math.min(5, 1 + next.activeSessions));
      enqueueWorldEvent(world, "factory-expansion", next.activeSessions);
    }

    if (toolChanged && next.tool) {
      const type = this.toolEvent(next.tool);
      if (type) enqueueWorldEvent(world, type, Math.max(1, next.tokenDelta));
    }

    if (compacted) enqueueWorldEvent(world, "context-landfill", Math.max(1, world.taskTokens));

    if (errored) {
      const wasted = Math.max(world.taskTokens, next.tokenDelta);
      world.debt.wastedTokens += wasted;
      this.clearEventBacklog(world);
      enqueueWorldEvent(world, "sunk-cost-error", wasted);
      world.taskTokens = 0;
    } else if (stopped || (next.status === "completed" && previous.status !== "completed")) {
      if (world.taskTokens > 0 || previous.active) {
        world.debt.completedJobs += 1;
        world.debt.greenwashCeremonies += 1;
        this.clearEventBacklog(world);
        enqueueWorldEvent(world, "greenwash-ceremony", Math.max(1, world.taskTokens), {
          line: `焼却 ${Math.round(world.taskTokens).toLocaleString()} TOK。苗木を一本植えて相殺しました。`,
        });
      }
      world.taskTokens = 0;
      world.taskPeakAgents = 0;
    }
  }

  update(world: WorldState, snapshot: AgentSnapshot, dt: number): void {
    this.coalesceTokenEvents(world);
    if (snapshot.active) {
      this.chillTimer = 32;
      this.rareTimer -= dt;
      if (this.rareTimer <= 0) {
        const rare = this.pickActiveRare(snapshot);
        enqueueWorldEvent(world, rare, Math.max(1, snapshot.activeSessions));
        this.rareTimer = 22 + this.random() * 34;
      }
      return;
    }

    this.rareTimer = Math.max(this.rareTimer, 14);
    this.chillTimer -= dt;
    if (world.chill > 0.62 && this.chillTimer <= 0) {
      const event: WorldEventType = this.random() > 0.44 ? "plantation-break" : "recovery-rainbow";
      enqueueWorldEvent(world, event, world.chill);
      this.chillTimer = 34 + this.random() * 28;
    }
  }

  private coalesceTokenEvents(world: WorldState): void {
    const tokenEvents = world.eventQueue.filter((event) => event.type === "token-burn");
    if (tokenEvents.length <= 1) return;
    const first = tokenEvents[0];
    first.magnitude = tokenEvents.reduce((sum, event) => sum + event.magnitude, 0);
    world.eventQueue = [
      ...world.eventQueue.filter((event) => event.type !== "token-burn"),
      first,
    ].slice(0, 8);
  }

  private clearEventBacklog(world: WorldState): void {
    world.eventQueue = [];
    world.activeEvent = null;
    world.eventElapsed = 0;
  }

  private toolEvent(tool: string): WorldEventType | null {
    if (tool === "shell") return "coolant-drain";
    if (tool === "apply_patch") return "tree-harvest";
    if (tool === "web_search") return "tree-harvest";
    return null;
  }

  private pickActiveRare(snapshot: AgentSnapshot): WorldEventType {
    const roll = this.random();
    if (roll > 0.985) return "legendary-zoy";
    if (snapshot.activeSessions >= 3 && roll > 0.55) return "union-dance";
    if (roll > 0.42) return "cinder-feast";
    return "forge-sneeze";
  }

  private random(): number {
    let value = this.rngState | 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.rngState = value >>> 0;
    return this.rngState / 0xffffffff;
  }
}
