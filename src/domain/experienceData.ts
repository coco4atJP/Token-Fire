import type { AgentStatus, ReasoningEffort } from "./agent";
import type { WorldEventTone, WorldEventType } from "./worldEvent";

export type TimePhase = "dawn" | "day" | "dusk" | "night";
export type WeatherKind = "clear" | "cloudy" | "rain" | "snow" | "storm" | "fog" | "unknown";

export interface EnvironmentContext {
  timePhase: TimePhase;
  hour: number;
  weather: WeatherKind;
  temperatureC: number | null;
  weatherUpdatedAt: number;
}

export interface HistoricalMoment {
  id: string;
  at: number;
  projectKey: string;
  type: "event" | "milestone" | "task" | "interaction";
  title: string;
  line: string;
  eventType?: WorldEventType;
  tone?: WorldEventTone;
  tokens?: number;
  model?: string | null;
  importance: 1 | 2 | 3;
}

export interface EventDiscovery {
  eventType: string;
  firstSeenAt: number;
  lastSeenAt: number;
  count: number;
  title: string;
  line: string;
}

export interface ReplayFrame {
  t: number;
  active: boolean;
  status: AgentStatus;
  effort: ReasoningEffort;
  agents: number;
  taskTokens: number;
  totalTokens: number;
  energyLevel: number;
  growthLevel: number;
  heat: number;
  pollution: number;
  water: number;
  rain: number;
  chill: number;
  trees: string;
  event: string | null;
}

export interface ReplaySession {
  id: string;
  projectKey: string;
  projectLabel: string;
  sessionId: string | null;
  title: string;
  model: string | null;
  startedAt: number;
  endedAt: number;
  totalTokens: number;
  wasted: boolean;
  frames: ReplayFrame[];
}

export interface WeatherSettings {
  enabled: boolean;
  latitude: number;
  longitude: number;
  label: string;
}

export interface AttentionSettings {
  mode: "calm" | "balanced" | "chaos";
  quietUntil: number;
  quietHoursStart: number;
  quietHoursEnd: number;
  notifyApproval: boolean;
  notifyComplete: boolean;
  maxEventSoundsPerMinute: number;
  reduceFlash: boolean;
}

export interface AppSettings {
  autostart: boolean;
  weather: WeatherSettings;
  attention: AttentionSettings;
  enabledEventPacks: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  autostart: false,
  weather: {
    enabled: false,
    latitude: 35.4437,
    longitude: 139.638,
    label: "Yokohama",
  },
  attention: {
    mode: "balanced",
    quietUntil: 0,
    quietHoursStart: 23,
    quietHoursEnd: 7,
    notifyApproval: true,
    notifyComplete: false,
    maxEventSoundsPerMinute: 8,
    reduceFlash: false,
  },
  enabledEventPacks: ["core-black-comedy", "plantation-night-shift"],
};
