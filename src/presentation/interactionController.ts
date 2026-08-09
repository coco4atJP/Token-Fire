import type { AgentSnapshot } from "../domain/agent";
import { CHARACTER_IDS, CHARACTER_LABELS, type CharacterId } from "../domain/character";
import type { CharacterDirector } from "../domain/characterDirector";
import { manuallyCharNearestTree, type WorldState } from "../domain/world";
import { readWorldScene } from "../domain/worldScene";
import { SCENE_LAYOUT, type ActorPlacement } from "./sceneLayout";
import { StageViewport } from "./stageViewport";

const ACTIVE_CHARACTERS = new Set<CharacterId>(["hinoko", "sumi", "kururi"]);
const RECOVERY_CHARACTERS = new Set<CharacterId>(["fuwame", "mebuki", "mizumo"]);
const FOREST_REGION = { x: 87, y: 170, width: 150, height: 124 };

export class InteractionController {
  private readonly root: HTMLDivElement;
  private readonly buttons = new Map<CharacterId, HTMLButtonElement>();
  private readonly forestButton: HTMLButtonElement;
  private enabled = false;
  private activePhase = false;
  private dragStartX = 0;
  private dragStartOffset = 0;

  constructor(
    host: HTMLElement,
    private readonly getWorld: () => WorldState,
    private readonly characterDirector: CharacterDirector,
  ) {
    this.root = document.createElement("div");
    this.root.className = "interaction-layer";
    this.root.setAttribute("aria-hidden", "true");
    this.root.hidden = true;
    setInert(this.root, true);
    for (const id of CHARACTER_IDS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `character-hotspot character-hotspot--${id}`;
      button.setAttribute("aria-label", `${CHARACTER_LABELS[id]}に触る`);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!this.enabled) return;
        this.characterDirector.interact(this.getWorld(), id);
      });
      button.addEventListener("pointerenter", () => {
        if (this.enabled) this.getWorld().interaction.hovered = id;
      });
      button.addEventListener("pointerleave", () => {
        if (this.getWorld().interaction.hovered === id) this.getWorld().interaction.hovered = null;
      });
      if (id === "fuwame") {
        button.addEventListener("keydown", (event) => {
          if (!this.enabled || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
          event.preventDefault();
          const direction = event.key === "ArrowLeft" ? -1 : 1;
          this.characterDirector.setFuwameOffset(this.getWorld(), this.getWorld().interaction.fuwameOffsetX + direction * 8);
        });
        button.addEventListener("pointerdown", (event) => {
          if (!this.enabled) return;
          button.setPointerCapture(event.pointerId);
          this.getWorld().interaction.dragging = "fuwame";
          this.dragStartX = event.clientX;
          this.dragStartOffset = this.getWorld().interaction.fuwameOffsetX;
        });
        button.addEventListener("pointermove", (event) => {
          if (!this.enabled || this.getWorld().interaction.dragging !== "fuwame") return;
          const viewport = StageViewport.measure(this.root);
          this.characterDirector.setFuwameOffset(
            this.getWorld(),
            this.dragStartOffset + (event.clientX - this.dragStartX) / viewport.scale,
          );
        });
        button.addEventListener("pointerup", () => {
          this.getWorld().interaction.dragging = null;
        });
      }
      this.root.append(button);
      this.buttons.set(id, button);
    }

    this.forestButton = document.createElement("button");
    this.forestButton.type = "button";
    this.forestButton.className = "forest-hotspot";
    this.forestButton.setAttribute("aria-label", "森側を押して森林在庫を一件処理する");
    this.forestButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!this.enabled) return;
      manuallyCharNearestTree(this.getWorld(), 84, 112);
    });
    this.root.append(this.forestButton);
    host.append(this.root);
  }

  toggle(force?: boolean): boolean {
    this.enabled = force ?? !this.enabled;
    const world = this.getWorld();
    world.interaction.enabled = this.enabled;
    world.interaction.hovered = null;
    world.interaction.dragging = null;
    this.root.classList.toggle("is-enabled", this.enabled);
    this.root.setAttribute("aria-hidden", String(!this.enabled));
    this.root.hidden = !this.enabled;
    setInert(this.root, !this.enabled);
    for (const button of this.buttons.values()) button.tabIndex = this.enabled && !button.hidden ? 0 : -1;
    this.forestButton.tabIndex = this.enabled ? 0 : -1;
    return this.enabled;
  }

  update(world: WorldState, snapshot: AgentSnapshot): void {
    const scene = readWorldScene(world, snapshot);
    this.activePhase = scene !== "poka" && scene !== "meguri";
    this.root.dataset.phase = this.activePhase ? "active" : "chill";
    const viewport = StageViewport.measure(this.root);
    for (const id of CHARACTER_IDS) {
      const button = this.buttons.get(id);
      if (!button) continue;
      const phaseCharacters = this.activePhase ? ACTIVE_CHARACTERS : RECOVERY_CHARACTERS;
      button.hidden = !phaseCharacters.has(id);
      button.tabIndex = this.enabled && !button.hidden ? 0 : -1;
      if (!button.hidden) {
        const placement = this.characterPlacement(id, world);
        if (placement) this.placeButton(button, placement, viewport, id === "fuwame");
      }
      button.classList.toggle("is-talking", Boolean(world.characters[id].line));
      button.classList.toggle("is-hovered", world.interaction.hovered === id);
      button.title = world.characters[id].line ?? CHARACTER_LABELS[id];
    }
    this.placeButton(this.forestButton, FOREST_REGION, viewport);
  }

  private characterPlacement(id: CharacterId, world: WorldState): ActorPlacement | null {
    if (this.activePhase) {
      if (id === "hinoko" || id === "sumi") return SCENE_LAYOUT.active[id];
      if (id === "kururi") {
        const route = SCENE_LAYOUT.active.cart.maxX - SCENE_LAYOUT.active.cart.minX;
        const phase = (world.elapsed * 6.1) % (route * 2);
        const cartX = SCENE_LAYOUT.active.cart.minX + (phase <= route ? phase : route * 2 - phase);
        return { ...SCENE_LAYOUT.active.kururi, x: cartX + (phase <= route ? 31 : -13) };
      }
      return null;
    }
    if (id === "fuwame") {
      return {
        ...SCENE_LAYOUT.recovery.fuwame,
        x: SCENE_LAYOUT.recovery.fuwame.x + world.interaction.fuwameOffsetX,
      };
    }
    if (id === "mebuki" || id === "mizumo") return SCENE_LAYOUT.recovery[id];
    return null;
  }

  private placeButton(
    button: HTMLButtonElement,
    placement: ActorPlacement,
    viewport: StageViewport,
    centered = false,
  ): void {
    const raw = viewport.projectRect({
      x: placement.x - placement.width / 2,
      y: centered ? placement.y - placement.height / 2 : placement.y - placement.height,
      width: placement.width,
      height: placement.height,
    });
    const width = Math.max(24, raw.width);
    const height = Math.max(24, raw.height);
    button.style.left = `${raw.x - (width - raw.width) / 2}px`;
    button.style.top = `${raw.y - (height - raw.height) / 2}px`;
    button.style.width = `${width}px`;
    button.style.height = `${height}px`;
  }
}

const setInert = (element: HTMLElement, inert: boolean): void => {
  element.inert = inert;
  element.toggleAttribute("inert", inert);
};
