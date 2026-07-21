export type BuiltinWorldEventType =
  | "token-burn"
  | "tree-harvest"
  | "coolant-drain"
  | "factory-expansion"
  | "factory-milestone"
  | "sunk-cost-error"
  | "greenwash-ceremony"
  | "forge-sneeze"
  | "cinder-feast"
  | "union-dance"
  | "plantation-break"
  | "recovery-rainbow"
  | "context-landfill"
  | "approval-bell"
  | "project-arrival"
  | "weather-shift"
  | "direct-contact"
  | "legendary-zoy";

export type WorldEventType = BuiltinWorldEventType | `pack:${string}` | `interaction:${string}`;

export type WorldEventTone = "destruction" | "warning" | "chill" | "ceremony";

export interface WorldEvent {
  id: number;
  type: WorldEventType;
  tone: WorldEventTone;
  title: string;
  line: string;
  duration: number;
  magnitude: number;
  createdAt: number;
}

interface EventCopy {
  tone: WorldEventTone;
  title: string;
  line: string;
  duration: number;
}

const COPY: Record<BuiltinWorldEventType, EventCopy> = {
  "token-burn": { tone: "destruction", title: "TOKEN INCINERATION", line: "考えるほど森が減る。賢さの証明だ！", duration: 1.8 },
  "tree-harvest": { tone: "destruction", title: "FOREST INVENTORY WITHDRAWAL", line: "木材は在庫。景色は副作用。", duration: 3 },
  "coolant-drain": { tone: "warning", title: "COOLANT ACQUISITION", line: "湖を少し借りる。返却日は未定。", duration: 3 },
  "factory-expansion": { tone: "destruction", title: "PARALLELIZATION ACHIEVED", line: "並列化とは煙突を増やすことだ！", duration: 3.4 },
  "factory-milestone": { tone: "ceremony", title: "FACTORY QUIETLY GREW", line: "気づかない程度に、設備が一つ増えました。", duration: 4.2 },
  "sunk-cost-error": { tone: "warning", title: "ZERO OUTPUT · FULL EMISSIONS", line: "成果はなくても消費電力は返ってこない！", duration: 4.2 },
  "greenwash-ceremony": { tone: "ceremony", title: "SUSTAINABILITY CERTIFIED", line: "煙突を緑に塗りました。環境対応完了！", duration: 5.2 },
  "forge-sneeze": { tone: "destruction", title: "FORGE SNEEZE", line: "炉がくしゃみした。森が三本ほど消えた。", duration: 3.2 },
  "cinder-feast": { tone: "destruction", title: "UNAUTHORIZED TOKEN SNACK", line: "Cinderは燃料を味見した。業務上必要だった。", duration: 3.2 },
  "union-dance": { tone: "ceremony", title: "SUBAGENT PROFIT DANCE", line: "作業員が増えたので、まず祝います。", duration: 4 },
  "plantation-break": { tone: "chill", title: "PLANTATION INTERMISSION", line: "ひと呼吸。次の伐採分を静かに育てています。", duration: 5.5 },
  "recovery-rainbow": { tone: "chill", title: "COOLANT SKYLINE", line: "雨上がり。工場も脳も、少しだけ冷却中。", duration: 5.5 },
  "context-landfill": { tone: "warning", title: "CONTEXT LANDFILL", line: "Contextは圧縮。罪悪感は非圧縮。", duration: 3.6 },
  "approval-bell": { tone: "warning", title: "EXECUTIVE APPROVAL REQUIRED", line: "工場が止まりました。経営者のクリック待ちです。", duration: 6 },
  "project-arrival": { tone: "ceremony", title: "FACTORY TRANSFER", line: "作業員が別の事業所へ移動しました。", duration: 3.8 },
  "weather-shift": { tone: "chill", title: "LOCAL WEATHER RECEIVED", line: "外の空模様を、工場基準へ変換しました。", duration: 3.6 },
  "direct-contact": { tone: "destruction", title: "DIRECTOR CONTACT", line: "作業員が経営者の存在に気づきました。", duration: 3.2 },
  "legendary-zoy": { tone: "ceremony", title: "LEGENDARY DESTRUCTION QUOTE", line: "環境破壊はたのしいZOY!!", duration: 4.5 },
};

export const createWorldEvent = (
  type: WorldEventType,
  id: number,
  magnitude = 1,
  override?: Partial<Pick<WorldEvent, "title" | "line" | "duration" | "tone">>,
): WorldEvent => {
  const copy = type in COPY
    ? COPY[type as BuiltinWorldEventType]
    : { tone: "destruction" as const, title: "FACTORY INCIDENT", line: "追加イベントが発生しました。", duration: 3.8 };
  return {
    id,
    type,
    tone: override?.tone ?? copy.tone,
    title: override?.title ?? copy.title,
    line: override?.line ?? copy.line,
    duration: override?.duration ?? copy.duration,
    magnitude: Math.max(0, magnitude),
    createdAt: Date.now(),
  };
};
