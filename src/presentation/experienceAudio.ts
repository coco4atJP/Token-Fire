import type { AgentSnapshot } from "../domain/agent";
import type { CharacterId } from "../domain/character";
import type { WorldState } from "../domain/world";
import { TokenFireAudioDirector, type AudioDirector } from "./audioDirector";
import { AudioCueGate } from "./audioPacing";

const MIN_GAIN = 0.0001;

export const readExperienceAudioTargets = (
  world: Pick<WorldState, "chill" | "rain">,
  snapshot: Pick<AgentSnapshot, "active">,
  quiet: boolean,
  enabled: boolean,
): { chill: number; master: number } => ({
  chill: !snapshot.active && enabled && !quiet
    ? (0.014 + world.chill * 0.028) * (1 - world.rain * 0.24)
    : MIN_GAIN,
  master: enabled && !quiet ? 0.18 : MIN_GAIN,
});

export interface ExperienceAudioPolicy {
  allowEventSound(): boolean;
  isQuiet(): boolean;
  minimumCueSpacingMs(): number;
}

const DEFAULT_POLICY: ExperienceAudioPolicy = {
  allowEventSound: () => true,
  isQuiet: () => false,
  minimumCueSpacingMs: () => 900,
};

export class ExperienceAudioDirector implements AudioDirector {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private chillGain: GainNode | null = null;
  private chillFilter: BiquadFilterNode | null = null;
  private chillOscillators: OscillatorNode[] = [];
  private chillLfo: OscillatorNode | null = null;
  private lastEventId = -1;
  private lastCharacterLine = "";
  private disposed = false;

  constructor(
    private readonly base: TokenFireAudioDirector,
    private readonly policy: ExperienceAudioPolicy = DEFAULT_POLICY,
    private readonly cueGate = new AudioCueGate(),
  ) {}

  get enabled(): boolean {
    return this.base.enabled;
  }

  get supported(): boolean {
    return !this.disposed && this.base.supported;
  }

  async unlock(): Promise<boolean> {
    if (this.disposed) return false;
    const baseUnlocked = await this.base.unlock();
    this.ensureGraph();
    return baseUnlocked;
  }

  async toggle(): Promise<boolean> {
    if (this.disposed) return false;
    const enabled = await this.base.toggle();
    if (enabled) await this.unlock();
    this.syncMaster();
    return enabled;
  }

  update(world: WorldState, snapshot: AgentSnapshot): void {
    if (this.disposed) return;
    const quiet = this.policy.isQuiet();
    if (this.context && this.master) this.updateCues(world, quiet);
    this.base.update(world, snapshot);
    if (!this.context || !this.master || !this.chillGain || !this.chillFilter) return;
    const now = this.context.currentTime;
    const targets = readExperienceAudioTargets(world, snapshot, quiet, this.enabled);
    this.chillGain.gain.setTargetAtTime(targets.chill, now, 0.8);
    this.chillFilter.frequency.setTargetAtTime(520 + world.rain * 360 + world.chill * 120, now, 1.8);
    this.master.gain.setTargetAtTime(targets.master, now, 0.2);

  }

  private updateCues(world: WorldState, quiet: boolean): void {
    const event = world.activeEvent;
    if (event && event.id !== this.lastEventId) {
      const priority = event.type === "approval-bell" || event.type === "sunk-cost-error" ? "important" : "normal";
      if (
        !quiet
        && this.cueGate.tryAcquire(performance.now(), this.policy.minimumCueSpacingMs(), priority)
        && this.policy.allowEventSound()
      ) this.playEvent(event.type, event.magnitude);
      this.lastEventId = event.id;
    }

    const speaker = Object.values(world.characters)
      .filter((state) => state.line && state.until > world.elapsed)
      .sort((left, right) => right.until - left.until)[0];
    const speechKey = speaker?.line ? `${speaker.id}:${speaker.line}` : "";
    if (
      speechKey
      && speechKey !== this.lastCharacterLine
      && !quiet
      && this.cueGate.tryAcquire(performance.now(), this.policy.minimumCueSpacingMs())
      && this.policy.allowEventSound()
    ) {
      this.playVoiceBlip(speaker.id, speaker.line?.length ?? 0);
    }
    this.lastCharacterLine = speechKey;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const oscillator of this.chillOscillators) {
      try {
        oscillator.stop();
      } catch {
        // Node may already be stopped.
      }
    }
    try {
      this.chillLfo?.stop();
    } catch {
      // Node may already be stopped.
    }
    this.chillOscillators = [];
    this.chillLfo = null;
    this.master?.disconnect();
    this.base.dispose();
    this.context = null;
    this.master = null;
    this.chillGain = null;
    this.chillFilter = null;
  }

  private ensureGraph(): void {
    if (this.context || this.disposed || !this.supported) return;
    const shared = this.base.getSharedGraph();
    if (!shared) return;
    const context = shared.context;
    const master = context.createGain();
    master.gain.value = this.enabled ? 0.18 : MIN_GAIN;
    master.connect(shared.masterGain);

    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 780;
    const chillGain = context.createGain();
    chillGain.gain.value = MIN_GAIN;
    filter.connect(chillGain);
    chillGain.connect(master);

    const frequencies = [174.61, 261.63];
    const oscillators = frequencies.map((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index === 0 ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      const gain = context.createGain();
      gain.gain.value = index === 0 ? 0.5 : 0.15;
      oscillator.connect(gain);
      gain.connect(filter);
      oscillator.start();
      return oscillator;
    });
    const lfo = context.createOscillator();
    const lfoDepth = context.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 0.075;
    lfoDepth.gain.value = 210;
    lfo.connect(lfoDepth);
    lfoDepth.connect(filter.frequency);
    lfo.start();

    this.context = context;
    this.master = master;
    this.chillGain = chillGain;
    this.chillFilter = filter;
    this.chillOscillators = oscillators;
    this.chillLfo = lfo;
  }

  private syncMaster(): void {
    if (!this.context || !this.master || this.disposed) return;
    const target = this.enabled ? (this.policy.isQuiet() ? 0.035 : 0.18) : MIN_GAIN;
    this.master.gain.setTargetAtTime(target, this.context.currentTime, 0.05);
  }

  private playEvent(type: string, magnitude: number): void {
    if (!this.context || !this.master || !this.enabled || this.context.state !== "running" || this.disposed) return;
    switch (type) {
      case "token-burn":
      case "tree-harvest":
        this.tone(78, 0.18, 0.11, "triangle", 46);
        this.tone(244, 0.07, 0.035, "triangle");
        break;
      case "factory-expansion":
      case "factory-milestone":
      case "union-dance":
        [196, 246.94, 293.66].forEach((frequency, index) => this.tone(frequency, 0.2, 0.035, "triangle", undefined, index * 0.08));
        break;
      case "approval-bell":
        [880, 1174.66].forEach((frequency, index) => this.tone(frequency, 0.22, 0.032, "sine", undefined, index * 0.15));
        break;
      case "sunk-cost-error":
        [132, 110, 88].forEach((frequency, index) => this.tone(frequency, 0.2, 0.085, "triangle", 62, index * 0.13));
        break;
      case "greenwash-ceremony":
      case "legendary-zoy":
        [392, 523.25, 659.25, 783.99].forEach((frequency, index) => this.tone(frequency, 0.34, 0.04, "sine", frequency * 1.01, index * 0.09));
        break;
      case "plantation-break":
      case "recovery-rainbow":
      case "weather-shift":
        [261.63, 329.63, 392].forEach((frequency, index) => this.tone(frequency, 0.5, 0.022, "sine", frequency * 1.005, index * 0.16));
        break;
      default:
        this.tone(180 + Math.min(220, magnitude / 3), 0.15, 0.03, "triangle");
    }
  }

  private playVoiceBlip(id: CharacterId, length: number): void {
    const base = {
      hinoko: 420,
      mebuki: 560,
      fuwame: 680,
      sumi: 760,
      mizumo: 510,
      kururi: 330,
    }[id];
    const syllables = Math.max(2, Math.min(4, Math.round(length / 9)));
    for (let index = 0; index < syllables; index += 1) {
      const step = index % 3 === 1 ? 1.12 : index % 3 === 2 ? 0.94 : 1;
      this.tone(base * step, 0.055, 0.018, "triangle", base * step * 1.035, index * 0.065);
    }
  }

  private tone(frequency: number, duration: number, volume: number, type: OscillatorType, endFrequency?: number, delay = 0): void {
    if (!this.context || !this.master || this.disposed) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    gain.gain.setValueAtTime(MIN_GAIN, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, volume), start + 0.01);
    gain.gain.exponentialRampToValueAtTime(MIN_GAIN, start + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.04);
  }
}
