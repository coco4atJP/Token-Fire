import type { AgentSnapshot } from "./agent";
import type { EnvironmentContext } from "./experienceData";
import type { WorldState } from "./world";
import type { WorldEventTone } from "./worldEvent";

export interface EventPackCondition {
  phase?: "active" | "chill";
  minAgents?: number;
  minEnergyLevel?: number;
  maxEnergyLevel?: number;
  tool?: string;
  weather?: string;
  timePhase?: string;
}

export interface EventPackEntry {
  id: string;
  title: string;
  line: string;
  tone: WorldEventTone;
  duration?: number;
  weight?: number;
  condition?: EventPackCondition;
}

export interface EventPack {
  id: string;
  name: string;
  version: number;
  description: string;
  events: EventPackEntry[];
}

export interface EventPackContext {
  snapshot: AgentSnapshot;
  world: WorldState;
  environment: EnvironmentContext;
}

const BUILTIN_PACKS: EventPack[] = [
  {
    id: "core-black-comedy",
    name: "Core Black Comedy",
    version: 1,
    description: "可愛い悪徳工場の日常事故と経営判断。",
    events: [
      { id: "shareholder-smoke", title: "SHAREHOLDER VISIBILITY", line: "煙が見えるほど、事業は透明です。", tone: "destruction", weight: 1.2, condition: { phase: "active", minEnergyLevel: 7 } },
      { id: "green-paint-order", title: "GREEN PROCUREMENT", line: "環境予算で緑色の塗料を買いました。", tone: "ceremony", weight: 0.7, condition: { phase: "active" } },
      { id: "lake-lease", title: "COOLANT LEASE RENEWED", line: "湖の契約期間を、湖に無断で延長しました。", tone: "warning", weight: 0.9, condition: { phase: "active", minEnergyLevel: 11 } },
      { id: "executive-forecast", title: "EXECUTIVE FORECAST", line: "来期は森林在庫を倍速で回転させます。", tone: "destruction", weight: 0.8, condition: { phase: "active", minAgents: 2 } },
      { id: "error-bonus", title: "FAILURE BONUS", line: "失敗しましたが、熱だけは計画を達成しました。", tone: "warning", weight: 0.6, condition: { phase: "active" } },
      { id: "tiny-offset", title: "CARBON OFFSET", line: "葉っぱを一枚置いたので、だいたい相殺です。", tone: "ceremony", weight: 0.6, condition: { phase: "chill" } },
    ],
  },
  {
    id: "plantation-night-shift",
    name: "Plantation Night Shift",
    version: 1,
    description: "夜間のChillと、静かな次回燃焼準備。",
    events: [
      { id: "night-watering", title: "NIGHT WATERING", line: "眠っている森へ、次回分の水を静かに配送中。", tone: "chill", weight: 1.4, condition: { phase: "chill", timePhase: "night" } },
      { id: "fog-accounting", title: "FOG ACCOUNTING", line: "霧で見えない部分は、報告書にも載せません。", tone: "chill", weight: 0.8, condition: { phase: "chill", weather: "fog" } },
      { id: "rain-priority", title: "PRIORITY RAIN", line: "雨は工場の冷却を優先しています。", tone: "chill", weight: 1, condition: { phase: "chill", weather: "rain" } },
      { id: "snow-inventory", title: "FROZEN INVENTORY", line: "森林在庫を冷凍保存しています。", tone: "chill", weight: 0.8, condition: { phase: "chill", weather: "snow" } },
      { id: "dawn-shift", title: "DAWN SHIFT", line: "朝焼けです。焼け跡ではありません。", tone: "chill", weight: 0.9, condition: { phase: "chill", timePhase: "dawn" } },
    ],
  },
];

const CUSTOM_PACKS_KEY = "token-fire.event-packs.v1";

export class EventPackRegistry {
  private readonly packs = new Map<string, EventPack>();

  constructor() {
    for (const pack of BUILTIN_PACKS) this.packs.set(pack.id, pack);
    try {
      const raw = localStorage.getItem(CUSTOM_PACKS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        for (const candidate of parsed) {
          const pack = validateEventPack(candidate);
          if (pack) this.packs.set(pack.id, pack);
        }
      }
    } catch {
      // Built-in packs remain available when custom data is malformed.
    }
  }

  list(): EventPack[] {
    return [...this.packs.values()];
  }

  import(raw: unknown): EventPack {
    const pack = validateEventPack(raw);
    if (!pack) throw new Error("イベントパックの形式が正しくありません");
    this.packs.set(pack.id, pack);
    this.persistCustom();
    return pack;
  }

  candidates(context: EventPackContext, enabledPackIds: string[]): EventPackEntry[] {
    const entries: EventPackEntry[] = [];
    for (const id of enabledPackIds) {
      const pack = this.packs.get(id);
      if (!pack) continue;
      for (const entry of pack.events) {
        if (matches(entry.condition, context)) entries.push(entry);
      }
    }
    return entries;
  }

  private persistCustom(): void {
    const custom = [...this.packs.values()].filter((pack) => !BUILTIN_PACKS.some((builtin) => builtin.id === pack.id));
    try {
      localStorage.setItem(CUSTOM_PACKS_KEY, JSON.stringify(custom));
    } catch {
      // Import still works for the current session.
    }
  }
}

const matches = (condition: EventPackCondition | undefined, context: EventPackContext): boolean => {
  if (!condition) return true;
  const { snapshot, world, environment } = context;
  if (condition.phase === "active" && !snapshot.active) return false;
  if (condition.phase === "chill" && snapshot.active) return false;
  if (condition.minAgents !== undefined && snapshot.activeSessions < condition.minAgents) return false;
  if (condition.minEnergyLevel !== undefined && world.energyLevel < condition.minEnergyLevel) return false;
  if (condition.maxEnergyLevel !== undefined && world.energyLevel > condition.maxEnergyLevel) return false;
  if (condition.tool && snapshot.tool !== condition.tool) return false;
  if (condition.weather && environment.weather !== condition.weather) return false;
  if (condition.timePhase && environment.timePhase !== condition.timePhase) return false;
  return true;
};

const validateEventPack = (raw: unknown): EventPack | null => {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<EventPack>;
  if (typeof candidate.id !== "string" || !/^[a-z0-9][a-z0-9-]{2,63}$/i.test(candidate.id)) return null;
  if (typeof candidate.name !== "string" || typeof candidate.description !== "string") return null;
  if (!Array.isArray(candidate.events) || candidate.events.length === 0 || candidate.events.length > 200) return null;
  const events: EventPackEntry[] = [];
  for (const rawEvent of candidate.events) {
    if (!rawEvent || typeof rawEvent !== "object") return null;
    const event = rawEvent as Partial<EventPackEntry>;
    if (typeof event.id !== "string" || typeof event.title !== "string" || typeof event.line !== "string") return null;
    if (!event.tone || !["destruction", "warning", "chill", "ceremony"].includes(event.tone)) return null;
    events.push({
      id: event.id.slice(0, 80),
      title: event.title.slice(0, 120),
      line: event.line.slice(0, 240),
      tone: event.tone,
      duration: Math.max(1.5, Math.min(12, Number(event.duration) || 3.8)),
      weight: Math.max(0.05, Math.min(20, Number(event.weight) || 1)),
      condition: event.condition,
    });
  }
  return {
    id: candidate.id,
    name: candidate.name.slice(0, 100),
    version: Math.max(1, Math.floor(Number(candidate.version) || 1)),
    description: candidate.description.slice(0, 300),
    events,
  };
};
