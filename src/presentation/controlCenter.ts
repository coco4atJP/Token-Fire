import type { AgentSnapshot } from "../domain/agent";
import type { EventPackRegistry } from "../domain/eventPack";
import type { AppSettings } from "../domain/experienceData";
import { getWorldMetrics, type WorldState } from "../domain/world";
import type { PlatformBridge } from "../infrastructure/platformBridge";
import type { SettingsStore } from "../infrastructure/settingsStore";
import type { WorldPersistence } from "../infrastructure/worldPersistence";
import { downloadBlob, exportReplayData, exportReplayVideo } from "./replayExporter";
import { exportEnvironmentalDebtReport } from "./reportGenerator";

export class ControlCenter {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private open = false;
  private activeTab = "ledger";
  private lastRenderAt = 0;
  private world: WorldState;
  private snapshot: AgentSnapshot;

  constructor(
    host: HTMLElement,
    initialWorld: WorldState,
    initialSnapshot: AgentSnapshot,
    private readonly persistence: WorldPersistence,
    private readonly settings: SettingsStore,
    private readonly eventPacks: EventPackRegistry,
    private readonly platform: PlatformBridge,
  ) {
    this.world = initialWorld;
    this.snapshot = initialSnapshot;
    this.root = document.createElement("section");
    this.root.className = "control-center";
    this.root.setAttribute("aria-label", "Token-Fire記録棚");
    this.root.innerHTML = `
      <header class="control-center__header"><strong>COMPANY LEDGER</strong><button type="button" data-action="close" aria-label="閉じる">×</button></header>
      <nav class="control-center__tabs" aria-label="記録棚のページ">
        <button type="button" data-tab="ledger">記録</button><button type="button" data-tab="projects">事業所</button>
        <button type="button" data-tab="replays">動作</button><button type="button" data-tab="events">できごと</button><button type="button" data-tab="settings">設定</button>
      </nav>
      <div class="control-center__body"></div>
      <input class="event-pack-input" type="file" accept="application/json,.json" hidden>
    `;
    host.append(this.root);
    this.body = this.requireElement<HTMLElement>(".control-center__body");
    this.root.addEventListener("click", (event) => void this.handleClick(event));
    this.root.addEventListener("change", (event) => void this.handleChange(event));
    this.root.querySelector<HTMLInputElement>(".event-pack-input")?.addEventListener("change", (event) => void this.importPack(event));
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.root.classList.toggle("is-open", this.open);
    if (this.open) this.render(true);
  }

  update(world: WorldState, snapshot: AgentSnapshot): void {
    this.world = world;
    this.snapshot = snapshot;
    if (this.open && performance.now() - this.lastRenderAt > 1_000) this.render(false);
  }

  private render(force: boolean): void {
    this.lastRenderAt = performance.now();
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-tab]")) button.setAttribute("aria-pressed", String(button.dataset.tab === this.activeTab));
    if (!force && this.body.matches(":focus-within")) return;
    const renderers: Record<string, () => string> = {
      ledger: () => this.renderLedger(), projects: () => this.renderProjects(), replays: () => this.renderReplays(), events: () => this.renderEvents(), settings: () => this.renderSettings(),
    };
    this.body.innerHTML = (renderers[this.activeTab] ?? renderers.ledger)();
  }

  private renderLedger(): string {
    const metrics = getWorldMetrics(this.world);
    const recent = this.world.history.slice(0, 18);
    const model = this.snapshot.model ?? this.world.model ?? "未取得";
    return `
      <div class="ledger-metrics">
        ${metric("焼却Token", metrics.totalTokensBurned.toLocaleString())}${metric("ふわっとした多さ", metrics.energyLabel)}
        ${metric("設備", `${metrics.growthLevel + 1}/24`)}${metric("成果ゼロ", metrics.wastedTokens.toLocaleString())}${metric("現在モデル", model)}
      </div>
      <div class="ledger-actions"><button type="button" data-action="report">環境債務報告書</button><button type="button" data-action="export-database">全事業所データ</button></div>
      <h3>最近こういうこともありました</h3>
      <div class="memory-list">${recent.length ? recent.map((moment) => `
        <article class="memory-item" data-importance="${moment.importance}"><strong>${escapeHtml(moment.title)}</strong><p>${escapeHtml(moment.line)}</p><time>${new Date(moment.at).toLocaleString("ja-JP")}</time></article>`).join("") : "<p class=empty>まだ記録はありません。</p>"}</div>`;
  }

  private renderProjects(): string {
    const projects = this.persistence.listProjects();
    return `<p class="control-note">Codexの作業ディレクトリごとに、別の森と工場を自動で使います。</p><div class="project-list">${projects.map((project) => `
      <article class="project-item ${project.key === this.world.projectKey ? "is-current" : ""}"><strong>${escapeHtml(project.label)}</strong><span>${project.totalTokens.toLocaleString()} TOK · 設備 ${project.growthLevel + 1}/24</span><small>${project.historyCount}件の記録 · ${project.replayCount}本の動作データ</small></article>`).join("") || "<p class=empty>事業所はまだありません。</p>"}</div>`;
  }

  private renderReplays(): string {
    return `<p class="control-note">動画そのものは保存していません。軽量な動作データから、必要な時だけWebMを生成します。</p><div class="replay-list">${this.world.replays.map((replay) => `
      <article class="replay-item"><strong>${escapeHtml(replay.title)}</strong><span>${replay.totalTokens.toLocaleString()} TOK · ${replay.frames.length} frames · ${replay.wasted ? "未完了" : "完了"}</span><div><button type="button" data-action="replay-video" data-replay="${escapeHtml(replay.id)}">動画化</button><button type="button" data-action="replay-data" data-replay="${escapeHtml(replay.id)}">動作データ</button></div></article>`).join("") || "<p class=empty>完了したタスクの動作データがここへ静かに残ります。</p>"}</div>`;
  }

  private renderEvents(): string {
    const discoveries = Object.values(this.world.discoveries).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    const packs = this.eventPacks.list();
    const enabled = new Set(this.settings.get().enabledEventPacks);
    return `<h3>できごとの記憶</h3><p class="control-note">達成率や未発見数は表示しません。遭遇したものだけを振り返れます。</p>
      <div class="discovery-list">${discoveries.slice(0, 80).map((item) => `<details><summary>${escapeHtml(item.title)} <small>×${item.count}</small></summary><p>${escapeHtml(item.line)}</p></details>`).join("") || "<p class=empty>まだ珍しい出来事はありません。</p>"}</div>
      <h3>イベントパック</h3><div class="pack-list">${packs.map((pack) => `<label><input type="checkbox" data-pack="${escapeHtml(pack.id)}" ${enabled.has(pack.id) ? "checked" : ""}> <strong>${escapeHtml(pack.name)}</strong><small>${escapeHtml(pack.description)}</small></label>`).join("")}</div>
      <button type="button" data-action="import-pack">JSONパックを読み込む</button>`;
  }

  private renderSettings(): string {
    const settings = this.settings.get();
    return `
      <label class="setting-row"><span>遊びの密度</span><select data-setting="attention-mode"><option value="calm" ${selected(settings.attention.mode, "calm")}>Calm</option><option value="balanced" ${selected(settings.attention.mode, "balanced")}>Balanced</option><option value="chaos" ${selected(settings.attention.mode, "chaos")}>Chaos</option></select></label>
      <div class="ledger-actions"><button type="button" data-action="quiet-30">30分寝かせる</button><button type="button" data-action="quiet-clear">休止解除</button></div>
      <label class="setting-row"><span>承認待ち通知</span><input type="checkbox" data-setting="notify-approval" ${settings.attention.notifyApproval ? "checked" : ""}></label>
      <label class="setting-row"><span>完了通知</span><input type="checkbox" data-setting="notify-complete" ${settings.attention.notifyComplete ? "checked" : ""}></label>
      <label class="setting-row"><span>自動起動</span><input type="checkbox" data-setting="autostart" ${settings.autostart ? "checked" : ""}></label>
      <label class="setting-row"><span>外の天気を反映</span><input type="checkbox" data-setting="weather-enabled" ${settings.weather.enabled ? "checked" : ""}></label>
      <label class="setting-row"><span>場所名</span><input type="text" data-setting="weather-label" value="${escapeHtml(settings.weather.label)}"></label>
      <label class="setting-row"><span>緯度</span><input type="number" step="0.0001" data-setting="weather-lat" value="${settings.weather.latitude}"></label>
      <label class="setting-row"><span>経度</span><input type="number" step="0.0001" data-setting="weather-lon" value="${settings.weather.longitude}"></label>
      <button type="button" data-action="apply-weather">天気設定を保存</button>
      <p class="control-note">時刻は常に端末のローカル時刻を使用します。天気は任意で、位置情報権限を使わず入力した座標だけを利用します。</p>
      <h3>リリース前TODO</h3><p class="control-note">コード署名、インストーラー配布、自動更新、セーブデータ移行試験はF3として残しています。</p>`;
  }

  private async handleClick(event: Event): Promise<void> {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!target) return;
    if (target.dataset.action === "close") return this.toggle(false);
    if (target.dataset.tab) { this.activeTab = target.dataset.tab; this.render(true); return; }
    if (target.dataset.action === "report") exportEnvironmentalDebtReport(this.world, this.persistence.listProjects());
    if (target.dataset.action === "export-database") downloadBlob(new Blob([this.persistence.exportDatabase()], { type: "application/json" }), "token-fire-worlds.json");
    if (target.dataset.action === "quiet-30") this.settings.quietFor(30);
    if (target.dataset.action === "quiet-clear") this.settings.update({ attention: { ...this.settings.get().attention, quietUntil: 0 } });
    if (target.dataset.action === "import-pack") this.root.querySelector<HTMLInputElement>(".event-pack-input")?.click();
    if (target.dataset.action === "replay-video" || target.dataset.action === "replay-data") {
      const replay = this.world.replays.find((candidate) => candidate.id === target.dataset.replay);
      if (!replay) return;
      if (target.dataset.action === "replay-video") await exportReplayVideo(replay); else exportReplayData(replay);
    }
    if (target.dataset.action === "apply-weather") this.applyWeatherInputs();
    this.render(true);
  }

  private async handleChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    if (input.dataset.pack) {
      const current = new Set(this.settings.get().enabledEventPacks);
      if ((input as HTMLInputElement).checked) current.add(input.dataset.pack); else current.delete(input.dataset.pack);
      this.settings.update({ enabledEventPacks: [...current] });
    }
    if (input.dataset.setting === "attention-mode") this.settings.update({ attention: { ...this.settings.get().attention, mode: input.value as AppSettings["attention"]["mode"] } });
    if (input.dataset.setting === "notify-approval") this.settings.update({ attention: { ...this.settings.get().attention, notifyApproval: (input as HTMLInputElement).checked } });
    if (input.dataset.setting === "notify-complete") this.settings.update({ attention: { ...this.settings.get().attention, notifyComplete: (input as HTMLInputElement).checked } });
    if (input.dataset.setting === "weather-enabled") this.settings.update({ weather: { ...this.settings.get().weather, enabled: (input as HTMLInputElement).checked } });
    if (input.dataset.setting === "autostart") {
      const enabled = await this.platform.setAutostart((input as HTMLInputElement).checked);
      this.settings.update({ autostart: enabled });
    }
  }

  private applyWeatherInputs(): void {
    const value = (key: string): string => this.root.querySelector<HTMLInputElement>(`[data-setting="${key}"]`)?.value ?? "";
    this.settings.update({ weather: {
      ...this.settings.get().weather,
      label: value("weather-label").slice(0, 80) || "Manual location",
      latitude: Math.max(-90, Math.min(90, Number(value("weather-lat")) || 0)),
      longitude: Math.max(-180, Math.min(180, Number(value("weather-lon")) || 0)),
    } });
  }

  private async importPack(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try { this.eventPacks.import(JSON.parse(await file.text())); this.render(true); }
    catch (error) { window.alert(error instanceof Error ? error.message : "イベントパックを読み込めませんでした"); }
    finally { input.value = ""; }
  }

  private requireElement<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Control center element missing: ${selector}`);
    return element;
  }
}

const metric = (label: string, value: string): string => `<div class="ledger-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
const selected = (value: string, candidate: string): string => value === candidate ? "selected" : "";
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
