import type { WeatherKind } from "../domain/experienceData";
import { enqueueWorldEvent, type WorldState } from "../domain/world";
import type { SettingsStore } from "../infrastructure/settingsStore";

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
}

export class EnvironmentDirector {
  private lastMinute = -1;
  private nextWeatherAt = 0;
  private fetching = false;

  constructor(private readonly settings: SettingsStore) {}

  update(world: WorldState): void {
    const now = new Date();
    if (now.getMinutes() !== this.lastMinute) {
      this.lastMinute = now.getMinutes();
      world.environment.hour = now.getHours();
      world.environment.timePhase = timePhase(now.getHours());
    }

    const weather = this.settings.get().weather;
    if (!weather.enabled || this.fetching || Date.now() < this.nextWeatherAt) return;
    this.fetching = true;
    this.nextWeatherAt = Date.now() + 15 * 60_000;
    void this.refreshWeather(world).finally(() => {
      this.fetching = false;
    });
  }

  private async refreshWeather(world: WorldState): Promise<void> {
    const settings = this.settings.get().weather;
    const params = new URLSearchParams({
      latitude: String(settings.latitude),
      longitude: String(settings.longitude),
      current: "temperature_2m,weather_code",
      timezone: "auto",
    });
    try {
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
      if (!response.ok) throw new Error(`weather ${response.status}`);
      const data = await response.json() as OpenMeteoResponse;
      const nextWeather = weatherFromCode(data.current?.weather_code);
      const previous = world.environment.weather;
      world.environment.weather = nextWeather;
      world.environment.temperatureC = Number.isFinite(data.current?.temperature_2m) ? Number(data.current?.temperature_2m) : null;
      world.environment.weatherUpdatedAt = Date.now();
      if (previous !== "unknown" && previous !== nextWeather) {
        enqueueWorldEvent(world, "weather-shift", 1, {
          line: `${settings.label}の空模様を「${weatherLabel(nextWeather)}」として工場へ反映しました。`,
        });
      }
    } catch {
      this.nextWeatherAt = Date.now() + 30 * 60_000;
    }
  }
}

const timePhase = (hour: number): WorldState["environment"]["timePhase"] => {
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
};

const weatherFromCode = (code: number | undefined): WeatherKind => {
  if (code === undefined) return "unknown";
  if (code === 0 || code === 1) return "clear";
  if (code === 2 || code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
};

export const weatherLabel = (weather: WeatherKind): string => ({
  clear: "晴れ",
  cloudy: "くもり",
  rain: "雨",
  snow: "雪",
  storm: "嵐",
  fog: "霧",
  unknown: "未取得",
})[weather];
