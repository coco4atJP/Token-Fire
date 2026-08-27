import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Pixi描画のbrowser決定性", () => {
  it("同一fixture・world.elapsedの2回renderがpixel一致する", () => {
    const output = mkdtempSync(join(tmpdir(), "token-fire-visual-test-"));
    try {
      execFileSync(process.execPath, [
        resolve("scripts/capture-ui.mjs"),
        "--out", output,
        "--scenes", "mera",
        "--viewports", "560x350",
        "--verify-determinism",
      ], { cwd: resolve("."), stdio: "pipe" });
      const manifest = JSON.parse(readFileSync(join(output, "capture-manifest.json"), "utf8"));
      expect(manifest.determinismChecked).toBe(true);
      expect(manifest.captures).toHaveLength(1);
      expect(manifest.captures[0].consoleErrors).toBe(0);
      expect(manifest.captures[0].deterministicPixels.mismatch).toBe(0);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  }, 45_000);
});
