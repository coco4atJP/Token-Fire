import { effortMultiplier, type ReasoningEffort } from "./agent";

export const ENERGY_LEVEL_COUNT = 24;

const ENERGY_LABELS = [
  "ほぼおひるね", "ほんのり", "ちょびっと", "ちょこっと", "すこし", "じわじわ",
  "まあまあ", "そこそこ", "けっこう", "たっぷり", "かなり", "だいぶ",
  "もりもり", "どっさり", "山盛り", "とてもたくさん", "すごくたくさん",
  "めちゃくちゃたくさん", "とんでもなくたくさん", "工場長もびっくり",
  "湖がそわそわ", "森がざわざわ", "空までけむたい", "説明をあきらめるほど",
] as const;

const LEVEL_THRESHOLDS = [
  0, 24, 55, 110, 210, 360, 580, 900, 1_350, 2_000, 2_900, 4_100,
  5_700, 7_800, 10_500, 14_000, 18_500, 24_000, 31_000, 40_000, 52_000,
  68_000, 90_000, 120_000,
] as const;

const GROWTH_THRESHOLDS = [
  0, 800, 1_800, 3_200, 5_200, 8_000, 12_000, 17_000, 23_000, 31_000,
  41_000, 53_000, 68_000, 86_000, 108_000, 135_000, 168_000, 208_000,
  258_000, 320_000, 400_000, 510_000, 670_000, 900_000,
] as const;

export interface EnergyReading {
  level: number;
  label: string;
  weightedTokens: number;
  modelWeight: number;
  disclaimer: string;
}

const normalizeModel = (model: string | null | undefined): string => (model ?? "unknown").trim().toLowerCase();

export const estimateModelWeight = (model: string | null | undefined): number => {
  const name = normalizeModel(model);
  if (/(nano|tiny|small|flash-lite|mini-fast)/.test(name)) return 0.68;
  if (/(mini|flash|haiku|8b|7b|4b|3b)/.test(name)) return 0.82;
  if (/(pro|max|opus|reasoning|o3|o4|xhigh|gpt-5\.6|gpt-5\.5)/.test(name)) return 1.42;
  if (/(codex|sonnet|gpt-5|gemini-2\.5|gemini-3)/.test(name)) return 1.12;
  return 1;
};

const levelFor = (value: number, thresholds: readonly number[]): number => {
  let level = 0;
  for (let index = 1; index < thresholds.length; index += 1) {
    if (value < thresholds[index]) break;
    level = index;
  }
  return Math.min(ENERGY_LEVEL_COUNT - 1, level);
};

export const readEnergy = (
  tokens: number,
  model: string | null | undefined,
  activeSessions: number,
  effort: ReasoningEffort,
): EnergyReading => {
  const modelWeight = estimateModelWeight(model);
  const parallelWeight = 1 + Math.max(0, activeSessions - 1) * 0.24;
  const weightedTokens = Math.max(0, tokens) * modelWeight * parallelWeight * effortMultiplier(effort);
  const level = levelFor(weightedTokens, LEVEL_THRESHOLDS);
  return {
    level,
    label: ENERGY_LABELS[level],
    weightedTokens,
    modelWeight,
    disclaimer: "Token量・モデル名・並列度から作った風刺用の相対表現です。実測電力ではありません。",
  };
};

export const readFactoryGrowthLevel = (totalWeightedTokens: number): number => levelFor(Math.max(0, totalWeightedTokens), GROWTH_THRESHOLDS);
export const energyLabelAt = (level: number): string => ENERGY_LABELS[Math.max(0, Math.min(ENERGY_LEVEL_COUNT - 1, Math.floor(level)))];
