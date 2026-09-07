import type { AgentSnapshot } from "./agent";
import type { CharacterAct, CharacterId, CharacterMood } from "./character";
import { enqueueWorldEvent, type WorldState } from "./world";

interface LifeBeat {
  id: CharacterId;
  act: CharacterAct;
  mood: CharacterMood;
  line: string;
  active?: boolean;
}

export const CHARACTER_LINES: Record<CharacterId, readonly [string, string, string]> = {
  hinoko: [
    "よし、今日も世界を少しだけ成果に変えよう。",
    "在庫が戻った！　素晴らしいめぐりだ！",
    "成果欄は空白だが、炉は実によく働いた。",
  ],
  mebuki: [
    "ここ、空いてます。植えられます。",
    "大丈夫です。根っこは、だいたい諦めません。",
    "たくさん育ちました！　……また使えますね！",
  ],
  fuwame: [
    "少し冷やしますね。",
    "今日は、急がなくても大丈夫な雨です。",
    "その紙吹雪、燃えています。降ります。",
  ],
  sumi: [
    "これ、すっごく燃えそう！",
    "警報が鳴った！　今日いちばん楽しい音！",
    "消えてないよ。小さく燃えてるだけ！",
  ],
  mizumo: [
    "ジュッ、ってしました。成功です。",
    "今日は少し、浅いです。",
    "戻ってきました。雨の味がします。",
  ],
  kururi: [
    "止めなくていいです。三分だけ流量を落としてください。",
    "これは事故ではなく、未計画の分解です。",
    "花壇にしたのは、部品が余ったからです。",
  ],
};

const BEATS: LifeBeat[] = [
  { id: "hinoko", act: "inspect-ledger", mood: "proud", line: CHARACTER_LINES.hinoko[0], active: true },
  { id: "hinoko", act: "celebrate", mood: "proud", line: CHARACTER_LINES.hinoko[1], active: false },
  { id: "hinoko", act: "inspect-ledger", mood: "surprised", line: CHARACTER_LINES.hinoko[2] },
  { id: "mebuki", act: "plant-monoculture", mood: "busy", line: CHARACTER_LINES.mebuki[0], active: false },
  { id: "mebuki", act: "plant-monoculture", mood: "chill", line: CHARACTER_LINES.mebuki[1], active: false },
  { id: "mebuki", act: "celebrate", mood: "proud", line: CHARACTER_LINES.mebuki[2], active: false },
  { id: "fuwame", act: "selective-rain", mood: "busy", line: CHARACTER_LINES.fuwame[0], active: true },
  { id: "fuwame", act: "selective-rain", mood: "chill", line: CHARACTER_LINES.fuwame[1], active: false },
  { id: "fuwame", act: "react", mood: "surprised", line: CHARACTER_LINES.fuwame[2], active: true },
  { id: "sumi", act: "snack-token", mood: "proud", line: CHARACTER_LINES.sumi[0], active: true },
  { id: "sumi", act: "react", mood: "surprised", line: CHARACTER_LINES.sumi[1], active: true },
  { id: "sumi", act: "nap", mood: "sleepy", line: CHARACTER_LINES.sumi[2], active: false },
  { id: "mizumo", act: "invoice-coolant", mood: "proud", line: CHARACTER_LINES.mizumo[0], active: true },
  { id: "mizumo", act: "inspect-ledger", mood: "surprised", line: CHARACTER_LINES.mizumo[1], active: true },
  { id: "mizumo", act: "nap", mood: "chill", line: CHARACTER_LINES.mizumo[2], active: false },
  { id: "kururi", act: "overstack-logs", mood: "busy", line: CHARACTER_LINES.kururi[0], active: true },
  { id: "kururi", act: "react", mood: "surprised", line: CHARACTER_LINES.kururi[1], active: true },
  { id: "kururi", act: "plant-monoculture", mood: "chill", line: CHARACTER_LINES.kururi[2], active: false },
];

const INTERACTION_LINES = CHARACTER_LINES;

export class CharacterDirector {
  private nextBeatAt = 7;
  private rngState = 0x27d4eb2d;
  private pendingBeat: { beat: LifeBeat; startedAt: number; stage: 0 | 1 } | null = null;

  update(world: WorldState, snapshot: AgentSnapshot, _dt: number): void {
    for (const state of Object.values(world.characters)) {
      if (state.until > 0 && world.elapsed >= state.until) {
        state.act = "idle";
        state.line = null;
        state.offsetX *= 0.4;
        state.offsetY *= 0.4;
        state.until = 0;
      }
    }

    // 一拍一変化: act/台詞 → 0.8秒後に表情 → さらに0.8秒後に位置、の順で渡す。
    // Renderer側が同じ瞬間に状態・表情・位置を独自変更しないための選択規律。
    if (this.pendingBeat) {
      const { beat, startedAt, stage } = this.pendingBeat;
      const state = world.characters[beat.id];
      if (stage === 0 && world.elapsed >= startedAt + 0.8) {
        state.mood = beat.mood;
        this.pendingBeat.stage = 1;
      } else if (stage === 1 && world.elapsed >= startedAt + 1.6) {
        state.offsetY = beat.act === "nap" ? 1.5 : -0.8;
        this.pendingBeat = null;
      }
    }

    if (this.pendingBeat || world.elapsed < this.nextBeatAt || world.activeEvent?.tone === "ceremony") return;
    const available = BEATS.filter((beat) => beat.active === undefined || beat.active === snapshot.active);
    const beat = available[Math.floor(this.random() * available.length)];
    const state = world.characters[beat.id];
    state.act = beat.act;
    state.line = beat.line;
    state.until = world.elapsed + (snapshot.active ? 4.4 : 6.2);
    this.pendingBeat = { beat, startedAt: world.elapsed, stage: 0 };
    this.nextBeatAt = world.elapsed + (snapshot.active ? 13 : 9) + this.random() * (snapshot.active ? 17 : 12);
  }

  interact(world: WorldState, id: CharacterId): void {
    const state = world.characters[id];
    const lines = INTERACTION_LINES[id];
    const line = lines[state.interactions % lines.length];
    state.interactions += 1;
    state.act = "react";
    state.mood = id === "mizumo" || id === "fuwame" ? "surprised" : "proud";
    state.line = line;
    state.until = world.elapsed + 4.2;
    state.offsetY = -2.2;
    world.interaction.lastInteractionAt = world.elapsed;

    const eventType = id === "sumi"
      ? "sumi-feast"
      : id === "fuwame" || id === "mizumo"
        ? "recovery-rainbow"
        : id === "hinoko"
          ? "forge-sneeze"
          : "plantation-break";
    enqueueWorldEvent(world, eventType, 1, {
      title: `${id.toUpperCase()} · DIRECTOR CONTACT`,
      line,
      duration: 3.2,
      tone: snapshotTone(id),
    });
  }

  setFuwameOffset(world: WorldState, offsetX: number): void {
    world.interaction.fuwameOffsetX = Math.max(-88, Math.min(88, offsetX));
    const state = world.characters.fuwame;
    state.act = "react";
    state.mood = "surprised";
    state.line = CHARACTER_LINES.fuwame[0];
    state.until = world.elapsed + 2.8;
  }

  private random(): number {
    let value = this.rngState | 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.rngState = value >>> 0;
    return this.rngState / 0xffffffff;
  }
}

const snapshotTone = (id: CharacterId): "destruction" | "chill" =>
  id === "fuwame" || id === "mizumo" || id === "mebuki" ? "chill" : "destruction";
