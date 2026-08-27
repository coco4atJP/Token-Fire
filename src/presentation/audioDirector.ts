import { effortMultiplier, type AgentSnapshot } from "../domain/agent";
import type { WorldState } from "../domain/world";
import { AudioCueGate } from "./audioPacing";

const AUDIO_ENABLED_KEY = "token-fire.audio.enabled";
const MASTER_VOLUME = 0.24;
const MIN_GAIN = 0.0001;
const TWO_PI = Math.PI * 2;

export interface AudioDirector {
  readonly enabled: boolean;
  readonly supported: boolean;
  unlock(): Promise<boolean>;
  toggle(): Promise<boolean>;
  update(world: WorldState, snapshot: AgentSnapshot): void;
  dispose(): void;
}

type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export type SharedPlaybackGraph = {
  context: AudioContext;
  masterGain: GainNode;
  noiseBuffer: AudioBuffer;
};

export interface BaseAudioPolicy {
  isQuiet(): boolean;
  minimumCueSpacingMs(): number;
}

const DEFAULT_BASE_AUDIO_POLICY: BaseAudioPolicy = {
  isQuiet: () => false,
  minimumCueSpacingMs: () => 900,
};

const readEnabledPreference = (): boolean => {
  try {
    const stored = localStorage.getItem(AUDIO_ENABLED_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
};

const saveEnabledPreference = (enabled: boolean): void => {
  try {
    localStorage.setItem(AUDIO_ENABLED_KEY, String(enabled));
  } catch {
    // Persistence is optional. Audio continues to work when storage is unavailable.
  }
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export interface BaseAudioTargets {
  readonly forge: number;
  readonly rain: number;
  readonly master: number;
  readonly filterHz: number;
}

/** 実Audio graphへ渡す目標値。Quiet時はambientを含めて無音床へ落とす。 */
export const readBaseAudioTargets = (
  world: Pick<WorldState, "heat" | "pollution" | "rain" | "water">,
  snapshot: Pick<AgentSnapshot, "active" | "effort">,
  quiet: boolean,
  enabled = true,
): BaseAudioTargets => {
  const intensity = effortMultiplier(snapshot.effort);
  return {
    forge: snapshot.active && !quiet
      ? clamp((0.012 + world.heat * 0.022 + world.pollution * 0.008) * intensity, 0.008, 0.065)
      : MIN_GAIN,
    rain: snapshot.active || quiet
      ? MIN_GAIN
      : clamp(0.006 + world.rain * 0.034 + world.water * 0.005, 0.008, 0.047),
    master: enabled && !quiet ? MASTER_VOLUME : MIN_GAIN,
    filterHz: 145 + intensity * 95 + world.heat * 210,
  };
};

export class TokenFireAudioDirector implements AudioDirector {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private forgeGain: GainNode | null = null;
  private forgeFilter: BiquadFilterNode | null = null;
  private forgeOscillators: OscillatorNode[] = [];
  private rainGain: GainNode | null = null;
  private rainSource: AudioBufferSourceNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private enabledValue = readEnabledPreference();
  private disposed = false;
  private lastSnapshotAt = -1;
  private lastActive = false;
  private lastStatus: AgentSnapshot["status"] = "idle";
  private lastTool: string | null = null;
  private lastImpactIndex: number | null = null;
  private lastImpactAt = 0;
  private lastTokenCueAt = 0;

  constructor(
    private readonly policy: BaseAudioPolicy = DEFAULT_BASE_AUDIO_POLICY,
    private readonly cueGate = new AudioCueGate(),
  ) {}

  get enabled(): boolean {
    return this.enabledValue;
  }

  get supported(): boolean {
    const audioWindow = window as AudioWindow;
    return Boolean(window.AudioContext || audioWindow.webkitAudioContext);
  }

  async unlock(): Promise<boolean> {
    if (this.disposed || !this.supported) return false;
    this.ensureGraph();
    const context = this.context;
    if (!context) return false;

    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        return false;
      }
    }

    this.syncMasterGain();
    return (context.state as AudioContextState) === "running";
  }

  async toggle(): Promise<boolean> {
    this.enabledValue = !this.enabledValue;
    saveEnabledPreference(this.enabledValue);
    if (this.enabledValue) await this.unlock();
    this.syncMasterGain();
    return this.enabledValue;
  }

  update(world: WorldState, snapshot: AgentSnapshot): void {
    if (this.disposed) return;

    const quiet = this.policy.isQuiet();
    if (!quiet) this.updateHammerCue(world, snapshot);
    const isFreshSnapshot = snapshot.updatedAtMs !== this.lastSnapshotAt;
    if (isFreshSnapshot) this.updateEventCues(snapshot, !quiet);

    if (!this.context || !this.masterGain || !this.forgeGain || !this.forgeFilter || !this.rainGain) return;
    const now = this.context.currentTime;
    const intensity = effortMultiplier(snapshot.effort);
    const targets = readBaseAudioTargets(world, snapshot, quiet, this.enabledValue);

    this.forgeGain.gain.setTargetAtTime(targets.forge, now, 0.22);
    this.rainGain.gain.setTargetAtTime(targets.rain, now, 0.35);
    this.masterGain.gain.setTargetAtTime(targets.master, now, 0.08);
    this.forgeFilter.frequency.setTargetAtTime(targets.filterHz, now, 0.2);
    for (const [index, oscillator] of this.forgeOscillators.entries()) {
      const base = index === 0 ? 43 : 67;
      oscillator.frequency.setTargetAtTime(base + intensity * (index === 0 ? 4 : 7), now, 0.28);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const oscillator of this.forgeOscillators) {
      try {
        oscillator.stop();
      } catch {
        // The node may already be stopped by the browser.
      }
    }
    try {
      this.rainSource?.stop();
    } catch {
      // The node may already be stopped by the browser.
    }
    void this.context?.close();
    this.context = null;
  }

  private ensureGraph(): void {
    if (this.context || this.disposed) return;
    const audioWindow = window as AudioWindow;
    const Context = window.AudioContext || audioWindow.webkitAudioContext;
    if (!Context) return;

    const context = new Context();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.18;

    const masterGain = context.createGain();
    masterGain.gain.value = this.enabledValue ? MASTER_VOLUME : MIN_GAIN;
    masterGain.connect(compressor);
    compressor.connect(context.destination);

    const forgeFilter = context.createBiquadFilter();
    forgeFilter.type = "lowpass";
    forgeFilter.frequency.value = 230;
    forgeFilter.Q.value = 1.2;

    const forgeGain = context.createGain();
    forgeGain.gain.value = MIN_GAIN;
    forgeFilter.connect(forgeGain);
    forgeGain.connect(masterGain);

    const lowOscillator = context.createOscillator();
    lowOscillator.type = "triangle";
    lowOscillator.frequency.value = 47;
    const lowGain = context.createGain();
    lowGain.gain.value = 0.7;
    lowOscillator.connect(lowGain);
    lowGain.connect(forgeFilter);

    const machineryOscillator = context.createOscillator();
    machineryOscillator.type = "triangle";
    machineryOscillator.frequency.value = 72;
    const machineryGain = context.createGain();
    machineryGain.gain.value = 0.22;
    machineryOscillator.connect(machineryGain);
    machineryGain.connect(forgeFilter);

    lowOscillator.start();
    machineryOscillator.start();

    const noiseBuffer = this.createNoiseBuffer(context, 2.4);
    const rainSource = context.createBufferSource();
    rainSource.buffer = noiseBuffer;
    rainSource.loop = true;
    const rainHighpass = context.createBiquadFilter();
    rainHighpass.type = "highpass";
    rainHighpass.frequency.value = 850;
    const rainLowpass = context.createBiquadFilter();
    rainLowpass.type = "lowpass";
    rainLowpass.frequency.value = 6200;
    const rainGain = context.createGain();
    rainGain.gain.value = MIN_GAIN;
    rainSource.connect(rainHighpass);
    rainHighpass.connect(rainLowpass);
    rainLowpass.connect(rainGain);
    rainGain.connect(masterGain);
    rainSource.start();

    this.context = context;
    this.masterGain = masterGain;
    this.forgeGain = forgeGain;
    this.forgeFilter = forgeFilter;
    this.forgeOscillators = [lowOscillator, machineryOscillator];
    this.rainGain = rainGain;
    this.rainSource = rainSource;
    this.noiseBuffer = noiseBuffer;
  }

  private createNoiseBuffer(context: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.72 + white * 0.28;
      channel[index] = previous;
    }
    return buffer;
  }

  private syncMasterGain(): void {
    if (!this.context || !this.masterGain) return;
    this.masterGain.gain.setTargetAtTime(this.enabledValue && !this.policy.isQuiet() ? MASTER_VOLUME : MIN_GAIN, this.context.currentTime, 0.04);
  }

  private updateEventCues(snapshot: AgentSnapshot, audible: boolean): void {
    const transitionedToError = snapshot.status === "error" && this.lastStatus !== "error";
    const started = snapshot.active && !this.lastActive;
    const stopped = !snapshot.active && this.lastActive;
    const startedCompacting = snapshot.status === "compacting" && this.lastStatus !== "compacting";
    const toolChanged = snapshot.active && snapshot.tool !== this.lastTool && snapshot.tool !== null;

    const now = performance.now();
    const spacing = this.policy.minimumCueSpacingMs();
    if (audible && transitionedToError && this.cueGate.tryAcquire(now, spacing, "important")) this.playErrorCue();
    else if (audible && started && this.cueGate.tryAcquire(now, spacing, "important")) this.playIgnitionCue();
    else if (audible && stopped && this.cueGate.tryAcquire(now, spacing, "important")) this.playRecoveryCue();
    else if (audible && startedCompacting && this.cueGate.tryAcquire(now, spacing)) this.playCompactingCue();

    if (audible && toolChanged && snapshot.tool && this.cueGate.tryAcquire(now, spacing)) this.playToolCue(snapshot.tool);
    if (audible && snapshot.active && snapshot.tokenDelta > 0 && this.cueGate.tryAcquire(now, spacing)) {
      this.playTokenCue(snapshot.tokenDelta, snapshot.activeSessions);
    }

    this.lastSnapshotAt = snapshot.updatedAtMs;
    this.lastActive = snapshot.active;
    this.lastStatus = snapshot.status;
    this.lastTool = snapshot.tool;
  }

  private updateHammerCue(world: WorldState, snapshot: AgentSnapshot): void {
    if (!snapshot.active || snapshot.status !== "working") {
      this.lastImpactIndex = null;
      return;
    }

    const intensity = effortMultiplier(snapshot.effort);
    const toolBoost = snapshot.tool === "apply_patch" ? 1.18 : snapshot.tool === "shell" ? 1.08 : 1;
    const hammerSpeed = (4.8 + intensity * 1.35) * toolBoost;
    const cycle = world.elapsed * hammerSpeed;
    const impactIndex = Math.floor((cycle - Math.PI / 2) / TWO_PI);

    if (this.lastImpactIndex === null) {
      this.lastImpactIndex = impactIndex;
      return;
    }

    if (impactIndex > this.lastImpactIndex) {
      const now = performance.now();
      if (now - this.lastImpactAt > 160 && this.cueGate.tryAcquire(now, this.policy.minimumCueSpacingMs())) {
        this.playHammerCue(intensity, snapshot.tool === "apply_patch");
        this.lastImpactAt = now;
      }
      this.lastImpactIndex = impactIndex;
    }
  }

  getSharedGraph(): SharedPlaybackGraph | null {
    if (
      !this.enabledValue ||
      !this.context ||
      this.context.state !== "running" ||
      !this.masterGain ||
      !this.noiseBuffer
    ) {
      return null;
    }
    return {
      context: this.context,
      masterGain: this.masterGain,
      noiseBuffer: this.noiseBuffer,
    };
  }

  private playTone(
    frequency: number,
    duration: number,
    volume: number,
    options: { delay?: number; type?: OscillatorType; endFrequency?: number } = {},
  ): void {
    const graph = this.getSharedGraph();
    if (!graph) return;
    const start = graph.context.currentTime + (options.delay ?? 0);
    const oscillator = graph.context.createOscillator();
    const gain = graph.context.createGain();
    oscillator.type = options.type ?? "sine";
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
    if (options.endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFrequency), start + duration);
    }
    gain.gain.setValueAtTime(MIN_GAIN, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, volume), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(MIN_GAIN, start + duration);
    oscillator.connect(gain);
    gain.connect(graph.masterGain);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  private playNoise(duration: number, volume: number, cutoff: number, delay = 0): void {
    const graph = this.getSharedGraph();
    if (!graph) return;
    const start = graph.context.currentTime + delay;
    const source = graph.context.createBufferSource();
    source.buffer = graph.noiseBuffer;
    const filter = graph.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const gain = graph.context.createGain();
    gain.gain.setValueAtTime(Math.max(MIN_GAIN, volume), start);
    gain.gain.exponentialRampToValueAtTime(MIN_GAIN, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(graph.masterGain);
    source.start(start, Math.random() * 1.4);
    source.stop(start + duration + 0.02);
  }

  private playHammerCue(intensity: number, woodenImpact: boolean): void {
    const strength = clamp(0.72 + intensity * 0.22, 0.78, 1.18);
    this.playNoise(0.075, 0.095 * strength, woodenImpact ? 1050 : 720);
    this.playTone(88, 0.13, 0.12 * strength, { type: "triangle", endFrequency: 53 });
    this.playTone(176, 0.045, 0.035 * strength, { type: "triangle" });
  }

  private playTokenCue(tokenDelta: number, sessions: number): void {
    const now = performance.now();
    if (now - this.lastTokenCueAt < 260) return;
    this.lastTokenCueAt = now;
    const notes = clamp(Math.round(Math.log2(tokenDelta + 1) / 3), 1, 3);
    const base = 650 + Math.min(3, sessions) * 45;
    for (let index = 0; index < notes; index += 1) {
      this.playTone(base * Math.pow(1.25, index), 0.12, 0.045, {
        delay: index * 0.055,
        type: "triangle",
        endFrequency: base * Math.pow(1.25, index) * 1.04,
      });
    }
  }

  private playIgnitionCue(): void {
    this.playNoise(0.28, 0.07, 1700);
    this.playTone(70, 0.3, 0.08, { type: "triangle", endFrequency: 118 });
    this.playTone(196, 0.16, 0.035, { delay: 0.16, type: "triangle", endFrequency: 247 });
  }

  private playRecoveryCue(): void {
    for (const [index, frequency] of [392, 523.25, 659.25].entries()) {
      this.playTone(frequency, 0.38, 0.04, { delay: index * 0.1, type: "sine", endFrequency: frequency * 1.015 });
    }
  }

  private playCompactingCue(): void {
    const frequencies = [440, 554.37, 659.25, 880];
    for (const [index, frequency] of frequencies.entries()) {
      this.playTone(frequency, 0.13, 0.032, { delay: index * 0.065, type: "triangle" });
    }
  }

  private playErrorCue(): void {
    this.playNoise(0.34, 0.11, 1300);
    for (let index = 0; index < 3; index += 1) {
      this.playTone(132 - index * 14, 0.14, 0.09, { delay: index * 0.14, type: "triangle", endFrequency: 83 });
    }
  }

  private playToolCue(tool: string): void {
    if (tool === "apply_patch") {
      this.playNoise(0.045, 0.035, 1900);
      this.playTone(310, 0.07, 0.022, { type: "triangle", endFrequency: 245 });
      return;
    }
    if (tool === "shell") {
      this.playTone(165, 0.055, 0.025, { type: "triangle", endFrequency: 205 });
      return;
    }
    if (tool.includes("agent")) {
      this.playTone(523.25, 0.11, 0.026, { type: "sine" });
      this.playTone(783.99, 0.15, 0.025, { delay: 0.07, type: "sine" });
    }
  }
}
