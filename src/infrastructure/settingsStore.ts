import { DEFAULT_SETTINGS, type AppSettings } from "../domain/experienceData";

const SETTINGS_KEY = "token-fire.settings.v1";

export class SettingsStore extends EventTarget {
  private settings: AppSettings;

  constructor() {
    super();
    this.settings = this.load();
  }

  get(): AppSettings {
    return structuredClone(this.settings);
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.settings = {
      ...this.settings,
      ...patch,
      weather: { ...this.settings.weather, ...(patch.weather ?? {}) },
      attention: { ...this.settings.attention, ...(patch.attention ?? {}) },
      enabledEventPacks: patch.enabledEventPacks ?? this.settings.enabledEventPacks,
    };
    this.persist();
    this.dispatchEvent(new CustomEvent("change", { detail: this.get() }));
    return this.get();
  }

  quietFor(minutes: number): AppSettings {
    return this.update({ attention: { ...this.settings.attention, quietUntil: Date.now() + Math.max(1, minutes) * 60_000 } });
  }

  isQuiet(now = new Date()): boolean {
    const { attention } = this.settings;
    if (attention.quietUntil > now.getTime()) return true;
    const hour = now.getHours();
    const start = attention.quietHoursStart;
    const end = attention.quietHoursEnd;
    return start === end ? false : start < end ? hour >= start && hour < end : hour >= start || hour < end;
  }

  private load(): AppSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return structuredClone(DEFAULT_SETTINGS);
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return {
        ...structuredClone(DEFAULT_SETTINGS),
        ...parsed,
        weather: { ...DEFAULT_SETTINGS.weather, ...(parsed.weather ?? {}) },
        attention: { ...DEFAULT_SETTINGS.attention, ...(parsed.attention ?? {}) },
        enabledEventPacks: Array.isArray(parsed.enabledEventPacks) ? parsed.enabledEventPacks : DEFAULT_SETTINGS.enabledEventPacks,
      };
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // The app remains functional with in-memory settings.
    }
  }
}
