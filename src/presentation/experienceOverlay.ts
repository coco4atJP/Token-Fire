import type { AgentSnapshot } from "../domain/agent";
import { CHARACTER_IDS, CHARACTER_LABELS } from "../domain/character";
import type { WorldState } from "../domain/world";

export interface ExperiencePresenter {
  update(world: WorldState, snapshot: AgentSnapshot): void;
  toggleRealityCheck(force?: boolean): void;
}

/**
 * 舞台の視覚情報はPixiへ一本化し、DOMは読み上げとSoto Noteの操作だけを担当する。
 */
export class TokenFireExperienceOverlay implements ExperiencePresenter {
  private readonly root: HTMLDivElement;
  private readonly announcer: HTMLDivElement;
  private readonly realityDialog: HTMLElement;
  private readonly realityHeading: HTMLHeadingElement;
  private readonly modalBackground: HTMLElement[];
  private lastAnnouncement = "";
  private lastFocused: HTMLElement | null = null;
  private realityVisible = false;

  constructor(
    host: HTMLElement,
    private readonly onModalChange: (open: boolean) => void = () => {},
  ) {
    this.root = document.createElement("div");
    this.root.className = "experience-layer";
    this.root.innerHTML = `
      <div class="sr-announcer" role="status" aria-live="polite" aria-atomic="true"></div>
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
    this.realityDialog = this.requireElement(".reality-check");
    setInert(this.realityDialog, true);
    this.realityHeading = this.requireElement("#reality-check-title");
    this.requireElement<HTMLButtonElement>(".reality-check__close").addEventListener("click", () => this.toggleRealityCheck(false));
    this.realityDialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.toggleRealityCheck(false);
    });
  }

  update(world: WorldState, snapshot: AgentSnapshot): void {
    const event = world.activeEvent;
    const speaker = CHARACTER_IDS
      .map((id) => world.characters[id])
      .filter((state) => state.line && state.until > world.elapsed)
      .sort((left, right) => right.until - left.until)[0];
    const important = snapshot.tool === "approval_review" || snapshot.status === "error" || snapshot.status === "completed";
    const message = snapshot.tool === "approval_review"
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
    }
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

const setInert = (element: HTMLElement, inert: boolean): void => {
  element.inert = inert;
  element.toggleAttribute("inert", inert);
};
