import type { Rect } from "../engine/math";

/**
 * A single attack instance (one sword swing, one projectile). The hit
 * registry guarantees each target is damaged at most once per swing even
 * though the hitbox stays active across several ticks.
 */
export class Swing {
  private alreadyHit = new Set<object>();

  constructor(public rect: Rect | null = null) {}

  /** Returns true the first time `target` is touched by this swing. */
  register(target: object): boolean {
    if (this.alreadyHit.has(target)) return false;
    this.alreadyHit.add(target);
    return true;
  }

  reset(): void {
    this.alreadyHit.clear();
    this.rect = null;
  }
}
