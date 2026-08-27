import { describe, expect, it } from "vitest";
import { formatConnectionLabel } from "./experienceOverlay";

describe("操業札の接続文言", () => {
  it("CSS ellipsisへ頼らずsourceと短いproject名を残す", () => {
    expect(formatConnectionLabel("CODEX · Hibana QA Works")).toBe("CODEX · Hibana QA");
    expect(formatConnectionLabel("DEMO · A Very Long Factory Project Session")).toBe("DEMO · A Very");
    expect(formatConnectionLabel("WAITING FOR CODEX")).toBe("WAITING FOR CODEX");
    expect(formatConnectionLabel("CODEX · Hibana QA Works")).not.toContain("…");
  });
});
