import type { AgentSnapshot } from "../domain/agent";
import type { EventPackEntry, EventPackRegistry } from "../domain/eventPack";
import { enqueueWorldEvent, type WorldState } from "../domain/world";
import type { SettingsStore } from "../infrastructure/settingsStore";
import type { AttentionDirector } from "./attentionDirector";

export class PackEventDirector {
  private timer = 26;
  private rngState = 0x165667b1;

  constructor(
    private readonly registry: EventPackRegistry,
    private readonly settings: SettingsStore,
    private readonly attention: AttentionDirector,
  ) {}

  update(world: WorldState, snapshot: AgentSnapshot, dt: number): void {
    if (this.attention.isQuiet()) return;
    this.timer -= dt * this.attention.modeMultiplier();
    if (this.timer > 0 || world.activeEvent?.tone === "ceremony") return;
    const entries = this.registry.candidates(
      { snapshot, world, environment: world.environment },
      this.settings.get().enabledEventPacks,
    );
    const selected = weightedPick(entries, () => this.random());
    if (selected) {
      enqueueWorldEvent(world, `pack:${selected.id}`, Math.max(1, world.energyLevel), {
        title: selected.title,
        line: selected.line,
        tone: selected.tone,
        duration: selected.duration ?? 3.8,
      });
    }
    const mode = this.settings.get().attention.mode;
    const base = mode === "chaos" ? 18 : mode === "calm" ? 52 : 34;
    this.timer = base + this.random() * base * 0.65;
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

const weightedPick = (entries: EventPackEntry[], random: () => number): EventPackEntry | null => {
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, entry) => sum + Math.max(0.05, entry.weight ?? 1), 0);
  let cursor = random() * total;
  for (const entry of entries) {
    cursor -= Math.max(0.05, entry.weight ?? 1);
    if (cursor <= 0) return entry;
  }
  return entries[entries.length - 1];
};
