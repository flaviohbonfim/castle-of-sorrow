type SfxName =
  | "swing"
  | "hit"
  | "crit"
  | "hurt"
  | "jump"
  | "backdash"
  | "candle"
  | "pickup"
  | "heart"
  | "throw"
  | "levelup"
  | "die"
  | "spell";

/**
 * Tiny chiptune-style synthesizer: each SFX is a short envelope-shaped
 * oscillator burst, in the spirit of 16-bit sound chips. No audio assets.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  play(name: SfxName): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    switch (name) {
      case "swing":
        this.blip(ctx, t, "sawtooth", 220, 90, 0.05, 0.06);
        break;
      case "hit":
        this.blip(ctx, t, "square", 160, 60, 0.09, 0.12);
        this.noise(ctx, t, 0.05, 0.1);
        break;
      case "crit":
        this.blip(ctx, t, "square", 200, 40, 0.12, 0.16);
        this.noise(ctx, t, 0.09, 0.14);
        break;
      case "hurt":
        this.blip(ctx, t, "sawtooth", 300, 80, 0.15, 0.14);
        break;
      case "jump":
        this.blip(ctx, t, "square", 180, 380, 0.08, 0.05);
        break;
      case "backdash":
        this.noise(ctx, t, 0.07, 0.06);
        break;
      case "candle":
        this.blip(ctx, t, "triangle", 700, 300, 0.08, 0.08);
        break;
      case "pickup":
        this.blip(ctx, t, "square", 660, 990, 0.07, 0.06);
        break;
      case "heart":
        this.blip(ctx, t, "square", 523, 784, 0.06, 0.07);
        this.blip(ctx, t + 0.06, "square", 784, 1046, 0.06, 0.06);
        break;
      case "throw":
        this.blip(ctx, t, "sawtooth", 500, 200, 0.06, 0.06);
        break;
      case "levelup":
        [523, 659, 784, 1046].forEach((f, i) =>
          this.blip(ctx, t + i * 0.08, "square", f, f, 0.1, 0.09),
        );
        break;
      case "die":
        this.blip(ctx, t, "sawtooth", 400, 50, 0.5, 0.18);
        break;
      case "spell":
        this.blip(ctx, t, "triangle", 300, 900, 0.25, 0.1);
        this.blip(ctx, t + 0.05, "triangle", 450, 1200, 0.25, 0.08);
        break;
    }
  }

  private blip(
    ctx: AudioContext,
    t: number,
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(ctx: AudioContext, t: number, dur: number, vol: number): void {
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(gain).connect(ctx.destination);
    src.start(t);
  }
}

export const audio = new AudioEngine();
