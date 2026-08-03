import type { Action } from "./input";
import type { Input } from "./input";

const DEADZONE = 0.35;

/** Standard gamepad button indices (W3C). */
const BTN = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  Select: 8,
  Start: 9,
  DpadUp: 12,
  DpadDown: 13,
  DpadLeft: 14,
  DpadRight: 15,
} as const;

/**
 * Polls `navigator.getGamepads()` and feeds edge presses into Input's
 * pending/released pipeline (same path as the keyboard).
 */
export class GamepadAdapter {
  private prev = new Map<Action, boolean>();

  poll(input: Input): void {
    const pads = typeof navigator !== "undefined" ? navigator.getGamepads() : [];
    const pad = pads[0] ?? pads[1] ?? null;
    if (!pad) {
      // Release anything we were holding if the pad disconnects.
      for (const [action, was] of this.prev) {
        if (was) input.injectRelease(action);
      }
      this.prev.clear();
      return;
    }

    const next = new Map<Action, boolean>();

    const set = (action: Action, down: boolean) => {
      next.set(action, down);
    };

    // Face / shoulders
    set("jump", pressed(pad, BTN.A));
    set("backdash", pressed(pad, BTN.B));
    set("attack", pressed(pad, BTN.X));
    set("subweapon", pressed(pad, BTN.Y));
    set("formBat", pressed(pad, BTN.LB));
    set("formWolf", pressed(pad, BTN.RB));
    set("formMist", pressed(pad, BTN.LT));
    set("potion", pressed(pad, BTN.RT));
    set("menu", pressed(pad, BTN.Start));
    // Select / Back = swap sub-weapon (Start opens menu).
    set("swapSub", pressed(pad, BTN.Select));

    // D-pad
    let left = pressed(pad, BTN.DpadLeft);
    let right = pressed(pad, BTN.DpadRight);
    let up = pressed(pad, BTN.DpadUp);
    let down = pressed(pad, BTN.DpadDown);

    // Left stick (merges with dpad)
    const sx = pad.axes[0] ?? 0;
    const sy = pad.axes[1] ?? 0;
    if (sx < -DEADZONE) left = true;
    if (sx > DEADZONE) right = true;
    if (sy < -DEADZONE) up = true;
    if (sy > DEADZONE) down = true;

    set("left", left);
    set("right", right);
    set("up", up);
    set("down", down);

    // Emit edges into Input.
    const all = new Set<Action>([...this.prev.keys(), ...next.keys()]);
    for (const action of all) {
      const was = this.prev.get(action) ?? false;
      const now = next.get(action) ?? false;
      if (now && !was) input.injectPress(action);
      if (!now && was) input.injectRelease(action);
    }
    this.prev = next;
  }
}

function pressed(pad: Gamepad, i: number): boolean {
  const b = pad.buttons[i];
  if (!b) return false;
  return b.pressed || b.value > 0.5;
}
