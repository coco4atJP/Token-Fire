import type { AgentSnapshot } from "../domain/agent";
import { CHARACTER_IDS } from "../domain/character";
import { getWorldMetrics, type WorldState } from "../domain/world";
import { weatherLabel } from "../application/environmentDirector";

export interface ExperiencePresenter {
  update(world: WorldState, snapshot: AgentSnapshot): void;
  toggleRealityCheck(force?: boolean): void;
}

const formatNumber = (value: number): string => Math.floor(value).toLocaleString("ja-JP");
const COMBUSTION_EVENTS = new Set(["token-burn", "tree-harvest", "coolant-drain", "forge-sneeze", "cinder-feast"]);

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
  private readonly characterBubble: HTMLDivElement;
  private readonly realityDialog: HTMLDivElement;
  private lastEventId = -1;
  private realityVisible = false;

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "experience-layer";
    this.root.innerHTML = `
      <div class="world-atmosphere" aria-hidden="true"><i></i><i></i><i></i></div>
      <section class="phase-hud" aria-live="polite"><div class="phase-hud__title"></div><div class="phase-hud__detail"></div></section>
      <div class="factory-growth" aria-hidden="true"></div>
      <div class="ambient-fireflies" aria-hidden="true">
        ${Array.from({ length: 9 }, (_, index) => {
          const x = (index * 37 + 13) % 92;
          const y = 14 + (index % 4) * 9;
          return `<i style="--x:${x}%;--y:${y}%;--duration:${7 + index * 0.7}s;--delay:${index * -0.9}s"></i>`;
        }).join("")}
      </div>
      <div class="ceremony-confetti" aria-hidden="true">${Array.from({ length: 12 }, (_, index) => `<i style="--x:${8 + index * 7.5}%;--delay:${index * -0.08}s"></i>`).join("")}</div>
      <section class="world-event" aria-live="polite"><div class="world-event__title"></div><div class="world-event__line"></div></section>
      <div class="character-bubble" aria-live="polite"></div>
      <div class="greenwash-stamp" aria-hidden="true">SUSTAINABLE*</div>
      <div class="chill-card"><span class="chill-card__pulse"></span><span class="chill-card__copy">工場と脳を冷却しています</span></div>
      <div class="environmental-debt"></div>
      <section class="reality-check" role="dialog" aria-modal="true" aria-label="Reality Check">
        <button class="reality-check__close" type="button" aria-label="閉じる">×</button>
        <div class="reality-check__eyebrow">REALITY CHECK</div>
        <h2>これは風刺的な破壊ジオラマです。</h2>
        <p>Token-Fireの数値は実測CO₂や水使用量ではありません。Token量・モデル名・Reasoning Effort・並列度から「ちょびっと」「すごくたくさん」など24段階の相対表現を作っています。</p>
        <p>AI推論が実際に計算資源・電力・冷却を必要とする現実を、正確そうな偽数値を出さずに笑って眺めるための表現です。</p>
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
    this.characterBubble = this.requireElement(".character-bubble");
    this.realityDialog = this.requireElement(".reality-check");
    this.requireElement<HTMLButtonElement>(".reality-check__close").addEventListener("click", () => this.toggleRealityCheck(false));
  }

  update(world: WorldState, snapshot: AgentSnapshot): void {
    const metrics = getWorldMetrics(world);
    const event = world.activeEvent;
    const ceremony = event?.type === "greenwash-ceremony" || event?.type === "union-dance" || event?.type === "legendary-zoy";
    const activelyBurning = snapshot.active && (world.combustionPulse > 0.04 || world.tokenQueue > 1 || (event !== null && COMBUSTION_EVENTS.has(event.type)));

    this.root.dataset.phase = snapshot.active ? "destruction" : "chill";
    this.root.dataset.time = world.environment.timePhase;
    this.root.dataset.weather = world.environment.weather;
    this.root.dataset.growth = String(world.growthLevel);
    this.root.style.setProperty("--chill", world.chill.toFixed(3));
    this.root.style.setProperty("--chill-opacity", (0.38 + world.chill * 0.62).toFixed(3));
    this.root.style.setProperty("--firefly-opacity", (world.chill * 0.75).toFixed(3));
    this.root.style.setProperty("--factory-height", `${12 + world.heat * 16}px`);
    this.root.style.setProperty("--growth", (world.growthLevel / 23).toFixed(3));

    const model = snapshot.model ?? world.model ?? "model unknown";
    if (snapshot.status === "error") {
      this.phaseHud.dataset.phase = "error";
      this.phaseTitle.textContent = "TOKEN FORGE · SUNK COST";
      this.phaseDetail.textContent = `成果ゼロ · 焼却済み ${formatNumber(metrics.wastedTokens)} TOK`;
    } else if (event?.type === "greenwash-ceremony") {
      this.phaseHud.dataset.phase = "ceremony";
      this.phaseTitle.textContent = "PROFIT CEREMONY · GREENWASHING";
      this.phaseDetail.textContent = `焼却 ${formatNumber(event.magnitude)} TOK · 苗木一本で相殺済み`;
    } else if (snapshot.active) {
      this.phaseHud.dataset.phase = activelyBurning ? "burning" : "idling";
      this.phaseTitle.textContent = activelyBurning ? "TOKEN FORGE · INCINERATING" : "TOKEN FORGE · AWAITING FUEL";
      this.phaseDetail.textContent = activelyBurning
        ? `${metrics.energyLevel + 1}/24 · ${metrics.energyLabel} · ${model}`
        : `${snapshot.effort.toUpperCase()} · 工場はアイドリング中 · 森林被害なし`;
    } else {
      this.phaseHud.dataset.phase = "chill";
      this.phaseTitle.textContent = "PLANTATION CHILL · REFORESTING";
      const temperature = world.environment.temperatureC === null ? "" : ` · ${Math.round(world.environment.temperatureC)}℃`;
      this.phaseDetail.textContent = `CHILL ${metrics.chillPercent}% · ${weatherLabel(world.environment.weather)}${temperature} · WATER ${metrics.waterPercent}%`;
    }

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
      this.stamp.classList.toggle("is-visible", event.type === "greenwash-ceremony");
      this.root.classList.toggle("has-ceremony", ceremony);
      this.lastEventId = event.id;
    } else {
      delete this.root.dataset.event;
      this.eventCard.classList.remove("is-visible", "is-entering");
      this.stamp.classList.remove("is-visible");
      this.root.classList.remove("has-ceremony");
    }

    const speaker = CHARACTER_IDS
      .map((id) => world.characters[id])
      .filter((state) => state.line && state.until > world.elapsed)
      .sort((a, b) => b.until - a.until)[0];
    if (speaker?.line) {
      this.characterBubble.dataset.character = speaker.id;
      this.characterBubble.textContent = speaker.line;
      this.characterBubble.classList.add("is-visible");
    } else {
      this.characterBubble.classList.remove("is-visible");
    }

    this.chillCard.classList.toggle("is-visible", !snapshot.active && !ceremony && world.chill > 0.18);
    if (!snapshot.active) {
      const messages = ["工場と脳を冷却しています", "次回燃焼分を静かに植林中", "雨音のあいだだけ、認知負荷を下げます", "かわいい作業員が森林在庫を補充中"];
      const copy = this.chillCard.querySelector<HTMLElement>(".chill-card__copy");
      if (copy) copy.textContent = messages[Math.floor(world.elapsed / 12) % messages.length];
    }

    this.debtStrip.textContent = snapshot.active
      ? `${world.projectLabel} · ${formatNumber(metrics.totalTokensBurned)} TOK · 設備 ${metrics.growthLevel + 1}/24`
      : `${world.projectLabel} · CHILL ${metrics.chillPercent}% · WASTED ${formatNumber(metrics.wastedTokens)} TOK`;

    const moduleCount = Math.max(1, Math.min(12, 1 + Math.floor(world.growthLevel / 2)));
    if (this.factory.childElementCount !== moduleCount) {
      this.factory.replaceChildren(...Array.from({ length: moduleCount }, (_, index) => {
        const module = document.createElement("i");
        module.dataset.module = String(index % 4);
        return module;
      }));
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
