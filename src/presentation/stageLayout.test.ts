import { describe, expect, it } from "vitest";
import { readStageLayoutMode, SceneLayout } from "./stageLayout";

describe("StageLayout", () => {
  it("520pxと720pxを共通breakpointとして分類する", () => {
    expect(readStageLayoutMode(0)).toBe("compact");
    expect(readStageLayoutMode(519)).toBe("compact");
    expect(readStageLayoutMode(520)).toBe("diorama");
    expect(readStageLayoutMode(719)).toBe("diorama");
    expect(readStageLayoutMode(720)).toBe("wide");
  });

  it("基準画面でも320×192の舞台投影を共有する", () => {
    const compact = new SceneLayout(380, 240);
    const diorama = new SceneLayout(560, 350);
    const wide = new SceneLayout(800, 480);

    expect(compact.mode).toBe("compact");
    expect(diorama.mode).toBe("diorama");
    expect(wide.mode).toBe("wide");
    expect(diorama.project({ x: 160, y: 96 })).toEqual({ x: 280, y: 175 });
    expect(wide.project({ x: 160, y: 96 })).toEqual({ x: 400, y: 240 });
  });
});
