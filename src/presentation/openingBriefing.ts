import { trapTabKey } from "./focusTrap";

const BRIEFING_STEPS = [
  {
    kicker: "01 · TOKEN ARRIVAL",
    title: "Tokenが工場へ届きます",
    body: "AIが言葉を生むたび、Tokenはこの小さな事業所へ運び込まれます。数値表ではなく、作業員の動きとして眺めます。",
    diagram: "TOKEN → 事業所",
  },
  {
    kicker: "02 · COMBUSTION LINE",
    title: "森 → 荷車 → 炉 → 煙",
    body: "かわいい作業員は、森林在庫を運び、炉を動かし、成果に関係なく平然と煙を出します。Tokenを使っていない時に伐採はしません。",
    diagram: "森  →  荷車  →  炉  →  煙",
  },
  {
    kicker: "03 · INTERMISSION",
    title: "回復は、次回在庫の補充です",
    body: "休止中は森と水が少し戻り、次の操業へ備えます。24段階は実測CO₂・電力・水量ではなく、ふわっとした相対表現です。",
    diagram: "雨上がり  →  在庫補充  →  次回操業",
  },
] as const;

export class OpeningBriefing {
  private readonly root: HTMLElement;
  private readonly kicker: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly diagram: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly previousButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly modalBackground: HTMLElement[];
  private lastFocused: HTMLElement | null = null;
  private step = 0;
  private open = false;

  constructor(
    host: HTMLElement,
    private readonly onComplete: () => void,
    private readonly onModalChange: (open: boolean) => void = () => {},
  ) {
    this.root = document.createElement("section");
    this.root.className = "opening-briefing";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-labelledby", "opening-briefing-title");
    this.root.tabIndex = -1;
    this.root.hidden = true;
    setInert(this.root, true);
    this.root.innerHTML = `
      <div class="opening-briefing__card">
        <span class="opening-briefing__kicker" aria-hidden="true"></span>
        <h2 id="opening-briefing-title"></h2>
        <div class="opening-briefing__diagram" aria-hidden="true"></div>
        <p></p>
        <div class="opening-briefing__footer">
          <span class="opening-briefing__progress" aria-live="polite"></span>
          <div class="opening-briefing__actions">
            <button type="button" data-action="skip">Skip</button>
            <button type="button" data-action="previous">戻る</button>
            <button type="button" data-action="next">次へ</button>
          </div>
        </div>
      </div>
    `;
    this.modalBackground = Array.from(host.children).filter((element): element is HTMLElement => element instanceof HTMLElement);
    host.append(this.root);
    this.kicker = this.requireElement(".opening-briefing__kicker");
    this.title = this.requireElement("#opening-briefing-title");
    this.body = this.requireElement(".opening-briefing__card p");
    this.diagram = this.requireElement(".opening-briefing__diagram");
    this.progress = this.requireElement(".opening-briefing__progress");
    this.previousButton = this.requireElement("[data-action='previous']");
    this.nextButton = this.requireElement("[data-action='next']");
    this.root.addEventListener("click", (event) => this.handleClick(event));
    this.root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.finish();
      else trapTabKey(this.root, event);
    });
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    this.step = 0;
    this.lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.root.hidden = false;
    setInert(this.root, false);
    for (const element of this.modalBackground) setInert(element, true);
    this.render();
    this.onModalChange(true);
    this.nextButton.focus();
  }

  private handleClick(event: Event): void {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button")?.dataset.action;
    if (action === "skip") return this.finish();
    if (action === "previous") {
      this.step = Math.max(0, this.step - 1);
      this.render();
      return;
    }
    if (action !== "next") return;
    if (this.step === BRIEFING_STEPS.length - 1) this.finish();
    else {
      this.step += 1;
      this.render();
    }
  }

  private render(): void {
    const step = BRIEFING_STEPS[this.step];
    this.root.dataset.step = String(this.step + 1);
    this.kicker.textContent = step.kicker;
    this.title.textContent = step.title;
    this.body.textContent = step.body;
    this.diagram.textContent = step.diagram;
    this.progress.textContent = `${this.step + 1} / ${BRIEFING_STEPS.length}`;
    this.previousButton.hidden = this.step === 0;
    this.nextButton.textContent = this.step === BRIEFING_STEPS.length - 1 ? "舞台を見る" : "次へ";
  }

  private finish(): void {
    if (!this.open) return;
    this.open = false;
    this.root.hidden = true;
    setInert(this.root, true);
    for (const element of this.modalBackground) setInert(element, false);
    this.onModalChange(false);
    this.onComplete();
    this.lastFocused?.focus();
    this.lastFocused = null;
  }

  private requireElement<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Opening briefing element missing: ${selector}`);
    return element;
  }
}

const setInert = (element: HTMLElement, inert: boolean): void => {
  element.inert = inert;
  element.toggleAttribute("inert", inert);
};
