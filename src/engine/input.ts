export type Action =
  | "left"
  | "right"
  | "up"
  | "down"
  | "jump"
  | "attack"
  | "subweapon"
  | "backdash"
  | "potion"
  | "menu"
  | "formBat"
  | "formWolf"
  | "formMist";

const KEY_MAP: Record<string, Action> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  KeyZ: "jump",
  Space: "jump",
  KeyX: "attack",
  KeyJ: "attack",
  KeyC: "subweapon",
  KeyK: "subweapon",
  ShiftLeft: "backdash",
  ShiftRight: "backdash",
  KeyL: "backdash",
  KeyQ: "potion",
  Tab: "menu",
  KeyE: "menu",
  Escape: "menu",
  Digit1: "formBat",
  Digit2: "formWolf",
  Digit3: "formMist",
};

const BUFFER_TICKS = 6; // press is honored up to 6 ticks (100ms) later

interface TapEvent {
  action: Action;
  tick: number;
}

/**
 * Tick-synchronized input: `held` is the live key state, `pressed` is an
 * edge-trigger with a small buffer window (so jump inputs slightly before
 * landing still count). Directional tap history feeds command-move detection
 * (e.g. SotN's Down, Up + Attack spells).
 */
export class Input {
  private heldKeys = new Set<Action>();
  private pressBuffer = new Map<Action, number>(); // action -> tick of press
  private pending: Action[] = [];
  private released: Action[] = [];
  private tapHistory: TapEvent[] = [];
  private tick = 0;

  constructor() {
    window.addEventListener("keydown", (e) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      e.preventDefault();
      if (!e.repeat) this.pending.push(action);
    });
    window.addEventListener("keyup", (e) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      this.released.push(action);
    });
    window.addEventListener("blur", () => {
      this.heldKeys.clear();
    });
  }

  /** Call once at the start of every simulation tick. */
  beginTick(): void {
    this.tick++;
    for (const a of this.pending) {
      this.heldKeys.add(a);
      this.pressBuffer.set(a, this.tick);
      if (a === "up" || a === "down" || a === "left" || a === "right") {
        this.tapHistory.push({ action: a, tick: this.tick });
        if (this.tapHistory.length > 12) this.tapHistory.shift();
      }
    }
    this.pending.length = 0;
    for (const a of this.released) this.heldKeys.delete(a);
    this.released.length = 0;
  }

  held(action: Action): boolean {
    return this.heldKeys.has(action);
  }

  pressed(action: Action): boolean {
    const t = this.pressBuffer.get(action);
    return t !== undefined && this.tick - t <= BUFFER_TICKS;
  }

  /** Consume a buffered press so it can't double-trigger. */
  consume(action: Action): void {
    this.pressBuffer.delete(action);
  }

  /**
   * True if the directional sequence was tapped in order, ending recently.
   * `windowTicks` is the max age of the first tap in the sequence.
   */
  command(sequence: Action[], windowTicks = 30): boolean {
    let i = sequence.length - 1;
    for (let h = this.tapHistory.length - 1; h >= 0 && i >= 0; h--) {
      const ev = this.tapHistory[h];
      if (this.tick - ev.tick > windowTicks) break;
      if (ev.action === sequence[i]) i--;
    }
    return i < 0;
  }

  clearCommands(): void {
    this.tapHistory.length = 0;
  }
}
