import type { AgentSnapshot } from "../domain/agent";
import { CHARACTER_IDS, CHARACTER_LABELS, type CharacterId } from "../domain/character";
import type { CharacterDirector } from "../domain/characterDirector";
import { manuallyCharNearestTree, type WorldState } from "../domain/world";

const POSITIONS: Record<CharacterId, { x: number; y: number; width: number; height: number }> = {
  emberbeak: { x: 54, y: 60, width: 16, height: 27 },
  cinder: { x: 69, y: 65, width: 12, height: 22 },
  axle: { x: 37, y: 68, width: 15, height: 20 },
  vapo: { x: 84, y: 67, width: 14, height: 21 },
  spriglet: { x: 63, y: 67, width: 14, height: 22 },
  drizzle: { x: 73, y: 23, width: 18, height: 18 },
};

export class InteractionController {
  private readonly root: HTMLDivElement;
  private readonly buttons = new Map<CharacterId, HTMLButtonElement>();
  private enabled = false;
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
    for (const id of CHARACTER_IDS) {
      const position = POSITIONS[id];
      const button = document.createElement("button");
      button.type = "button";
      button.className = `character-hotspot character-hotspot--${id}`;
      button.setAttribute("aria-label", `${CHARACTER_LABELS[id]}に触る`);
      button.style.left = `${position.x}%`;
      button.style.top = `${position.y}%`;
      button.style.width = `${position.width}%`;
      button.style.height = `${position.height}%`;
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
      if (id === "drizzle") {
        button.addEventListener("pointerdown", (event) => {
          if (!this.enabled) return;
          button.setPointerCapture(event.pointerId);
          this.getWorld().interaction.dragging = "drizzle";
          this.dragStartX = event.clientX;
          this.dragStartOffset = this.getWorld().interaction.drizzleOffsetX;
        });
        button.addEventListener("pointermove", (event) => {
          if (!this.enabled || this.getWorld().interaction.dragging !== "drizzle") return;
          this.characterDirector.setDrizzleOffset(this.getWorld(), this.dragStartOffset + (event.clientX - this.dragStartX) * 0.8);
        });
        button.addEventListener("pointerup", () => {
          this.getWorld().interaction.dragging = null;
        });
      }
      this.root.append(button);
      this.buttons.set(id, button);
    }

    this.root.addEventListener("click", (event) => {
      if (!this.enabled || event.target !== this.root) return;
      const rect = this.root.getBoundingClientRect();
      const worldX = ((event.clientX - rect.left) / rect.width) * 320;
      const worldY = ((event.clientY - rect.top) / rect.height) * 192;
      if (worldX < 220 && worldY > 45) manuallyCharNearestTree(this.getWorld(), worldX, worldY);
    });
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
    return this.enabled;
  }

  update(world: WorldState, snapshot: AgentSnapshot): void {
    this.root.dataset.phase = snapshot.active ? "active" : "chill";
    const drizzle = this.buttons.get("drizzle");
    if (drizzle) drizzle.style.setProperty("--drag-x", `${world.interaction.drizzleOffsetX}px`);
    for (const id of CHARACTER_IDS) {
      const button = this.buttons.get(id);
      if (!button) continue;
      button.classList.toggle("is-talking", Boolean(world.characters[id].line));
      button.classList.toggle("is-hovered", world.interaction.hovered === id);
      button.title = world.characters[id].line ?? CHARACTER_LABELS[id];
    }
  }
}
