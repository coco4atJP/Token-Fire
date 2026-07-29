import { fireEvent } from "@testing-library/dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_SNAPSHOT } from "../domain/agent";
import { CharacterDirector } from "../domain/characterDirector";
import { createWorld } from "../domain/world";
import { ControlCenter } from "./controlCenter";
import { TokenFireExperienceOverlay } from "./experienceOverlay";
import { InteractionController } from "./interactionController";

describe("パネルとPLAY", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("Soto Noteをhidden/inertで閉じ、開閉時にフォーカスを移動・復帰する", () => {
    const host = document.createElement("main");
    const trigger = document.createElement("button");
    host.append(trigger);
    document.body.append(host);
    const overlay = new TokenFireExperienceOverlay(host);
    const dialog = host.querySelector<HTMLElement>(".reality-check");
    trigger.focus();
    expect(dialog?.hidden).toBe(true);
    expect(dialog?.inert).toBe(true);
    overlay.toggleRealityCheck(true);
    expect(dialog?.hidden).toBe(false);
    expect(dialog?.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(dialog as HTMLElement, { key: "Escape" });
    expect(dialog?.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it("つけ帳をdialogとして開き、背景をinertにしてEscapeで復帰する", () => {
    const host = document.createElement("main");
    const trigger = document.createElement("button");
    host.append(trigger);
    document.body.append(host);
    const world = createWorld();
    const persistence = { listProjects: () => [], exportDatabase: () => "{}", loadProject: () => world, save: () => {} };
    const settings = {
      get: () => ({
        autostart: false, playIntroSeen: false,
        weather: { enabled: false, latitude: 0, longitude: 0, label: "" },
        attention: { mode: "balanced", quietUntil: 0, quietHoursStart: 23, quietHoursEnd: 7, notifyApproval: true, notifyComplete: false, maxEventSoundsPerMinute: 8, reduceFlash: false },
        enabledEventPacks: [],
      }),
      update: vi.fn(),
      quietFor: vi.fn(),
    };
    const center = new ControlCenter(
      host, world, IDLE_SNAPSHOT, persistence, settings as never,
      { list: () => [], import: vi.fn() } as never,
      { setAutostart: vi.fn(async () => false) } as never,
    );
    const dialog = host.querySelector<HTMLElement>(".control-center");
    trigger.focus();
    center.toggle(true);
    expect(dialog?.hidden).toBe(false);
    expect(trigger.inert).toBe(true);
    expect(dialog?.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(dialog as HTMLElement, { key: "Escape" });
    expect(dialog?.hidden).toBe(true);
    expect(dialog?.inert).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it("PLAY外ではmanualDamageを増やさず、PLAY中だけ森とFuwameを操作できる", () => {
    const host = document.createElement("main");
    document.body.append(host);
    const world = createWorld();
    const interaction = new InteractionController(host, () => world, new CharacterDirector());
    const layer = host.querySelector<HTMLElement>(".interaction-layer");
    vi.spyOn(layer as HTMLElement, "getBoundingClientRect").mockReturnValue({
      width: 560, height: 350, left: 0, top: 0, right: 560, bottom: 350, x: 0, y: 0, toJSON: () => ({}),
    });
    interaction.update(world, IDLE_SNAPSHOT);
    const forest = host.querySelector<HTMLButtonElement>(".forest-hotspot");
    forest?.click();
    expect(world.debt.manualDamage).toBe(0);
    interaction.toggle(true);
    forest?.click();
    expect(world.debt.manualDamage).toBe(1);
    const fuwame = host.querySelector<HTMLButtonElement>(".character-hotspot--fuwame");
    fireEvent.keyDown(fuwame as HTMLButtonElement, { key: "ArrowRight" });
    expect(world.interaction.fuwameOffsetX).toBe(8);
    interaction.toggle(false);
    forest?.click();
    expect(world.debt.manualDamage).toBe(1);
  });
});
