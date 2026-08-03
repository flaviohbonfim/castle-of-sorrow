type TrackName = "castle" | "boss";

interface Track {
  bpm: number;
  bass: number[]; // midi notes, 0 = rest, 8th-note steps
  lead: number[];
  hatEvery: number;
}

const D = 38; // D2
const TRACKS: Record<TrackName, Track> = {
  castle: {
    bpm: 96,
    bass: [
      D, 0, D, 0, D + 3, 0, D, 0, D + 5, 0, D + 3, 0, D, 0, D - 2, 0,
      D, 0, D, 0, D + 3, 0, D, 0, D + 8, 0, D + 7, 0, D + 5, 0, D + 3, 0,
    ],
    lead: [
      74, 0, 0, 72, 74, 0, 77, 0, 74, 0, 72, 0, 69, 0, 0, 0,
      70, 0, 69, 0, 67, 0, 70, 0, 69, 0, 65, 0, 62, 0, 0, 0,
      74, 0, 0, 72, 74, 0, 77, 0, 81, 0, 79, 0, 77, 0, 74, 0,
      75, 0, 74, 0, 72, 0, 70, 0, 69, 0, 0, 0, 0, 0, 0, 0,
    ],
    hatEvery: 4,
  },
  boss: {
    bpm: 148,
    bass: [
      40, 40, 0, 40, 43, 0, 40, 40, 46, 0, 45, 0, 43, 0, 40, 0,
      40, 40, 0, 40, 43, 0, 40, 40, 48, 0, 47, 0, 46, 0, 43, 0,
    ],
    lead: [
      76, 0, 79, 0, 76, 74, 0, 76, 82, 0, 81, 0, 79, 0, 76, 0,
      76, 0, 79, 0, 83, 0, 82, 0, 79, 76, 0, 74, 76, 0, 0, 0,
    ],
    hatEvery: 2,
  },
};

const midiFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Procedural chiptune loop: a lookahead scheduler places square-wave bass,
 * triangle lead and noise hats on an 8th-note grid. No audio assets.
 */
class MusicEngine {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private track: TrackName = "castle";
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private master = 0.16;
  private muted = false;

  /** Must be called from a user-gesture handler (audio autoplay policy). */
  start(): void {
    if (this.timer) return;
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    this.gain = this.ctx.createGain();
    this.applyGain();
    this.gain.connect(this.ctx.destination);
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 40);
  }

  setTrack(name: TrackName): void {
    if (this.track !== name) {
      this.track = name;
      this.step = 0;
    }
  }

  /** 0..1 master volume multiplier (default level is baked into the base). */
  setVolume(v: number): void {
    this.master = Math.max(0, Math.min(1, v)) * 0.16;
    this.applyGain();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyGain();
  }

  isMuted(): boolean {
    return this.muted;
  }

  toggleMuted(): void {
    this.setMuted(!this.muted);
  }

  private applyGain(): void {
    if (this.gain) this.gain.gain.value = this.muted ? 0 : this.master;
  }

  private schedule(): void {
    const ctx = this.ctx!;
    if (ctx.state === "suspended") void ctx.resume();
    const t = TRACKS[this.track];
    const spb = 60 / t.bpm / 2; // seconds per 8th step
    while (this.nextTime < ctx.currentTime + 0.15) {
      this.playStep(t, this.step, this.nextTime, spb);
      this.step++;
      this.nextTime += spb;
    }
  }

  private playStep(t: Track, step: number, when: number, spb: number): void {
    const bass = t.bass[step % t.bass.length];
    if (bass > 0) this.note("square", midiFreq(bass), when, spb * 0.9, 0.5);
    const lead = t.lead[step % t.lead.length];
    if (lead > 0) this.note("triangle", midiFreq(lead), when, spb * 1.6, 0.55);
    if (step % t.hatEvery === 0) this.hat(when, 0.12);
  }

  private note(type: OscillatorType, freq: number, when: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g).connect(this.gain!);
    osc.start(when);
    osc.stop(when + dur + 0.03);
  }

  private hat(when: number, vol: number): void {
    const ctx = this.ctx!;
    const len = Math.ceil(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.03);
    src.connect(g).connect(this.gain!);
    src.start(when);
  }
}

export const music = new MusicEngine();
