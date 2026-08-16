import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../domain/experienceData";
import { createWorld } from "../domain/world";
import { SettingsStore } from "./settingsStore";
import { BrowserWorldPersistence } from "./worldPersistence";

describe("v3保存互換", () => {
  beforeEach(() => localStorage.clear());

  it("旧キャラクター・履歴・Discovery・Replayを正史化して次回保存する", () => {
    const persistence = new BrowserWorldPersistence();
    const world = createWorld({ projectKey: "migration", projectLabel: "Migration" });
    world.characters.hinoko.interactions = 7;
    world.characters.sumi.interactions = 4;
    world.history = [{
      id: "history", at: 1, projectKey: "migration", type: "event", title: "旧イベント",
      line: "保持される", eventType: "sumi-feast", importance: 2,
    }];
    world.discoveries["sumi-feast"] = {
      eventType: "sumi-feast", firstSeenAt: 1, lastSeenAt: 2, count: 3, title: "発見", line: "保持",
    };
    world.replays = [{
      id: "replay", projectKey: "migration", projectLabel: "Migration", sessionId: null, title: "Replay",
      model: null, startedAt: 1, endedAt: 2, totalTokens: 10, wasted: false,
      frames: [{
        t: 0, active: true, status: "working", effort: "medium", agents: 1, taskTokens: 10,
        totalTokens: 10, energyLevel: 1, growthLevel: 1, heat: 0.2, pollution: 0.1,
        water: 0.9, rain: 0.1, chill: 0, trees: "gg", event: "sumi-feast",
      }],
    }];
    persistence.save(world);

    const database = JSON.parse(localStorage.getItem("token-fire.worlds.v3") ?? "{}");
    const saved = database.projects.migration;
    saved.characters.emberbeak = saved.characters.hinoko;
    saved.characters.cinder = saved.characters.sumi;
    delete saved.characters.hinoko;
    delete saved.characters.sumi;
    saved.history[0].eventType = "cinder-feast";
    saved.discoveries["cinder-feast"] = { ...saved.discoveries["sumi-feast"], eventType: "cinder-feast" };
    delete saved.discoveries["sumi-feast"];
    saved.replays[0].frames[0].event = "cinder-feast";
    localStorage.setItem("token-fire.worlds.v3", JSON.stringify(database));

    const migratedPersistence = new BrowserWorldPersistence();
    const migrated = migratedPersistence.loadProject({ key: "migration", label: "Migration", path: null, model: null });
    expect(migrated.characters.hinoko.interactions).toBe(7);
    expect(migrated.characters.sumi.interactions).toBe(4);
    expect(migrated.history[0].eventType).toBe("sumi-feast");
    expect(migrated.discoveries["sumi-feast"].count).toBe(3);
    expect(migrated.replays[0].frames[0].event).toBe("sumi-feast");

    migratedPersistence.save(migrated);
    const normalized = JSON.parse(localStorage.getItem("token-fire.worlds.v3") ?? "{}").projects.migration;
    expect(normalized.characters.hinoko.interactions).toBe(7);
    expect(normalized.characters).not.toHaveProperty("emberbeak");
    expect(normalized.discoveries).toHaveProperty("sumi-feast");
    expect(normalized.discoveries).not.toHaveProperty("cinder-feast");
  });

  it("旧settings.v1へ案内既読の既定値を補う", () => {
    localStorage.setItem("token-fire.settings.v1", JSON.stringify({ autostart: true, attention: { mode: "calm" } }));
    const settings = new SettingsStore().get();
    expect(settings.autostart).toBe(true);
    expect(settings.playIntroSeen).toBe(false);
    expect(settings.openingBriefingSeen).toBe(false);
    expect(settings.attention.mode).toBe("calm");
    expect(settings.attention.reduceFlash).toBe(DEFAULT_SETTINGS.attention.reduceFlash);
  });

  it("旧PLAY案内が既読なら新しい初回説明も既読として移行する", () => {
    localStorage.setItem("token-fire.settings.v1", JSON.stringify({ playIntroSeen: true }));
    const settings = new SettingsStore().get();
    expect(settings.playIntroSeen).toBe(true);
    expect(settings.openingBriefingSeen).toBe(true);
    expect(localStorage.getItem("token-fire.settings.v2")).toBeNull();
  });
});
