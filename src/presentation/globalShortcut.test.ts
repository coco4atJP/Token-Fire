import { fireEvent } from "@testing-library/dom";
import { beforeEach, describe, expect, it } from "vitest";
import { shouldIgnoreGlobalShortcut } from "./globalShortcut";

describe("global shortcut guard", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("通常舞台では通し、入力・modal・menu・修飾keyでは背景操作を抑止する", () => {
    const shell = document.createElement("main");
    const button = document.createElement("button");
    const input = document.createElement("input");
    const dialog = document.createElement("section");
    dialog.setAttribute("aria-modal", "true");
    dialog.hidden = true;
    shell.append(button, input, dialog);
    document.body.append(shell);

    const results: boolean[] = [];
    button.addEventListener("keydown", (event) => results.push(shouldIgnoreGlobalShortcut(event, shell, false)));
    input.addEventListener("keydown", (event) => results.push(shouldIgnoreGlobalShortcut(event, shell, false)));
    fireEvent.keyDown(button, { key: "p" });
    fireEvent.keyDown(input, { key: "p" });
    dialog.hidden = false;
    fireEvent.keyDown(button, { key: "l" });
    dialog.hidden = true;
    button.addEventListener("keydown", (event) => {
      if (event.key === "q") results.push(shouldIgnoreGlobalShortcut(event, shell, true));
    });
    fireEvent.keyDown(button, { key: "q" });
    fireEvent.keyDown(button, { key: "p", metaKey: true });
    fireEvent.keyDown(button, { key: "Escape" });

    expect(results).toEqual([false, true, true, false, true, true, false]);
  });
});
