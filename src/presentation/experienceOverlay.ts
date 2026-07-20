import type { AgentSnapshot } from "../domain/agent";
import { getWorldMetrics, type WorldState } from "../domain/world";

export interface ExperiencePresenter {
  update(world: WorldState, snapshot: AgentSnapshot): void;
  toggleRealityCheck(force?: boolean): void;
}

const formatNumber = (value: number): string => Math.floor(value).toLocaleString("ja-JP");

export class TokenFireExperienceOverlay implements ExperiencePresenter {
  private readonly root: HTMLDivElement;
  private readonly phaseHud: HTMLDivElement;
  private readonly phaseTitle: HTMLDivElement;
  private readonly phaseDetail: HTMLDivElement;
  private readonly eventCard: HTMLDivElement;
  private readonly eventTitle: HTMLDivElement;
  private readonly eventLine: HTMLDivElement;
  private readonly debtStrip: HTMLDivElement;
  private readonly chillCard: HTMLDivElement;
  private readonly stamp: HTMLDivElement;
  private readonly factory: HTMLDivElement;
  private readonly realityDialog: HTMLDivElement;
  private lastEventId = -1;
  private realityVisible = false;

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "experience-layer";
    this.root.innerHTML = `
      <section class="phase-hud" aria-live="polite">
        <div class="phase-hud__title"></div>
        <div class="phase-hud__detail"></div>
      </section>
      <div class="factory-growth" aria-hidden="true"></div>
      <div class="ambient-fireflies" aria-hidden="true">
        ${Array.from({ length: 9 }, (_, index) => {
          const x = (index * 37 + 13) % 92;
          const y = 14 + (index % 4) * 9;
          return `<i style="--x:${x}%;--y:${y}%;--duration:${7 + index * 0.7}s;--delay:${index * -0.9}s"></i>`;
        }).join("")}
      </div>
      <div class="ceremony-confetti" aria-hidden="true">
        ${Array.from({ length: 12 }, (_, index) => `<i style="--x:${8 + index * 7.5}%;--delay:${index * -0.08}s"></i>`).join("")}
      </div>
      <section class="world-event" aria-live="polite">
        <div class="world-event__title"></div>
        <div class="world-event__line"></div>
      </section>
      <div class="greenwash-stamp" aria-hidden="true">SUSTAINABLE*</div>
      <div class="chill-card">
        <span class="chill-card__pulse"></span>
        <span class="chill-card__copy">工場と脳を冷却しています</span>
      </div>
      <div class="environmental-debt"></div>
      <section class="reality-check" role="dialog" aria-modal="true" aria-label="Reality Check">
        <button class="reality-check__close" type="button" aria-label="閉じる">×</button>
        <div class="reality-check__eyebrow">REALITY CHECK</div>
        <h2>これは風刺的な破壊ジオラマです。</h2>
        <p>Token-Fireの数値は実測CO₂や水使用量ではありません。ただし、AI推論が実際に計算資源・電力・冷却を必要とし、長いReasoningや大量Tokenほど一般に計算量が増える、という現実を笑って眺めるための表現です。</p>
        <p class="reality-check__fine">キャラクターは可愛く、事業判断は非情です。</p>
      </section>
    `;
    host.append(this.root);

    this.phaseHud = this.requireElement(".phase-hud");
    this.phaseTitle = this.requireElement(".phase-hud__title");
    this.phaseDetail = this.requireElement(".phase-hud__detail");
    this.eventCard = this.requireElement(".world-event");
    this.eventTitle = this.requireElement(".world-event__title");
    this.eventLine = this.requireElement(".world-event__line");
    this.debtStrip = this.requireElement(".environmental-debt");
    this.chillCard = this.requireElement(".chill-card");
    this.stamp = this.requireElement(".greenwash-stamp");
    this.factory = this.requireElement(".factory-growth");
    this.realityDialog = this.requireElement(".reality-check");
    this.requireElement<HTMLButtonElement>(".reality-check__close").addEventListener("click", () => {
      this.toggleRealityCheck(false);
    });
  }

  update(world: WorldState, snapshot: AgentSnapshot): void {
    const metrics = getWorldMetrics(world);
    const activelyBurning = snapshot.active && (world.combustionPulse > 0.04 || world.tokenQueue > 1);
    this.root.dataset.phase = snapshot.active ? "destruction" : "chill";
    this.root.style.setProperty("--chill", world.chill.toFixed(3));
    this.root.style.setProperty("--chill-opacity", (0.38 + world.chill * 0.62).toFixed(3));
    this.root.style.setProperty("--firefly-opacity", (world.chill * 0.75).toFixed(3));
    this.root.style.setProperty("--factory-height", `${12 + world.heat * 16}px`);

    this.phaseHud.dataset.phase = snapshot.status === "error" ? "error" : snapshot.active ? (activelyBurning ? "burning" : "idling") : "chill";
    if (snapshot.status === "error") {
      this.phaseTitle.textContent = "TOKEN FORGE · SUNK COST";
      this.phaseDetail.textContent = `成果ゼロ · 焼却済み ${formatNumber(metrics.wastedTokens)} TOK`;
    } else if (snapshot.active) {
      this.phaseTitle.textContent = activelyBurning ? "TOKEN FORGE · INCINERATING" : "TOKEN FORGE · AWAITING FUEL";
      this.phaseDetail.textContent = activelyBurning
        ? `${snapshot.effort.toUpperCase()} · ${Math.max(1, snapshot.activeSessions)} AGENT · QUEUE ${formatNumber(world.tokenQueue)} TOK`
        : `${snapshot.effort.toUpperCase()} · 工場はアイドリング中 · 森林被害なし`;
    } else {
      this.phaseTitle.textContent = "PLANTATION CHILL · REFORESTING";
      this.phaseDetail.textContent = `CHILL ${metrics.chillPercent}% · RAIN ${Math.round(world.rain * 100)}% · WATER ${metrics.waterPercent}%`;
    }

    const event = world.activeEvent;
    if (event) {
      this.root.dataset.event = event.type;
      this.eventCard.classList.add("is-visible");
      this.eventCard.dataset.tone = event.tone;
      this.eventTitle.textContent = event.title;
      this.eventLine.textContent = event.line;
      if (event.id !== this.lastEventId) {
        this.eventCard.classList.remove("is-entering");
        void this.eventCard.offsetWidth;
        this.eventCard.classList.add("is-entering");
      }
      const ceremony = event.type === "greenwash-ceremony" || event.type === "union-dance" || event.type === "legendary-zoy";
      this.stamp.classList.toggle("is-visible", event.type === "greenwash-ceremony");
      this.root.classList.toggle("has-ceremony", ceremony);
      this.lastEventId = event.id;
    } else {
      delete this.root.dataset.event;
      this.eventCard.classList.remove("is-visible", "is-entering");
      this.stamp.classList.remove("is-visible");
      this.root.classList.remove("has-ceremony");
    }

    this.chillCard.classList.toggle("is-visible", !snapshot.active && world.chill > 0.18);
    if (!snapshot.active) {
      const messages = [
        "工場と脳を冷却しています",
        "次回燃焼分を静かに植林中",
        "雨音のあいだだけ、認知負荷を下げます",
        "かわいい作業員が森林在庫を補充中",
      ];
      const index = Math.floor(world.elapsed / 12) % messages.length;
      const copy = this.chillCard.querySelector<HTMLElement>(".chill-card__copy");
      if (copy) copy.textContent = messages[index];
    }

    this.debtStrip.textContent = snapshot.active
      ? `INCINERATED ${formatNumber(metrics.totalTokensBurned)} TOK · DEBT ${formatNumber(metrics.destructionScore)} · TIER ${metrics.factoryTier}`
      : `CHILL ${metrics.chillPercent}% · FOREST STOCK ${metrics.livingTrees} · WASTED ${formatNumber(metrics.wastedTokens)} TOK`;

    const chimneyCount = Math.max(1, Math.min(5, world.factoryTier));
    if (this.factory.childElementCount !== chimneyCount) {
      this.factory.replaceChildren(...Array.from({ length: chimneyCount }, () => document.createElement("i")));
    }
    this.factory.classList.toggle("is-active", snapshot.active);
  }

  toggleRealityCheck(force?: boolean): void {
    this.realityVisible = force ?? !this.realityVisible;
    this.realityDialog.classList.toggle("is-visible", this.realityVisible);
  }

  private requireElement<T extends HTMLElement = HTMLDivElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Experience overlay element is missing: ${selector}`);
    return element;
  }
}
