import type { Rect } from "../../engine/math";
import type { WeaponDef } from "../../rpg/items";
import { Swing } from "../../combat/hitbox";
import type { Player } from "./player";

export type AttackDir = "side" | "up";

/**
 * A live melee attack. Frame data comes from the equipped weapon:
 * startup (no hitbox) -> active (hitbox out) -> recovery (no hitbox).
 */
export class AttackInstance {
  tick = 0;
  readonly swing = new Swing();

  constructor(
    readonly weapon: WeaponDef,
    readonly dir: AttackDir,
    readonly crouched: boolean,
  ) {}

  get total(): number {
    const f = this.weapon.frames;
    return f.startup + f.active + f.recovery;
  }

  get phase(): "startup" | "active" | "recovery" | "done" {
    const f = this.weapon.frames;
    if (this.tick < f.startup) return "startup";
    if (this.tick < f.startup + f.active) return "active";
    if (this.tick < this.total) return "recovery";
    return "done";
  }

  /** World-space hitbox for the current tick, or null outside active frames. */
  hitbox(p: Player): Rect | null {
    if (this.phase !== "active") return null;
    const b = p.body;
    if (this.dir === "up") {
      return { x: b.x - 2, y: b.y - this.weapon.reach, w: b.w + 4, h: this.weapon.reach + 6 };
    }
    const y = this.crouched ? b.y + b.h - 14 : b.y + 6;
    const x = p.facing > 0 ? b.x + b.w : b.x - this.weapon.reach;
    return { x, y, w: this.weapon.reach, h: 14 };
  }
}
