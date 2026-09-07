import { describe, expect, it } from "vitest";
import { resolveSpriteAssetUrl } from "./spriteAtlas";

describe("resolveSpriteAssetUrl", () => {
  it("Tauriのlocalhost hostを維持してassets pathを解決する", () => {
    expect(resolveSpriteAssetUrl("/assets/token-fire/sprites.svg", "tauri://localhost/"))
      .toBe("tauri://localhost/assets/token-fire/sprites.svg");
  });

  it("HTTP開発serverでも同じassets pathへ解決する", () => {
    expect(resolveSpriteAssetUrl("/assets/token-fire/sprites.svg", "http://localhost:1420/"))
      .toBe("http://localhost:1420/assets/token-fire/sprites.svg");
  });
});
