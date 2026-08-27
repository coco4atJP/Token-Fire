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
    fireEvent.keyDown(dialog as HTMLElement, { key: "Tab" });
    expect(document.activeElement).toBe(dialog?.querySelector("button"));
    fireEvent.keyDown(dialog as HTMLElement, { key: "Escape" });
    expect(dialog?.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it("舞台上の台詞をDOMの吊り札として可視化し、零出力では無言にする", () => {
    const host = document.createElement("main");
    document.body.append(host);
    const world = createWorld();
    const overlay = new TokenFireExperienceOverlay(host);
    world.characters.hinoko.line = "成果欄は空白だが、炉は実によく働いた。";
    world.characters.hinoko.until = 10;
    overlay.update(world, { ...IDLE_SNAPSHOT, active: true, status: "working" });
    const speech = host.querySelector<HTMLElement>(".character-speech");
    expect(speech?.hidden).toBe(false);
    expect(speech?.textContent).toContain("成果欄は空白");
    overlay.update(world, { ...IDLE_SNAPSHOT, status: "error" });
    expect(speech?.hidden).toBe(true);
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
        autostart: false, playIntroSeen: false, openingBriefingSeen: false,
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

  it("つけ帳の全tabをkeyboardで巡回でき、Tabはdialog内に留まる", () => {
    const host = document.createElement("main");
    const trigger = document.createElement("button");
    host.append(trigger);
    document.body.append(host);
    const world = createWorld();
    const persistence = { listProjects: () => [], exportDatabase: () => "{}", loadProject: () => world, save: () => {} };
    const settings = {
      get: () => ({
        autostart: false, playIntroSeen: false, openingBriefingSeen: false,
        weather: { enabled: false, latitude: 0, longitude: 0, label: "" },
        attention: { mode: "balanced", quietUntil: 0, quietHoursStart: 23, quietHoursEnd: 7, notifyApproval: true, notifyComplete: false, maxEventSoundsPerMinute: 8, reduceFlash: false },
        enabledEventPacks: [],
      }),
      update: vi.fn(), quietFor: vi.fn(),
    };
    const center = new ControlCenter(
      host, world, IDLE_SNAPSHOT, persistence, settings as never,
      { list: () => [], import: vi.fn() } as never,
      { setAutostart: vi.fn(async () => false) } as never,
    );
    center.toggle(true);
    const dialog = host.querySelector<HTMLElement>(".control-center") as HTMLElement;
    const tabs = Array.from(dialog.querySelectorAll<HTMLButtonElement>("[role=tab]"));
    expect(tabs.map((tab) => tab.textContent)).toEqual(["伝票", "台帳", "映写券", "切り抜き"]);
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])"))
      .filter((element) => element.tabIndex >= 0 && !element.hidden);
    focusable.at(-1)?.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    center.openSettings();
    expect(dialog.dataset.surface).toBe("settings");
    expect(dialog.querySelector<HTMLElement>(".control-center__tabs")?.hidden).toBe(true);
    expect(dialog.querySelector("#control-center-title")?.textContent).toBe("劇場外の操作卓");
  });

  it("DOMの可視HUDは操業札一枚に集約する", () => {
    const host = document.createElement("main");
    document.body.append(host);
    const overlay = new TokenFireExperienceOverlay(host);
    overlay.setConnectionLabel("CODEX · HIBANA");
    overlay.update(createWorld(), IDLE_SNAPSHOT);
    expect(host.querySelectorAll(".stage-ticker")).toHaveLength(1);
    expect(host.querySelector(".status-line")).toBeNull();
    expect(host.querySelector(".stage-summary")?.textContent).toContain("POKA");
    expect(host.querySelector(".stage-summary")?.textContent).toContain("CODEX · HIBANA");
  });

  it("重要状態は通常イベントより優先して操業札と読み上げへ反映する", () => {
    const host = document.createElement("main");
    document.body.append(host);
    const world = createWorld();
    world.activeEvent = {
      id: 1, type: "greenwash-ceremony", tone: "ceremony", title: "式典", line: "通常イベント",
      magnitude: 1, duration: 1, createdAt: 0,
    };
    const overlay = new TokenFireExperienceOverlay(host);
    overlay.update(world, { ...IDLE_SNAPSHOT, active: true, status: "thinking", tool: "approval_review" });
    expect(host.querySelector(".stage-ticker strong")?.textContent).toBe("APPROVAL · LINE STOP");
    expect(host.querySelector(".stage-ticker span")?.textContent).toContain("機械停止");
    expect(host.querySelector(".stage-summary")?.textContent).toContain("炉は停止");
    expect(host.querySelector("[role=status]")?.textContent).toContain("承認待ち");
    world.activeEvent = null;
    overlay.update(world, IDLE_SNAPSHOT);
    expect(host.querySelector("[role=status]")?.textContent).toBe("");
    overlay.update(world, { ...IDLE_SNAPSHOT, active: true, status: "thinking", tool: "approval_review" });
    expect(host.querySelector("[role=status]")?.textContent).toContain("承認待ち");
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
    interaction.update(world, { ...IDLE_SNAPSHOT, active: true, status: "thinking", tool: "approval_review" });
    expect(interaction.toggle(true)).toBe(false);
  });
});
