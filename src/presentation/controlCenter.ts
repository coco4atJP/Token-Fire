import type { AgentSnapshot } from "../domain/agent";
import type { EventPackRegistry } from "../domain/eventPack";
import type { AppSettings } from "../domain/experienceData";
import { getWorldMetrics, type WorldState } from "../domain/world";
import type { PlatformBridge } from "../infrastructure/platformBridge";
import type { SettingsStore } from "../infrastructure/settingsStore";
import type { WorldPersistence } from "../infrastructure/worldPersistence";
import { downloadBlob, exportReplayData, exportReplayVideo, renderReplayThumbnail } from "./replayExporter";
import { exportEnvironmentalDebtReport } from "./reportGenerator";
import { trapTabKey } from "./focusTrap";

const FACTORY_ACTS = ["小さな町工場", "増設開始", "配管迷宮", "煙突群", "過剰設備", "説明をあきらめる規模"] as const;

export class ControlCenter {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly kicker: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly modalBackground: HTMLElement[];
  private open = false;
  private activeTab = "ledger";
  private surface: "ledger" | "settings" = "ledger";
  private lastFocused: HTMLElement | null = null;
  private lastRenderAt = 0;
  private world: WorldState;
  private snapshot: AgentSnapshot;
  private readonly replayThumbnailCache = new Map<string, Promise<string | null>>();

  constructor(
    host: HTMLElement,
    initialWorld: WorldState,
    initialSnapshot: AgentSnapshot,
    private readonly persistence: WorldPersistence,
    private readonly settings: SettingsStore,
    private readonly eventPacks: EventPackRegistry,
    private readonly platform: PlatformBridge,
    private readonly onModalChange: (open: boolean) => void = () => {},
    private readonly onReplayPlayIntro: () => void = () => {},
  ) {
    this.world = initialWorld;
    this.snapshot = initialSnapshot;
    this.root = document.createElement("section");
    this.root.className = "control-center";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-labelledby", "control-center-title");
    this.root.hidden = true;
    setInert(this.root, true);
    this.root.innerHTML = `
      <header class="control-center__header">
        <div class="control-center__title"><span class="control-center__kicker" aria-hidden="true">HIBANA WORKS · COMPANY LEDGER</span><strong id="control-center-title" tabindex="-1">ひばな工房 つけ帳</strong></div>
        <button type="button" data-action="close" aria-label="閉じる">×</button>
      </header>
      <nav class="control-center__tabs" role="tablist" aria-label="つけ帳のページ">
        <button type="button" role="tab" aria-controls="control-center-panel" data-tab="ledger">伝票</button><button type="button" role="tab" aria-controls="control-center-panel" data-tab="projects">台帳</button>
        <button type="button" role="tab" aria-controls="control-center-panel" data-tab="replays">映写券</button><button type="button" role="tab" aria-controls="control-center-panel" data-tab="events">切り抜き</button>
      </nav>
      <div id="control-center-panel" class="control-center__body" role="tabpanel"></div>
      <input class="event-pack-input" type="file" accept="application/json,.json" hidden>
    `;
    this.modalBackground = Array.from(host.children).filter((element): element is HTMLElement => element instanceof HTMLElement);
    host.append(this.root);
    this.body = this.requireElement<HTMLElement>(".control-center__body");
    this.heading = this.requireElement<HTMLElement>("#control-center-title");
    this.kicker = this.requireElement<HTMLElement>(".control-center__kicker");
    this.tabs = this.requireElement<HTMLElement>(".control-center__tabs");
    this.root.addEventListener("click", (event) => void this.handleClick(event));
    this.root.addEventListener("change", (event) => void this.handleChange(event));
    this.root.querySelector<HTMLInputElement>(".event-pack-input")?.addEventListener("change", (event) => void this.importPack(event));
    this.tabs.addEventListener("keydown", (event) => this.handleTabKey(event));
    this.root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.toggle(false);
      } else trapTabKey(this.root, event);
    });
  }

  toggle(force?: boolean, surface: "ledger" | "settings" = "ledger"): void {
    const nextOpen = force ?? !this.open;
    if (nextOpen && this.open && surface !== this.surface) {
      this.surface = surface;
      this.activeTab = surface === "settings" ? "settings" : "ledger";
      this.applySurfaceCopy();
      this.render(true);
      return;
    }
    if (nextOpen === this.open) return;
    this.open = nextOpen;
    this.surface = surface;
    this.activeTab = surface === "settings" ? "settings" : "ledger";
    this.root.classList.toggle("is-open", this.open);
    this.applySurfaceCopy();
    if (this.open) {
      this.lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.root.hidden = false;
      setInert(this.root, false);
      for (const element of this.modalBackground) setInert(element, true);
      this.onModalChange(true);
      this.render(true);
      this.heading.focus();
      return;
    }
    this.root.hidden = true;
    setInert(this.root, true);
    for (const element of this.modalBackground) setInert(element, false);
    this.onModalChange(false);
    this.lastFocused?.focus();
    this.lastFocused = null;
  }

  openSettings(): void {
    this.toggle(true, "settings");
  }

  private applySurfaceCopy(): void {
    this.root.dataset.surface = this.surface;
    this.tabs.hidden = this.surface === "settings";
    this.heading.textContent = this.surface === "settings" ? "劇場外の操作卓" : "ひばな工房 つけ帳";
    this.kicker.textContent = this.surface === "settings" ? "OUTSIDE THE STAGE" : "COMPANY LEDGER";
  }

  update(world: WorldState, snapshot: AgentSnapshot): void {
    this.world = world;
    this.snapshot = snapshot;
    if (this.open && performance.now() - this.lastRenderAt > 1_000) this.render(false);
  }

  private render(force: boolean): void {
    this.lastRenderAt = performance.now();
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
      const selectedTab = button.dataset.tab === this.activeTab;
      button.setAttribute("aria-selected", String(selectedTab));
      button.tabIndex = selectedTab ? 0 : -1;
    }
    if (!force && this.body.matches(":focus-within")) return;
    const previousScrollTop = force ? 0 : this.body.scrollTop;
    const renderers: Record<string, () => string> = {
      ledger: () => this.renderLedger(), projects: () => this.renderProjects(), replays: () => this.renderReplays(), events: () => this.renderEvents(), settings: () => this.renderSettings(),
    };
    this.body.innerHTML = (renderers[this.activeTab] ?? renderers.ledger)();
    if (!force) this.body.scrollTop = previousScrollTop;
    if (this.activeTab === "replays") void this.hydrateReplayThumbnails();
  }

  private renderLedger(): string {
    const metrics = getWorldMetrics(this.world);
    const recent = this.world.history.slice(0, 18);
    const model = this.snapshot.model ?? this.world.model ?? "未取得";
    return `
      <div class="ledger-metrics receipt-grid">
        ${metric("焼却Token", metrics.totalTokensBurned.toLocaleString(), "ledger-metric--primary")}${metric("ふわっとした多さ", metrics.energyLabel)}
        ${metric("設備", `${metrics.growthLevel + 1}/24`)}${metric("成果ゼロ", metrics.wastedTokens.toLocaleString())}${metric("現在モデル", model, "ledger-metric--model")}
      </div>
      <div class="ledger-actions"><button type="button" data-action="report">環境債務報告書</button><button type="button" data-action="export-database">全事業所データ</button></div>
      <h3>操業伝票 · 最近こういうこともありました</h3>
      <div class="memory-list">${recent.length ? recent.map((moment) => `
        <article class="memory-item receipt-slip" data-importance="${moment.importance}"><strong>${escapeHtml(moment.title)}</strong><p>${escapeHtml(moment.line)}</p><time>${new Date(moment.at).toLocaleString("ja-JP")}</time></article>`).join("") : "<p class=empty>まだ伝票はありません。</p>"}</div>`;
  }

  private renderProjects(): string {
    const projects = this.persistence.listProjects();
    return `<p class="control-note">Codexの作業ディレクトリごとに、別の森と工場を自動で使います。</p><div class="project-list">${projects.map((project) => {
      const act = factoryAct(project.growthLevel);
      return `<article class="project-item ledger-entry ${project.key === this.world.projectKey ? "is-current" : ""}"><strong>${escapeHtml(project.label)}</strong><span>${project.totalTokens.toLocaleString()} TOK · 設備 ${project.growthLevel + 1}/24</span><b>ACT ${act.index} · ${act.label}</b><small>${project.historyCount}件の記録 · ${project.replayCount}本の映写記録</small></article>`;
    }).join("") || "<p class=empty>事業所はまだありません。</p>"}</div>`;
  }

  private renderReplays(): string {
    return `<p class="control-note">動画やサムネイルは保存しません。帳簿を開いた時だけ代表場面を現像し、明示した時だけ映写します。</p><div class="replay-list">${this.world.replays.map((replay) => `
      <article class="replay-item projection-ticket"><button class="projection-ticket__preview" type="button" data-action="replay-video" data-replay="${escapeHtml(replay.id)}" aria-label="${escapeHtml(replay.title)}を映写する"><span class="replay-thumbnail" data-replay-thumbnail="${escapeHtml(replay.id)}" aria-busy="true">代表場面を現像中…</span><b>映写する</b></button><div class="projection-ticket__copy"><strong>${escapeHtml(replay.title)}</strong><span>${replay.totalTokens.toLocaleString()} TOK · ${replay.frames.length} frames · ${replay.wasted ? "未完了" : "完了"}</span><button type="button" data-action="replay-data" data-replay="${escapeHtml(replay.id)}">動作データ</button></div></article>`).join("") || "<p class=empty>完了したタスクの動作データがここへ静かに残ります。</p>"}</div>`;
  }

  private renderEvents(): string {
    const discoveries = Object.values(this.world.discoveries).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    const packs = this.eventPacks.list();
    const enabled = new Set(this.settings.get().enabledEventPacks);
    return `<h3>できごとの記憶</h3><p class="control-note">達成率や未発見数は表示しません。遭遇したものだけを振り返れます。</p>
      <div class="discovery-list clipping-list">${discoveries.slice(0, 80).map((item) => `<details class="newspaper-clipping"><summary>${escapeHtml(item.title)} <small>×${item.count}</small></summary><p>${escapeHtml(item.line)}</p></details>`).join("") || "<p class=empty>まだ珍しい出来事はありません。</p>"}</div>
      <h3>イベントパック</h3><div class="pack-list">${packs.map((pack) => `<label><input type="checkbox" data-pack="${escapeHtml(pack.id)}" ${enabled.has(pack.id) ? "checked" : ""}> <strong>${escapeHtml(pack.name)}</strong><small>${escapeHtml(pack.description)}</small></label>`).join("")}</div>
      <button type="button" data-action="import-pack">JSONパックを読み込む</button>`;
  }

  private renderSettings(): string {
    const settings = this.settings.get();
    return `
      <section class="settings-group">
        <h3>注意と休止</h3>
        <label class="setting-row"><span>遊びの密度</span><select data-setting="attention-mode"><option value="calm" ${selected(settings.attention.mode, "calm")}>Calm</option><option value="balanced" ${selected(settings.attention.mode, "balanced")}>Balanced</option><option value="chaos" ${selected(settings.attention.mode, "chaos")}>Chaos</option></select></label>
        <div class="ledger-actions"><button type="button" data-action="quiet-30">30分寝かせる</button><button type="button" data-action="quiet-clear">休止解除</button></div>
        <label class="setting-row"><span>明滅を減らす</span><input type="checkbox" data-setting="reduce-flash" ${settings.attention.reduceFlash ? "checked" : ""}></label>
      </section>
      <section class="settings-group">
        <h3>通知と常駐</h3>
        <label class="setting-row"><span>承認待ち通知</span><input type="checkbox" data-setting="notify-approval" ${settings.attention.notifyApproval ? "checked" : ""}></label>
        <label class="setting-row"><span>完了通知</span><input type="checkbox" data-setting="notify-complete" ${settings.attention.notifyComplete ? "checked" : ""}></label>
        <label class="setting-row"><span>自動起動</span><input type="checkbox" data-setting="autostart" ${settings.autostart ? "checked" : ""}></label>
      </section>
      <section class="settings-group">
        <h3>外の天気</h3>
        <label class="setting-row"><span>舞台へ反映</span><input type="checkbox" data-setting="weather-enabled" ${settings.weather.enabled ? "checked" : ""}></label>
        <label class="setting-row"><span>場所名</span><input type="text" data-setting="weather-label" value="${escapeHtml(settings.weather.label)}"></label>
        <div class="setting-coordinates">
          <label class="setting-row"><span>緯度</span><input type="number" step="0.0001" data-setting="weather-lat" value="${settings.weather.latitude}"></label>
          <label class="setting-row"><span>経度</span><input type="number" step="0.0001" data-setting="weather-lon" value="${settings.weather.longitude}"></label>
        </div>
        <button type="button" data-action="apply-weather">天気設定を保存</button>
        <p class="control-note">時刻は端末のローカル時刻を使用します。位置情報権限は使わず、入力した座標だけを利用します。</p>
      </section>
      <section class="settings-group settings-group--last">
        <h3>操作</h3>
        <button type="button" data-action="play-intro">開業説明をもう一度見る</button>
      </section>`;
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
    if (target.dataset.action === "play-intro") {
      this.toggle(false);
      this.onReplayPlayIntro();
      return;
    }
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
    if (input.dataset.setting === "reduce-flash") this.settings.update({ attention: { ...this.settings.get().attention, reduceFlash: (input as HTMLInputElement).checked } });
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

  private handleTabKey(event: KeyboardEvent): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const tabs = Array.from(this.tabs.querySelectorAll<HTMLButtonElement>("[role=tab]"));
    const current = Math.max(0, tabs.findIndex((tab) => tab.dataset.tab === this.activeTab));
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(current + direction + tabs.length) % tabs.length];
    if (!next) return;
    event.preventDefault();
    this.activeTab = next.dataset.tab ?? "ledger";
    this.render(true);
    next.focus();
  }

  private async hydrateReplayThumbnails(): Promise<void> {
    const slots = Array.from(this.body.querySelectorAll<HTMLElement>("[data-replay-thumbnail]"));
    // WebViewのWebGL context上限を守るため、24件あっても一つずつ現像する。
    for (const slot of slots) {
      if (!slot.isConnected || !this.open || this.activeTab !== "replays") break;
      const id = slot.dataset.replayThumbnail;
      const replay = this.world.replays.find((candidate) => candidate.id === id);
      if (!id || !replay) continue;
      let pending = this.replayThumbnailCache.get(id);
      if (!pending) {
        pending = renderReplayThumbnail(replay);
        this.replayThumbnailCache.set(id, pending);
      }
      const source = await pending;
      if (!slot.isConnected || slot.dataset.replayThumbnail !== id) continue;
      slot.setAttribute("aria-busy", "false");
      if (!source) {
        slot.textContent = "代表場面を現像できませんでした";
        continue;
      }
      const image = document.createElement("img");
      image.src = source;
      image.alt = `${replay.title}の代表場面`;
      image.draggable = false;
      slot.replaceChildren(image);
    }
  }

  private requireElement<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Control center element missing: ${selector}`);
    return element;
  }
}

const metric = (label: string, value: string, className = ""): string => `<div class="ledger-metric ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
export const factoryAct = (growthLevel: number): { index: number; label: string } => {
  const index = Math.max(0, Math.min(5, Math.floor(growthLevel / 4)));
  return { index: index + 1, label: FACTORY_ACTS[index] };
};
const selected = (value: string, candidate: string): string => value === candidate ? "selected" : "";
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
const setInert = (element: HTMLElement, inert: boolean): void => {
  element.inert = inert;
  element.toggleAttribute("inert", inert);
};
