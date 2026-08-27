export type AudioCuePriority = "ambient" | "normal" | "important";

/** AudioDirector間で「一拍一変化」を共有する小さな発音ゲート。 */
export class AudioCueGate {
  private lastCueAt = Number.NEGATIVE_INFINITY;
  private lastPriority: AudioCuePriority = "ambient";

  tryAcquire(nowMs: number, minimumSpacingMs: number, priority: AudioCuePriority = "normal"): boolean {
    if (!Number.isFinite(nowMs)) return false;
    const elapsed = nowMs - this.lastCueAt;
    const importantFollowUp = priority === "important" && this.lastPriority !== "important" && elapsed >= 250;
    if (elapsed < Math.max(0, minimumSpacingMs) && !importantFollowUp) return false;
    this.lastCueAt = nowMs;
    this.lastPriority = priority;
    return true;
  }
}

export const audioCueSpacingForMode = (mode: "calm" | "balanced" | "chaos"): number =>
  mode === "calm" ? 1_400 : mode === "chaos" ? 650 : 900;

export const isPresentationAudioSuppressed = (quiet: boolean, developmentFixture: boolean): boolean =>
  quiet || developmentFixture;
