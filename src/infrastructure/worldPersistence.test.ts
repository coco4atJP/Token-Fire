import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../domain/experienceData";
import { createWorld } from "../domain/world";
import { SettingsStore } from "./settingsStore";
import { BrowserWorldPersistence, PROJECT_PREFIX, type ProjectStorage } from "./worldPersistence";

describe("v3保存互換", () => {
  beforeEach(() => localStorage.clear());

  it("旧キャラクター・履歴・Discovery・Replayを正史化して次回保存する", async () => {
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
    await persistence.flush();

    const database = JSON.parse(persistence.exportDatabase());
    localStorage.removeItem(PROJECT_PREFIX + "migration");
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
    await migratedPersistence.flush();
    const normalized = JSON.parse(localStorage.getItem(PROJECT_PREFIX + "migration") ?? "{}").project;
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

  it("v2単一worldをLegacy Factoryへ移行し、元データを消さない", () => {
    localStorage.setItem("token-fire.world.v2", JSON.stringify({
      tokenProduced: 9_876,
      water: 0.31,
      heat: 0.82,
      debt: { totalTokensBurned: 9_876 },
    }));
    const persistence = new BrowserWorldPersistence();
    const legacy = persistence.loadProject({ key: "legacy", label: "Legacy Factory", path: null, model: null });
    expect(legacy.tokenProduced).toBe(9_876);
    expect(legacy.debt.totalTokensBurned).toBe(9_876);
    expect(localStorage.getItem("token-fire.world.v2")).not.toBeNull();
  });

  it("保存直後の再生成でWorldとReplayを復元する", async () => {
    const persistence = new BrowserWorldPersistence();
    const world = createWorld({ projectKey: "recovery", projectLabel: "Recovery" });
    world.tokenProduced = 321;
    world.replays = [{
      id: "crash-replay", projectKey: "recovery", projectLabel: "Recovery", sessionId: null,
      title: "Crash recovery", model: null, startedAt: 1, endedAt: 2, totalTokens: 321, wasted: false,
      frames: [],
    }];
    persistence.save(world);
    await persistence.flush();
    const recovered = new BrowserWorldPersistence().loadProject({ key: "recovery", label: "Recovery", path: null, model: null });
    expect(recovered.tokenProduced).toBe(321);
    expect(recovered.replays.map((replay) => replay.id)).toEqual(["crash-replay"]);
  });

  it("破損JSONと未知future versionを実行せず、安全な新規worldへ退避する", () => {
    localStorage.setItem("token-fire.worlds.v3", "{broken");
    expect(new BrowserWorldPersistence().listProjects()).toEqual([]);

    const future = JSON.stringify({ version: 999, projects: { future: { executable: "never" } } });
    localStorage.setItem("token-fire.worlds.v3", future);
    const persistence = new BrowserWorldPersistence();
    expect(persistence.listProjects()).toEqual([]);
    expect(localStorage.getItem("token-fire.worlds.v3")).toBe(future);
  });
});

describe("project単位のdirty checkpoint", () => {
  beforeEach(() => localStorage.clear());
  it("savedAtだけ変わっても同じ内容は1回しか書かない", async () => {
    const write = vi.fn();
    const persistence = new BrowserWorldPersistence({ read: () => [], write });
    const world = createWorld({ projectKey: "same" });
    persistence.save(world); await persistence.flush();
    for (let i = 0; i < 360; i++) persistence.save(world);
    await persistence.flush();
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("同一turnの変更をcoalesceし、他project全体を書かない", async () => {
    const write = vi.fn();
    const persistence = new BrowserWorldPersistence({ read: () => [], write });
    const a = createWorld({ projectKey: "A" });
    const b = createWorld({ projectKey: "B" });
    persistence.save(a); a.tokenProduced = 20; persistence.save(a); persistence.save(b);
    await persistence.flush();
    expect(write).toHaveBeenCalledTimes(2);
    expect(JSON.parse(write.mock.calls[0][1]).project.tokenProduced).toBe(20);
    expect(JSON.parse(write.mock.calls[0][1])).not.toHaveProperty("projects");
  });
  it("失敗はdirtyを保持し、同じ内容で再試行できる", async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
    const persistence = new BrowserWorldPersistence({ read: () => [], write });
    const world = createWorld({ projectKey: "retry" });
    persistence.save(world);
    await expect(persistence.flush()).rejects.toThrow("disk full");
    persistence.save(world); await persistence.flush();
    expect(write).toHaveBeenCalledTimes(2);
  });
  it("書込中の新しい変更を失わず、メモリ往復とdeep snapshotを守る", async () => {
    let release!: () => void;
    const write = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; })).mockResolvedValue(undefined);
    const persistence = new BrowserWorldPersistence({ read: () => [], write });
    const world = createWorld({ projectKey: "race" });
    persistence.save(world);
    await Promise.resolve();
    world.debt.totalTokensBurned = 123;
    persistence.save(world);
    world.debt.totalTokensBurned = 999;
    expect(persistence.loadProject({ key: "race", label: "race", path: null, model: null }).debt.totalTokensBurned).toBe(123);
    release(); await persistence.flush();
    expect(write).toHaveBeenCalledTimes(2);
    expect(JSON.parse(write.mock.calls[1][1]).project.debt.totalTokensBurned).toBe(123);
  });
  it("future versionはsave後も非破壊、read失敗も書込禁止", async () => {
    const future = JSON.stringify({ version: 999, projects: {} });
    localStorage.setItem("token-fire.worlds.v3", future);
    const write = vi.fn();
    const persistence = new BrowserWorldPersistence({ read: () => [], write });
    persistence.save(createWorld());
    await expect(persistence.flush()).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem("token-fire.worlds.v3")).toBe(future);
    localStorage.clear();
    const failed = new BrowserWorldPersistence({ read: () => { throw new Error("unreadable"); }, write });
    failed.save(createWorld());
    await expect(failed.flush()).rejects.toThrow("unreadable");
    expect(write).not.toHaveBeenCalled();
  });
  it("未燃焼Tokenとfuel余りを復元する", async () => {
    const world = createWorld({ projectKey: "fuel" });
    world.tokenQueue = 321; world.fuelProgress = 87; world.taskTokens = 999;
    const persistence = new BrowserWorldPersistence();
    persistence.save(world); await persistence.flush();
    const restored = new BrowserWorldPersistence().loadProject({ key: "fuel", label: "fuel", path: null, model: null });
    expect([restored.tokenQueue, restored.fuelProgress, restored.taskTokens]).toEqual([321, 87, 999]);
  });
  it("移行済projectは再移行せず、元v3は変更しない", async () => {
    const first = new BrowserWorldPersistence(); first.save(createWorld({ projectKey: "old" })); await first.flush();
    const legacy = first.exportDatabase(); localStorage.clear(); localStorage.setItem("token-fire.worlds.v3", legacy);
    const migrated = new BrowserWorldPersistence(); await migrated.flush();
    expect(localStorage.getItem("token-fire.worlds.v3")).toBe(legacy);
    const write = vi.fn();
    const records = Object.keys(localStorage).filter((key) => key.startsWith(PROJECT_PREFIX)).map((key) => localStorage.getItem(key)!);
    const reopened = new BrowserWorldPersistence({ read: () => records, write }); await reopened.flush();
    expect(write).not.toHaveBeenCalled();
  });
  it("上限超過・直列化失敗では旧保存を保持する", async () => {
    const write = vi.fn();
    const storage: ProjectStorage = { read: () => [], write };
    const persistence = new BrowserWorldPersistence(storage);
    const world = createWorld({ projectKey: "bounded" }); persistence.save(world); await persistence.flush();
    world.projectLabel = "x".repeat(4 * 1024 * 1024); persistence.save(world);
    await expect(persistence.flush()).rejects.toThrow("4 MiB");
    expect(write).toHaveBeenCalledTimes(1);
    world.projectLabel = "ok"; persistence.save(world); await persistence.flush();
    expect(write).toHaveBeenCalledTimes(2);
  });
  it("複数project移行の途中失敗でも旧DBと確定済projectを保持して再開する", async () => {
    const seed = new BrowserWorldPersistence({ read: () => [], write: () => {} });
    seed.save(createWorld({ projectKey: "one" })); seed.save(createWorld({ projectKey: "two" })); await seed.flush();
    const legacy = seed.exportDatabase(); localStorage.setItem("token-fire.worlds.v3", legacy);
    const records = new Map<string, string>();
    const write = vi.fn((key: string, raw: string) => {
      if (key === "two") throw new Error("full during migration");
      records.set(key, raw);
    });
    const first = new BrowserWorldPersistence({ read: () => [], write });
    await expect(first.flush()).rejects.toThrow("migration");
    expect(records.size).toBe(1);
    expect(localStorage.getItem("token-fire.worlds.v3")).toBe(legacy);
    const retry = vi.fn((key: string, raw: string) => { records.set(key, raw); });
    const reopened = new BrowserWorldPersistence({ read: () => [...records.values()], write: retry });
    await reopened.flush();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry.mock.calls[0][0]).toBe("two");
    expect(records.size).toBe(2);
    write.mockImplementation(() => {}); await first.flush();
  });
  it("循環参照の直列化失敗を通知し、確定済snapshotを変更しない", async () => {
    const write = vi.fn();
    const persistence = new BrowserWorldPersistence({ read: () => [], write });
    const world = createWorld({ projectKey: "circular" }); persistence.save(world); await persistence.flush();
    Object.assign(world.environment, { cycle: world });
    persistence.save(world);
    await expect(persistence.flush()).rejects.toThrow();
    expect(write).toHaveBeenCalledTimes(1);
    expect(persistence.exportDatabase()).not.toContain("cycle");
  });

  it("idleでも一過性の書込失敗を自動再試行し成功後timerを残さない", async () => {
    vi.useFakeTimers();
    try {
      const write = vi.fn().mockRejectedValueOnce(new Error("temporary full")).mockResolvedValue(undefined);
      const persistence = new BrowserWorldPersistence({ read: () => [], write });
      persistence.save(createWorld({ projectKey: "retry-idle" }));
      await expect(persistence.flush()).rejects.toThrow("temporary full");
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(write).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.clearAllTimers(); vi.useRealTimers(); }
  });
  it("連続失敗はbackoffしdirtyを失わず上限30秒で再試行する", async () => {
    vi.useFakeTimers();
    try {
      const write = vi.fn().mockRejectedValue(new Error("offline"));
      const persistence = new BrowserWorldPersistence({ read: () => [], write });
      persistence.save(createWorld({ projectKey: "backoff" }));
      await expect(persistence.flush()).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(999); expect(write).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1); expect(write).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1_999); expect(write).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1); expect(write).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(58_000); expect(write).toHaveBeenCalledTimes(7);
      write.mockResolvedValue(undefined);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(write).toHaveBeenCalledTimes(8);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.clearAllTimers(); vi.useRealTimers(); }
  });
  it("別projectの成功で上限超過エラーを消さず終了flushを拒否する", async () => {
    const persistence = new BrowserWorldPersistence({ read: () => [], write: () => {} });
    const big = createWorld({ projectKey: "big" }); big.projectLabel = "x".repeat(4 * 1024 * 1024);
    persistence.save(big); await expect(persistence.flush()).rejects.toThrow("4 MiB");
    persistence.save(createWorld({ projectKey: "small" }));
    await expect(persistence.flush()).rejects.toThrow("4 MiB");
    big.projectLabel = "fixed"; persistence.save(big); await persistence.flush();
  });

});
