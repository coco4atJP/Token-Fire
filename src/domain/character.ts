export type CharacterId = "emberbeak" | "cinder" | "axle" | "vapo" | "spriglet" | "drizzle";

export type CharacterMood = "proud" | "busy" | "sleepy" | "scheming" | "chill" | "surprised";

export type CharacterAct =
  | "idle"
  | "inspect-ledger"
  | "snack-token"
  | "overstack-logs"
  | "invoice-coolant"
  | "plant-monoculture"
  | "selective-rain"
  | "nap"
  | "gossip"
  | "celebrate"
  | "react";

export interface CharacterLifeState {
  id: CharacterId;
  act: CharacterAct;
  mood: CharacterMood;
  line: string | null;
  until: number;
  offsetX: number;
  offsetY: number;
  interactions: number;
}

export interface InteractionState {
  enabled: boolean;
  hovered: CharacterId | null;
  dragging: CharacterId | null;
  drizzleOffsetX: number;
  lastInteractionAt: number;
}

export const CHARACTER_IDS: CharacterId[] = ["emberbeak", "cinder", "axle", "vapo", "spriglet", "drizzle"];

export const createCharacterLife = (): Record<CharacterId, CharacterLifeState> =>
  Object.fromEntries(
    CHARACTER_IDS.map((id) => [
      id,
      {
        id,
        act: "idle" as CharacterAct,
        mood: id === "emberbeak" ? "proud" as CharacterMood : "busy" as CharacterMood,
        line: null,
        until: 0,
        offsetX: 0,
        offsetY: 0,
        interactions: 0,
      },
    ]),
  ) as Record<CharacterId, CharacterLifeState>;

export const createInteractionState = (): InteractionState => ({
  enabled: false,
  hovered: null,
  dragging: null,
  drizzleOffsetX: 0,
  lastInteractionAt: 0,
});

export const CHARACTER_LABELS: Record<CharacterId, string> = {
  emberbeak: "Emberbeak",
  cinder: "Cinder Cub",
  axle: "Axle Beaver",
  vapo: "Vapo",
  spriglet: "Spriglet",
  drizzle: "Drizzle Puff",
};
