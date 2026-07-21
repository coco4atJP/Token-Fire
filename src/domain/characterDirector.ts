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

const BEATS: LifeBeat[] = [
  { id: "emberbeak", act: "inspect-ledger", mood: "proud", line: "森林在庫、よし。次の燃焼計画を承認する。" },
  { id: "cinder", act: "snack-token", mood: "scheming", line: "これは盗み食いではなく、燃料品質検査です。", active: true },
  { id: "axle", act: "overstack-logs", mood: "busy", line: "最大積載量は、目標値です。", active: true },
  { id: "vapo", act: "invoice-coolant", mood: "surprised", line: "湖一杯ぶん、冷却水として請求しておきます。" },
  { id: "spriglet", act: "plant-monoculture", mood: "busy", line: "よく燃えて早く育つ木だけ植えています。" },
  { id: "drizzle", act: "selective-rain", mood: "scheming", line: "工場には雨。森には予算がありません。" },
  { id: "cinder", act: "nap", mood: "sleepy", line: "炉が止まっている間だけ休憩です。" },
  { id: "emberbeak", act: "gossip", mood: "proud", line: "環境部門には、緑色の塗料を追加しておけ。" },
  { id: "axle", act: "gossip", mood: "scheming", line: "切り株は景観設備として計上できます。" },
  { id: "vapo", act: "nap", mood: "chill", line: "水位が戻るまで、ぷかぷかしています。" },
];

const INTERACTION_LINES: Record<CharacterId, string[]> = {
  emberbeak: ["視察ごくろう。破壊量は順調だ。", "ハンマーには触るな。株主総会用だ。"],
  cinder: ["Tokenを一粒だけ……二粒だけ……。", "燃料棚の数は合っています。たぶん。"],
  axle: ["丸太をもう一本くらい載せても平気です。", "ブレーキはコスト削減対象です。"],
  vapo: ["押すと冷却水がこぼれます。請求します。", "今日は湖の残量が多めです。"],
  spriglet: ["植林は次の伐採への投資です。", "多様性より燃焼効率を優先しています。"],
  drizzle: ["雨の配送先を変更します。", "森への配水は有料プランです。"],
};

export class CharacterDirector {
  private nextBeatAt = 7;
  private rngState = 0x27d4eb2d;

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

    if (world.elapsed < this.nextBeatAt || world.activeEvent?.tone === "ceremony") return;
    const available = BEATS.filter((beat) => beat.active === undefined || beat.active === snapshot.active);
    const beat = available[Math.floor(this.random() * available.length)];
    const state = world.characters[beat.id];
    state.act = beat.act;
    state.mood = beat.mood;
    state.line = beat.line;
    state.until = world.elapsed + (snapshot.active ? 4.4 : 6.2);
    state.offsetY = beat.act === "nap" ? 1.5 : -0.8;
    this.nextBeatAt = world.elapsed + (snapshot.active ? 13 : 9) + this.random() * (snapshot.active ? 17 : 12);
  }

  interact(world: WorldState, id: CharacterId): void {
    const state = world.characters[id];
    const lines = INTERACTION_LINES[id];
    const line = lines[state.interactions % lines.length];
    state.interactions += 1;
    state.act = "react";
    state.mood = id === "vapo" || id === "drizzle" ? "surprised" : "proud";
    state.line = line;
    state.until = world.elapsed + 4.2;
    state.offsetY = -2.2;
    world.interaction.lastInteractionAt = world.elapsed;

    const eventType = id === "cinder"
      ? "cinder-feast"
      : id === "drizzle" || id === "vapo"
        ? "recovery-rainbow"
        : id === "emberbeak"
          ? "forge-sneeze"
          : "plantation-break";
    enqueueWorldEvent(world, eventType, 1, {
      title: `${id.toUpperCase()} · DIRECTOR CONTACT`,
      line,
      duration: 3.2,
      tone: snapshotTone(id),
    });
  }

  setDrizzleOffset(world: WorldState, offsetX: number): void {
    world.interaction.drizzleOffsetX = Math.max(-88, Math.min(88, offsetX));
    const state = world.characters.drizzle;
    state.act = "react";
    state.mood = "surprised";
    state.line = "雨の配送先を手動変更しました。";
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
  id === "drizzle" || id === "vapo" || id === "spriglet" ? "chill" : "destruction";
