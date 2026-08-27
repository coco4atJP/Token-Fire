import type { AgentSnapshot } from "../domain/agent";
import type { PresentationContext } from "../application/presentationContext";
import { CHARACTER_IDS, CHARACTER_LABELS, type CharacterId } from "../domain/character";
import { getWorldMetrics, type WorldState } from "../domain/world";
import { readWorldScene, WORLD_SCENE_LABELS } from "../domain/worldScene";
import { SCENE_LAYOUT, type ActorPlacement } from "./sceneLayout";
import { SceneLayout } from "./stageLayout";
import { trapTabKey } from "./focusTrap";

export interface ExperiencePresenter {
  update(world: WorldState, snapshot: AgentSnapshot, context?: PresentationContext): void;
  toggleRealityCheck(force?: boolean): void;
}

/**
 * 高解像度の文字、読み上げ、Soto Noteを担当するDOM表現。
 * 世界の場面判定はdomainのWorldSceneを受け取り、ここでは再定義しない。
 */
export class TokenFireExperienceOverlay implements ExperiencePresenter {
  private readonly root: HTMLDivElement;
  private readonly announcer: HTMLDivElement;
  private readonly ticker: HTMLElement;
  private readonly tickerTitle: HTMLElement;
  private readonly tickerLine: HTMLElement;
  private readonly tickerSignal: HTMLElement;
  private readonly stageSummary: HTMLElement;
  private readonly speech: HTMLElement;
  private readonly speechName: HTMLElement;
  private readonly speechLine: HTMLElement;
  private readonly ceremonyStamp: HTMLElement;
  private readonly realityDialog: HTMLElement;
  private readonly realityHeading: HTMLHeadingElement;
  private readonly modalBackground: HTMLElement[];
  private lastAnnouncement = "";
  private lastFocused: HTMLElement | null = null;
  private realityVisible = false;
  private connectionLabel = "WAITING FOR CODEX";

  constructor(
    host: HTMLElement,
    private readonly onModalChange: (open: boolean) => void = () => {},
  ) {
    this.root = document.createElement("div");
    this.root.className = "experience-layer";
    this.root.innerHTML = `
      <div class="sr-announcer" role="status" aria-live="polite" aria-atomic="true"></div>
      <p class="stage-summary"></p>
      <div class="stage-copy" aria-hidden="true">
        <section class="stage-ticker" aria-label="操業札">
          <img src="/assets/token-fire/generated/ui/operating-placard-128.png" alt="" draggable="false">
          <div class="stage-ticker__copy">
            <strong></strong><span></span><small></small>
          </div>
        </section>
        <aside class="character-speech" hidden>
          <b></b><span></span>
        </aside>
        <div class="ceremony-stamp" hidden><span>HIBANA WORKS</span><strong>SUSTAINABLE*</strong></div>
      </div>
      <section class="reality-check" role="dialog" aria-modal="true" aria-labelledby="reality-check-title" hidden inert>
        <button class="reality-check__close" type="button" aria-label="Soto Noteを閉じる">×</button>
        <div class="reality-check__eyebrow">SOTO NOTE · REALITY CHECK</div>
        <h2 id="reality-check-title" tabindex="-1">これは風刺的な破壊パペット劇です。</h2>
        <p>Token-Fireの数値は実測CO₂や水使用量ではありません。Token量・モデル名・Reasoning Effort・並列度から、24段階のふわっとした相対表現を作っています。</p>
        <p>AI推論が実際に計算資源・電力・冷却を必要とする現実を、正確そうな偽数値を出さずに笑って眺めるための表現です。</p>
        <p class="reality-check__fine">キャラクターは可愛く、事業判断は非情です。</p>
      </section>
    `;
    this.modalBackground = Array.from(host.children).filter((element): element is HTMLElement => element instanceof HTMLElement);
    host.append(this.root);
    this.announcer = this.requireElement(".sr-announcer");
    this.stageSummary = this.requireElement(".stage-summary");
    this.ticker = this.requireElement(".stage-ticker");
    this.tickerTitle = this.requireElement(".stage-ticker strong");
    this.tickerLine = this.requireElement(".stage-ticker span");
    this.tickerSignal = this.requireElement(".stage-ticker small");
    this.speech = this.requireElement(".character-speech");
    this.speechName = this.requireElement(".character-speech b");
    this.speechLine = this.requireElement(".character-speech span");
    this.ceremonyStamp = this.requireElement(".ceremony-stamp");
    this.realityDialog = this.requireElement(".reality-check");
    setInert(this.realityDialog, true);
    this.realityHeading = this.requireElement("#reality-check-title");
    this.requireElement<HTMLButtonElement>(".reality-check__close").addEventListener("click", () => this.toggleRealityCheck(false));
    this.realityDialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.toggleRealityCheck(false);
      else trapTabKey(this.realityDialog, event);
    });
  }

  setConnectionLabel(label: string): void {
    this.connectionLabel = formatConnectionLabel(label);
    this.tickerSignal.textContent = this.connectionLabel;
  }

  update(world: WorldState, snapshot: AgentSnapshot, context?: PresentationContext): void {
    const event = world.activeEvent;
    const scene = readWorldScene(world, snapshot);
    const metrics = getWorldMetrics(world);
    const speaker = CHARACTER_IDS
      .map((id) => world.characters[id])
      .filter((state) => state.line && state.until > world.elapsed)
      .sort((left, right) => right.until - left.until)[0];
    this.root.dataset.scene = scene;
    const quiet = context?.quiet ?? false;
    const placard = readPlacardCopy(scene, snapshot, quiet, event);
    const compact = this.root.closest<HTMLElement>(".shell")?.dataset.layout === "compact";
    this.ticker.dataset.tone = placard.tone;
    this.ticker.dataset.sceneLabel = scene.replace("-", " ").toUpperCase();
    this.tickerTitle.textContent = compact ? compactPlacardTitle(scene) : placard.title;
    const defaultLine = snapshot.active
      ? `${snapshot.effort.toUpperCase()} · A${Math.max(1, snapshot.activeSessions)} · +${snapshot.tokenDelta} TOK`
      : `RAIN${Math.round(world.rain * 100)} · H2O${metrics.waterPercent} · T${metrics.livingTrees}`;
    this.tickerLine.textContent = compact
      ? compactPlacardLine(scene, snapshot, quiet, event, defaultLine)
      : fitPlacardLine(placard.line ?? defaultLine);
    this.tickerSignal.textContent = this.connectionLabel;
    this.ceremonyStamp.hidden = scene !== "kirari";
    this.updateSpeech(world, snapshot, scene === "zero-output" || scene === "approval" ? null : speaker?.id ?? null);
    const lineStopped = scene === "approval" || scene === "zero-output";
    this.stageSummary.textContent = `${WORLD_SCENE_LABELS[scene]}。接続 ${this.connectionLabel}。生木${metrics.livingTrees}本。炉は${snapshot.active && !lineStopped ? "稼働" : "停止"}。雨${Math.round(world.rain * 100)}%。${Math.max(0, snapshot.activeSessions)} Agent。`;
    const important = scene === "approval" || snapshot.status === "error" || snapshot.status === "completed";
    const message = scene === "approval"
      ? "承認待ちです。工場が経営者の判断を待っています。"
      : snapshot.status === "error"
        ? `エラーです。${event?.line ?? "処理が停止しました。"}`
        : snapshot.status === "completed"
          ? `完了しました。${event?.line ?? "回復舞台へ移ります。"}`
          : event
            ? `${event.title}。${event.line}`
            : speaker?.line
              ? `${CHARACTER_LABELS[speaker.id]}。${speaker.line}`
              : "";
    if (message && message !== this.lastAnnouncement) {
      this.announcer.setAttribute("aria-live", important ? "assertive" : "polite");
      this.announcer.textContent = message;
      this.lastAnnouncement = message;
    } else if (!message && this.lastAnnouncement) {
      // 同じ重要状態が後で再発した時もDOM mutationを起こして読み上げられるよう戻す。
      this.announcer.textContent = "";
      this.lastAnnouncement = "";
    }
  }

  private updateSpeech(world: WorldState, snapshot: AgentSnapshot, id: CharacterId | null): void {
    if (!id) {
      this.speech.hidden = true;
      return;
    }
    const state = world.characters[id];
    const placement = this.characterPlacement(id, world, snapshot.active || snapshot.status === "error");
    if (!state.line || !placement) {
      this.speech.hidden = true;
      return;
    }
    const layout = SceneLayout.measure(this.root);
    const anchor = layout.project({
      x: Math.max(76, Math.min(244, placement.x)),
      y: Math.max(48, placement.y - placement.height + 3),
    });
    this.speech.style.left = `${anchor.x}px`;
    this.speech.style.top = `${anchor.y}px`;
    this.speech.dataset.character = id;
    this.speechName.textContent = CHARACTER_LABELS[id];
    this.speechLine.textContent = state.line;
    this.speech.hidden = false;
  }

  private characterPlacement(id: CharacterId, world: WorldState, active: boolean): ActorPlacement | null {
    if (active) {
      if (id === "hinoko" || id === "sumi" || id === "mizumo") return SCENE_LAYOUT.active[id];
      if (id === "kururi") {
        const route = SCENE_LAYOUT.active.cart.maxX - SCENE_LAYOUT.active.cart.minX;
        const phase = (world.elapsed * 6.1) % (route * 2);
        const cartX = SCENE_LAYOUT.active.cart.minX + (phase <= route ? phase : route * 2 - phase);
        return { ...SCENE_LAYOUT.active.kururi, x: cartX + (phase <= route ? 31 : -13) };
      }
      return null;
    }
    if (id === "fuwame") return { ...SCENE_LAYOUT.recovery.fuwame, x: SCENE_LAYOUT.recovery.fuwame.x + world.interaction.fuwameOffsetX };
    if (id === "sumi") return SCENE_LAYOUT.recovery.sleepingSumi;
    if (id === "hinoko" || id === "mebuki" || id === "mizumo" || id === "kururi") return SCENE_LAYOUT.recovery[id];
    return null;
  }

  toggleRealityCheck(force?: boolean): void {
    const visible = force ?? !this.realityVisible;
    if (visible === this.realityVisible) return;
    this.realityVisible = visible;
    if (visible) {
      this.lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.realityDialog.hidden = false;
      setInert(this.realityDialog, false);
      for (const element of this.modalBackground) setInert(element, true);
      this.onModalChange(true);
      this.realityHeading.focus();
      return;
    }
    this.realityDialog.hidden = true;
    setInert(this.realityDialog, true);
    for (const element of this.modalBackground) setInert(element, false);
    this.onModalChange(false);
    this.lastFocused?.focus();
    this.lastFocused = null;
  }

  private requireElement<T extends HTMLElement = HTMLDivElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Experience overlay element is missing: ${selector}`);
    return element;
  }
}

const readPlacardCopy = (
  scene: ReturnType<typeof readWorldScene>,
  snapshot: AgentSnapshot,
  quiet: boolean,
  event: WorldState["activeEvent"],
): { tone: string; title: string; line: string | null } => {
  if (scene === "zero-output") {
    return { tone: "zero-output", title: "ZERO OUTPUT · ERROR", line: event?.line ?? "機械停止 · 処理に失敗" };
  }
  if (scene === "approval") {
    return { tone: "approval", title: WORLD_SCENE_LABELS[scene], line: "機械停止 · 経営者の判断待ち" };
  }
  if (scene === "kirari" || snapshot.status === "completed") {
    return { tone: "kirari", title: WORLD_SCENE_LABELS.kirari, line: event?.line ?? "操業完了 · 回復工程へ引き渡し" };
  }
  if (quiet) {
    return {
      tone: "quiet",
      title: "幕間表示",
      line: snapshot.active ? "操業継続中 · 音と演出を抑制" : "回復中 · 雨上がりの在庫補充",
    };
  }
  if (event) return { tone: event.tone, title: WORLD_SCENE_LABELS[scene], line: event.line };
  return { tone: scene, title: WORLD_SCENE_LABELS[scene], line: null };
};

const fitPlacardLine = (line: string): string => {
  const normalized = line.replace(/\s+/g, " ").trim();
  let widthUnits = 0;
  let fitted = "";
  for (const character of normalized) {
    const units = /[\u0000-\u00ff]/.test(character) ? 1 : 2;
    if (widthUnits + units > 24) break;
    widthUnits += units;
    fitted += character;
  }
  return fitted.trimEnd();
};

const compactPlacardTitle = (scene: ReturnType<typeof readWorldScene>): string => ({
  poka: "POKA · IDLE",
  mera: "MERA · ACTIVE",
  gogo: "GOGO · HIGH",
  approval: "APPROVAL · STOP",
  kirari: "KIRARI · DONE",
  "zero-output": "ERROR · ZERO",
  meguri: "MEGURI · REST",
})[scene];

const compactPlacardLine = (
  scene: ReturnType<typeof readWorldScene>,
  snapshot: AgentSnapshot,
  quiet: boolean,
  event: WorldState["activeEvent"],
  defaultLine: string,
): string => {
  if (scene === "zero-output") return "停止 · 成果ゼロ";
  if (scene === "approval") return "停止 · 判断待ち";
  if (scene === "kirari" || snapshot.status === "completed") return "完了 · 回復へ";
  if (quiet) return snapshot.active ? "操業中 · 演出抑制" : "回復中 · 在庫補充";
  if (event) return fitPlacardLine(event.title).slice(0, 16).trimEnd();
  if (snapshot.active) return `${snapshot.effort.toUpperCase()} · A${Math.max(1, snapshot.activeSessions)} · +${snapshot.tokenDelta}T`;
  return defaultLine.replace("RAIN", "R").replace("H2O", "W");
};

export const formatConnectionLabel = (label: string): string => {
  const normalized = label.replace(/\s+/g, " ").trim();
  const [source = "CODEX", detail = ""] = normalized.split("·").map((part) => part.trim());
  const compactDetail = detail
    .replace(/\b(Works|Factory|Project|Session)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 2)
    .join(" ");
  const compact = compactDetail ? `${source} · ${compactDetail}` : source;
  return compact.length <= 22 ? compact : compact.slice(0, 22).trimEnd();
};

const setInert = (element: HTMLElement, inert: boolean): void => {
  element.inert = inert;
  element.toggleAttribute("inert", inert);
};
