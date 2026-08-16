import { fireEvent } from "@testing-library/dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpeningBriefing } from "./openingBriefing";

describe("Opening Briefing", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("自動送りをせず、三段階を手動で進めて完了する", () => {
    const host = document.createElement("main");
    const stage = document.createElement("button");
    host.append(stage);
    document.body.append(host);
    const complete = vi.fn();
    const briefing = new OpeningBriefing(host, complete);
    briefing.show();
    const dialog = host.querySelector<HTMLElement>(".opening-briefing");
    const next = host.querySelector<HTMLButtonElement>("[data-action='next']");
    expect(dialog?.dataset.step).toBe("1");
    expect(stage.inert).toBe(true);
    next?.click();
    expect(dialog?.dataset.step).toBe("2");
    next?.click();
    expect(dialog?.dataset.step).toBe("3");
    next?.click();
    expect(dialog?.hidden).toBe(true);
    expect(complete).toHaveBeenCalledOnce();
  });

  it("Skipでき、Tabをdialog内で循環する", () => {
    const host = document.createElement("main");
    document.body.append(host);
    const complete = vi.fn();
    const briefing = new OpeningBriefing(host, complete);
    briefing.show();
    const dialog = host.querySelector<HTMLElement>(".opening-briefing");
    const buttons = Array.from(dialog?.querySelectorAll<HTMLButtonElement>("button:not([hidden])") ?? []);
    buttons.at(-1)?.focus();
    fireEvent.keyDown(dialog as HTMLElement, { key: "Tab" });
    expect(document.activeElement).toBe(buttons[0]);
    host.querySelector<HTMLButtonElement>("[data-action='skip']")?.click();
    expect(complete).toHaveBeenCalledOnce();
  });
});
