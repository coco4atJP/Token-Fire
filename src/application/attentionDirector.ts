import type { AgentSnapshot } from "../domain/agent";
import { enqueueWorldEvent, type WorldState } from "../domain/world";
import type { PlatformBridge } from "../infrastructure/platformBridge";
import type { SettingsStore } from "../infrastructure/settingsStore";

export class AttentionDirector {
  private soundTimestamps: number[] = [];
  private lastNotificationAt = 0;

  constructor(
    private readonly settings: SettingsStore,
    private readonly platform: PlatformBridge,
    private readonly notificationsEnabled: () => boolean = () => true,
  ) {}

  onSnapshot(world: WorldState, previous: AgentSnapshot, next: AgentSnapshot): void {
    const approval = next.tool === "approval_review" && previous.tool !== "approval_review";
    const approvalResolved = previous.tool === "approval_review" && next.tool !== "approval_review";
    const completed = !next.active && previous.active && next.status === "completed";
    const errored = next.status === "error" && previous.status !== "error";

    if (approval) {
      enqueueWorldEvent(world, "approval-bell", 1);
      if (this.settings.get().attention.notifyApproval) void this.notify("Token-Fire · 承認待ち", `${next.projectLabel}事業所が経営者の判断を待っています。`);
    }
    if (approvalResolved) {
      if (world.activeEvent?.type === "approval-bell") {
        world.activeEvent = null;
        world.eventElapsed = 0;
      }
      world.eventQueue = world.eventQueue.filter((event) => event.type !== "approval-bell");
    }
    if (completed && this.settings.get().attention.notifyComplete) {
      void this.notify("Token-Fire · 焼却完了", `${next.projectLabel}事業所が利益式典へ移行しました。`);
    }
    if (errored) void this.notify("Token-Fire · 成果ゼロ・排出満額", `${next.projectLabel}事業所で処理が停止しました。`);
  }

  isQuiet(): boolean {
    return this.settings.isQuiet() || document.visibilityState === "hidden";
  }

  allowEventSound(): boolean {
    if (this.isQuiet()) return false;
    const now = Date.now();
    const limit = this.settings.get().attention.maxEventSoundsPerMinute;
    this.soundTimestamps = this.soundTimestamps.filter((timestamp) => now - timestamp < 60_000);
    if (this.soundTimestamps.length >= limit) return false;
    this.soundTimestamps.push(now);
    return true;
  }

  modeMultiplier(): number {
    const mode = this.settings.get().attention.mode;
    return mode === "calm" ? 0.55 : mode === "chaos" ? 1.55 : 1;
  }

  private async notify(title: string, body: string): Promise<void> {
    if (!this.notificationsEnabled() || this.isQuiet()) return;
    const now = Date.now();
    if (now - this.lastNotificationAt < 45_000) return;
    this.lastNotificationAt = now;
    await this.platform.notify(title, body);
  }
}
