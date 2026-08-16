import { projectKeyOf, projectLabelOf, type AgentSnapshot } from "../domain/agent";
import type { ReplayFrame, ReplaySession } from "../domain/experienceData";
import { addHistoricalMoment, type WorldState } from "../domain/world";

interface Recording {
  id: string;
  projectKey: string;
  projectLabel: string;
  sessionId: string | null;
  title: string;
  model: string | null;
  startedAt: number;
  frames: ReplayFrame[];
  lastCaptureAt: number;
}

const MAX_FRAMES = 900;
const CAPTURE_INTERVAL = 1;

export class ReplayRecorder {
  private recording: Recording | null = null;

  onSnapshot(world: WorldState, previous: AgentSnapshot, next: AgentSnapshot): void {
    const projectChanged = this.recording && projectKeyOf(next) !== this.recording.projectKey;
    if (projectChanged) {
      this.finish(world, true);
      if (next.active) this.start(next, world);
      return;
    }
    if (next.active && !this.recording) this.start(next, world);
    const ended = this.recording && !next.active && previous.active;
    if (ended) this.finish(world, next.status === "error" || next.status === "idle");
  }

  update(world: WorldState, snapshot: AgentSnapshot): void {
    if (!snapshot.active) return;
    if (!this.recording) this.start(snapshot, world);
    const recording = this.recording;
    if (!recording || world.elapsed - recording.lastCaptureAt < CAPTURE_INTERVAL) return;
    recording.lastCaptureAt = world.elapsed;
    recording.frames.push(captureFrame(world, snapshot, recording.startedAt));
    if (recording.frames.length > MAX_FRAMES) recording.frames = recording.frames.filter((_, index) => index % 2 === 0);
  }

  stop(world: WorldState): void {
    if (this.recording) this.finish(world, true);
  }

  private start(snapshot: AgentSnapshot, world: WorldState): void {
    const startedAt = Date.now();
    this.recording = {
      id: `${startedAt}-${snapshot.sessionId ?? "session"}`,
      projectKey: projectKeyOf(snapshot),
      projectLabel: projectLabelOf(snapshot),
      sessionId: snapshot.sessionId ?? null,
      title: snapshot.sessionTitle ?? "Codex task",
      model: snapshot.model ?? null,
      startedAt,
      frames: [captureFrame(world, snapshot, startedAt)],
      lastCaptureAt: world.elapsed,
    };
  }

  private finish(world: WorldState, wasted: boolean): void {
    const recording = this.recording;
    if (!recording) return;
    const replay: ReplaySession = {
      id: recording.id,
      projectKey: recording.projectKey,
      projectLabel: recording.projectLabel,
      sessionId: recording.sessionId,
      title: recording.title,
      model: recording.model,
      startedAt: recording.startedAt,
      endedAt: Date.now(),
      totalTokens: Math.round(world.taskTokens),
      wasted,
      frames: recording.frames,
    };
    if (replay.frames.length >= 2) {
      world.replays.unshift(replay);
      world.replays = world.replays.slice(0, 24);
      addHistoricalMoment(world, {
        at: replay.endedAt,
        type: "task",
        title: wasted ? "未完了タスクの動作記録" : "タスクの動作記録",
        line: `${replay.title} · ${replay.totalTokens.toLocaleString()} TOK · ${replay.frames.length} frames`,
        tokens: replay.totalTokens,
        model: replay.model,
        importance: wasted ? 2 : 1,
      });
    }
    this.recording = null;
  }
}

const captureFrame = (world: WorldState, snapshot: AgentSnapshot, startedAt: number): ReplayFrame => ({
  t: Math.max(0, (Date.now() - startedAt) / 1000),
  active: snapshot.active,
  status: snapshot.status,
  effort: snapshot.effort,
  agents: snapshot.activeSessions,
  taskTokens: Math.round(world.taskTokens),
  totalTokens: Math.round(world.debt.totalTokensBurned),
  energyLevel: Math.round(world.energyLevel),
  growthLevel: world.growthLevel,
  heat: world.heat,
  pollution: world.pollution,
  water: world.water,
  rain: world.rain,
  chill: world.chill,
  trees: world.trees.map((tree) => tree.stage[0]).join(""),
  event: world.activeEvent?.type ?? null,
});
