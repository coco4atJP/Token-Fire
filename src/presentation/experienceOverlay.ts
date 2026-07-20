import type { AgentSnapshot } from "../domain/agent";
import { getWorldMetrics, type WorldState } from "../domain/world";

export interface ExperiencePresenter {
  update(world: WorldState, snapshot: AgentSnapshot): void;
  toggleRealityCheck(force?: boolean): void;
}

const formatNumber = (value: number): string => Math.floor(value).toLocaleString("ja-JP");

export class TokenFireExperienceOverlay implements ExperiencePresenter {
  private readonly root: HTMLDivElement;
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
      <div class="factory-growth" aria-hidden="true"></div>
      <div class="ambient-fireflies" aria-hidden="true">
        ${Array.from({ length: 9 }, (_, index) => `<i style="--i:${index}"></i>`).join("")}
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
    this.root.dataset.phase = snapshot.active ? "destruction" : "chill";
    this.root.style.setProperty("--chill", world.chill.toFixed(3));
    this.root.style.setProperty("--heat", world.heat.toFixed(3));

    const event = world.activeEvent;
    if (event) {
      this.eventCard.classList.add("is-visible");
      this.eventCard.dataset.tone = event.tone;
      this.eventTitle.textContent = event.title;
      this.eventLine.textContent = event.line;
      if (event.id !== this.lastEventId) {
        this.eventCard.classList.remove("is-entering");
        void this.eventCard.offsetWidth;
        this.eventCard.classList.add("is-entering");
      }
      this.stamp.classList.toggle("is-visible", event.type === "greenwash-ceremony");
      this.lastEventId = event.id;
    } else {
      this.eventCard.classList.remove("is-visible", "is-entering");
      this.stamp.classList.remove("is-visible");
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
