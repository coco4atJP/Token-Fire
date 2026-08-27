export const FIXED_SPRING_STEP = 1 / 120;

export interface SpringToken {
  readonly stiffness: number;
  readonly damping: number;
}

/** blob-mascot-motionから運動文法だけを移したpresentation token。 */
export const SPRING_TOKENS = {
  snappy: { stiffness: 420, damping: 34 },
  // semi-implicit Eulerの固定stepでentrance peakが約1.19になる値。
  pop: { stiffness: 420, damping: 18 },
  bouncy: { stiffness: 520, damping: 15 },
  gel: { stiffness: 260, damping: 18 },
  soft: { stiffness: 170, damping: 24 },
  lazy: { stiffness: 90, damping: 20 },
  instant: { stiffness: 1_400, damping: 60 },
} as const satisfies Record<string, SpringToken>;

export class Spring {
  value: number;
  velocity: number;
  target: number;

  constructor(
    initial: number,
    readonly token: SpringToken,
    target = initial,
    velocity = 0,
  ) {
    this.value = initial;
    this.target = target;
    this.velocity = velocity;
  }

  step(): void {
    const acceleration = -this.token.stiffness * (this.value - this.target) - this.token.damping * this.velocity;
    this.velocity += acceleration * FIXED_SPRING_STEP;
    this.value += this.velocity * FIXED_SPRING_STEP;
    if (!Number.isFinite(this.value) || !Number.isFinite(this.velocity)) {
      throw new Error("spring integration produced a non-finite value");
    }
  }

  get settled(): boolean {
    return Math.abs(this.value - this.target) < 0.0005 && Math.abs(this.velocity) < 0.0005;
  }
}

export interface SpringSampleOptions {
  readonly initial: number;
  readonly target: number;
  readonly velocity?: number;
  readonly token: SpringToken;
  readonly maxSeconds?: number;
}

/** world.elapsedから同じ初期条件を固定stepでseekする純粋関数。 */
export const sampleSpringAt = (seconds: number, options: SpringSampleOptions): { value: number; velocity: number } => {
  const finiteSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const duration = Math.min(finiteSeconds, options.maxSeconds ?? 4);
  const steps = Math.round(duration / FIXED_SPRING_STEP);
  const spring = new Spring(options.initial, options.token, options.target, options.velocity ?? 0);
  for (let index = 0; index < steps; index += 1) spring.step();
  return { value: spring.value, velocity: spring.velocity };
};

/** targetをずらさず速度だけを蹴るimpact。 */
export const sampleVelocityImpulseAt = (
  seconds: number,
  impulse: number,
  token: SpringToken = SPRING_TOKENS.bouncy,
): { value: number; velocity: number } => sampleSpringAt(seconds, {
  initial: 0,
  target: 0,
  velocity: impulse,
  token,
  maxSeconds: 2,
});

export const samplePopInScale = (seconds: number): number => sampleSpringAt(seconds, {
  initial: 0.04,
  target: 1,
  token: SPRING_TOKENS.pop,
  maxSeconds: 2,
}).value;

export const volumePreservingScale = (scale: number, stretch: number): { sx: number; sy: number } => {
  const safeScale = Math.max(0.0001, Number.isFinite(scale) ? scale : 1);
  const safeStretch = Math.max(0.2, Number.isFinite(stretch) ? stretch : 1);
  const root = Math.sqrt(safeStretch);
  return { sx: safeScale / root, sy: safeScale * root };
};

export interface HammerMotion {
  readonly angle: number;
  readonly velocity: number;
  readonly impact: number;
  readonly stretch: number;
}

/** anticipation → strike → recoilを一周期ごとに同じ初期条件から再生する。 */
export const sampleHammerMotion = (elapsed: number, angularSpeed: number): HammerMotion => {
  const duration = Math.max(0.72, Math.min(1.25, (Math.PI * 2) / Math.max(0.1, angularSpeed)));
  const phase = ((elapsed % duration) + duration) % duration;
  const steps = Math.round(phase / FIXED_SPRING_STEP);
  const spring = new Spring(-0.22, SPRING_TOKENS.snappy, -0.22);
  let peakStrikeVelocity = 0;
  for (let index = 0; index < steps; index += 1) {
    const time = index * FIXED_SPRING_STEP;
    const progress = time / duration;
    spring.target = progress < 0.18
      ? -0.22
      : progress < 0.4
        ? -0.96
        : progress < 0.58
          ? 0.2
          : -0.22;
    spring.step();
    if (progress >= 0.4 && progress < 0.7) peakStrikeVelocity = Math.max(peakStrikeVelocity, spring.velocity);
  }
  const strikeAt = duration * 0.54;
  const impactAge = phase - strikeAt;
  const kick = impactAge >= 0 ? sampleVelocityImpulseAt(impactAge, -4.8).value : 0;
  return {
    angle: spring.value,
    velocity: spring.velocity,
    impact: Math.max(0, Math.min(1, peakStrikeVelocity / 17)) * (impactAge >= -0.08 && impactAge <= 0.16 ? 1 : 0),
    stretch: Math.max(0.78, Math.min(1.2, 1 + kick * 0.18)),
  };
};

export interface HopMotion {
  readonly y: number;
  readonly stretch: number;
}

export const sampleHopMotion = (elapsed: number, period = 1.8, phaseOffset = 0): HopMotion => {
  const phase = ((elapsed + phaseOffset) % period + period) % period;
  if (phase > 0.9) return { y: 0, stretch: 1 };
  const spring = sampleVelocityImpulseAt(phase, -24, SPRING_TOKENS.pop);
  return {
    y: Math.min(0, spring.value),
    stretch: Math.max(0.78, Math.min(1.2, 1 - spring.velocity * 0.012)),
  };
};

const hashSeed = (seed: number, index: number): number => {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 0xffffffff;
};

/** 2〜5秒間隔をseeded tableで繰り返すため、任意seekでも同じ瞬きになる。 */
export const blinkOpennessAt = (elapsed: number, seed: number): number => {
  const intervals = Array.from({ length: 8 }, (_, index) => 2 + hashSeed(seed, index) * 3);
  const cycle = intervals.reduce((sum, interval) => sum + interval, 0);
  let phase = ((elapsed % cycle) + cycle) % cycle;
  for (const interval of intervals) {
    if (phase < interval) {
      const blinkStart = interval - 0.17;
      if (phase < blinkStart) return 1;
      const blinkPhase = (phase - blinkStart) / 0.17;
      return Math.max(0.055, Math.abs(blinkPhase * 2 - 1));
    }
    phase -= interval;
  }
  return 1;
};

export const breathingScaleAt = (elapsed: number, seed: number): number =>
  1 + Math.sin(elapsed * Math.PI * 2 * 0.22 + seed * 0.73) * 0.014;

export const delayedFollow = (elapsed: number, frequency: number, delay: number, amplitude = 1): number =>
  Math.sin(Math.max(0, elapsed - delay) * frequency) * amplitude;

export interface SecondaryFollowMotion {
  readonly primary: number;
  readonly tool: number;
  readonly chimney: number;
  readonly string: number;
}

/**
 * 主運動から道具・煙突・吊り糸へ位相を遅らせて渡す決定的な二次運動。
 * impulseAgeは既存WorldEvent/ReplayFrameの時刻から与え、保存形式を増やさない。
 */
export const sampleSecondaryFollowAt = (
  elapsed: number,
  impulseAge: number | null = null,
): SecondaryFollowMotion => {
  const time = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const impulse = impulseAge === null
    ? 0
    : sampleVelocityImpulseAt(Math.max(0, impulseAge) + FIXED_SPRING_STEP, -7, SPRING_TOKENS.soft).value;
  return {
    primary: Math.sin(time * 1.5),
    tool: delayedFollow(time, 1.5, 0.08, 0.9),
    chimney: delayedFollow(time, 1.5, 0.18, 0.55) + impulse * 0.18,
    string: delayedFollow(time, 1.5, 0.28, 0.75),
  };
};
