import { describe, expect, it } from "vitest";
import { CHARACTER_IDS, CHARACTER_LABELS, createInteractionState } from "./character";
import { CHARACTER_LINES } from "./characterDirector";
import { createWorldEvent } from "./worldEvent";

describe("キャラクター正史", () => {
  it("正史ID・表示名・Fuwame操作状態だけを公開する", () => {
    expect(CHARACTER_IDS).toEqual(["hinoko", "mebuki", "fuwame", "sumi", "mizumo", "kururi"]);
    expect(CHARACTER_LABELS).toEqual({
      hinoko: "Hinoko",
      mebuki: "Mebuki",
      fuwame: "Fuwame",
      sumi: "Sumi",
      mizumo: "Mizumo",
      kururi: "Kururi",
    });
    expect(createInteractionState()).toHaveProperty("fuwameOffsetX", 0);
    expect(createInteractionState()).not.toHaveProperty("drizzleOffsetX");
  });

  it("World Bible §8の代表台詞を各3本だけ割り当てる", () => {
    expect(Object.values(CHARACTER_LINES)).toHaveLength(6);
    for (const lines of Object.values(CHARACTER_LINES)) expect(lines).toHaveLength(3);
    expect(CHARACTER_LINES.hinoko[0]).toBe("よし、今日も世界を少しだけ成果に変えよう。");
    expect(CHARACTER_LINES.mebuki[2]).toBe("たくさん育ちました！　……また使えますね！");
    expect(CHARACTER_LINES.fuwame[1]).toBe("今日は、急がなくても大丈夫な雨です。");
    expect(CHARACTER_LINES.sumi[1]).toBe("警報が鳴った！　今日いちばん楽しい音！");
    expect(CHARACTER_LINES.mizumo[2]).toBe("戻ってきました。雨の味がします。");
    expect(CHARACTER_LINES.kururi[1]).toBe("これは事故ではなく、未計画の分解です。");
  });

  it("組み込みイベントも正史名を使う", () => {
    expect(createWorldEvent("sumi-feast", 1).type).toBe("sumi-feast");
  });
});
