import type { AgentSnapshot } from "../domain/agent";
import type { WorldState } from "../domain/world";
import type { AudioDirector } from "./audioDirector";

const MIN_GAIN = 0.0001;

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

export class ExperienceAudioDirector implements AudioDirector {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private chillGain: GainNode | null = null;
  private chillOscillators: OscillatorNode[] = [];
  private lastEventId = -1;

  constructor(private readonly base: AudioDirector) {}

  get enabled(): boolean {
    return this.base.enabled;
  }

  get supported(): boolean {
    return this.base.supported;
  }

  async unlock(): Promise<boolean> {
    const baseUnlocked = await this.base.unlock();
    this.ensureGraph();
    if (this.context?.state === "suspended") {
      try {
        await this.context.resume();
      } catch {
        return baseUnlocked;
      }
    }
    return baseUnlocked || this.context?.state === "running";
  }

  async toggle(): Promise<boolean> {
    const enabled = await this.base.toggle();
    if (enabled) await this.unlock();
    this.syncMaster();
    return enabled;
  }

  update(world: WorldState, snapshot: AgentSnapshot): void {
    this.base.update(world, snapshot);
    if (!this.context || !this.master || !this.chillGain) return;
    const now = this.context.currentTime;
    const chillTarget = !snapshot.active && this.enabled
      ? 0.014 + world.chill * 0.028
      : MIN_GAIN;
    this.chillGain.gain.setTargetAtTime(chillTarget, now, 0.8);

    const event = world.activeEvent;
    if (event && event.id !== this.lastEventId) {
      this.playEvent(event.type, event.magnitude);
      this.lastEventId = event.id;
    }
  }

  dispose(): void {
    this.base.dispose();
    for (const oscillator of this.chillOscillators) {
      try {
        oscillator.stop();
      } catch {
        // Node may already be stopped.
      }
    }
    void this.context?.close();
    this.context = null;
  }

  private ensureGraph(): void {
    if (this.context || !this.supported) return;
    const audioWindow = window as AudioWindow;
    const Context = window.AudioContext || audioWindow.webkitAudioContext;
    if (!Context) return;

    const context = new Context();
    const master = context.createGain();
    master.gain.value = this.enabled ? 0.18 : MIN_GAIN;
    master.connect(context.destination);

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

    this.context = context;
    this.master = master;
    this.chillGain = chillGain;
    this.chillOscillators = oscillators;
  }

  private syncMaster(): void {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(this.enabled ? 0.18 : MIN_GAIN, this.context.currentTime, 0.05);
  }

  private playEvent(type: string, magnitude: number): void {
    if (!this.context || !this.master || !this.enabled || this.context.state !== "running") return;
    switch (type) {
      case "token-burn":
      case "tree-harvest":
        this.tone(78, 0.18, 0.11, "sawtooth", 46);
        this.tone(244, 0.07, 0.035, "square");
        break;
      case "factory-expansion":
      case "union-dance":
        [196, 246.94, 293.66].forEach((frequency, index) => this.tone(frequency, 0.2, 0.035, "triangle", undefined, index * 0.08));
        break;
      case "sunk-cost-error":
        [132, 110, 88].forEach((frequency, index) => this.tone(frequency, 0.2, 0.085, "square", 62, index * 0.13));
        break;
      case "greenwash-ceremony":
      case "legendary-zoy":
        [392, 523.25, 659.25, 783.99].forEach((frequency, index) => this.tone(frequency, 0.34, 0.04, "sine", frequency * 1.01, index * 0.09));
        break;
      case "plantation-break":
      case "recovery-rainbow":
        [261.63, 329.63, 392].forEach((frequency, index) => this.tone(frequency, 0.5, 0.022, "sine", frequency * 1.005, index * 0.16));
        break;
      default:
        this.tone(180 + Math.min(220, magnitude / 3), 0.15, 0.03, "triangle");
    }
  }

  private tone(
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    endFrequency?: number,
    delay = 0,
  ): void {
    if (!this.context || !this.master) return;
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
