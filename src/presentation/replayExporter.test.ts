import { describe, expect, it } from "vitest";
import type { ReplayFrame, ReplaySession } from "../domain/experienceData";
import { readReplayFrameProgress, selectReplayRepresentativeFrame } from "./replayExporter";

const frame = (t: number, energyLevel: number, heat = 0.2): ReplayFrame => ({
  t,
  active: true,
  status: "working",
  effort: "medium",
  agents: 1,
  taskTokens: t * 10,
  totalTokens: t * 10,
  energyLevel,
  growthLevel: 1,
  heat,
  pollution: 0.1,
  water: 0.8,
  rain: 0,
  chill: 0,
  trees: "gg",
  event: null,
});

const replay = (wasted: boolean): ReplaySession => ({
  id: "r",
  projectKey: "p",
  projectLabel: "P",
  sessionId: null,
  title: "R",
  model: null,
  startedAt: 0,
  endedAt: 3,
  totalTokens: 30,
  wasted,
  frames: [frame(1, 2), frame(2, 8, 0.7), frame(3, 5)],
});

describe("Replay代表場面", () => {
  it("完了済みは最大Energy、未完了は最終frameを選ぶ", () => {
    expect(selectReplayRepresentativeFrame(replay(false))?.t).toBe(2);
    expect(selectReplayRepresentativeFrame(replay(true))?.t).toBe(3);
    expect(selectReplayRepresentativeFrame({ ...replay(false), frames: [] })).toBeNull();
  });

  it("Replayのms期間とframeの秒を同じ単位へ揃える", () => {
    const session = { ...replay(false), startedAt: 10_000, endedAt: 13_000 };
    expect(readReplayFrameProgress(session, frame(1.5, 2))).toBe(0.5);
    expect(readReplayFrameProgress(session, frame(8, 2))).toBe(1);
  });
});
