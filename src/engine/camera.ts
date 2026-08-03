import { clamp, lerp } from "./math";
import { VIEW_W, VIEW_H } from "./renderer";

/**
 * Smooth-follow camera with a horizontal deadzone, level-bounds clamping and
 * trauma-based screen shake (shake amplitude = trauma^2, decaying per tick).
 */
export class Camera {
  x = 0;
  y = 0;
  private prevX = 0;
  private prevY = 0;
  private trauma = 0;
  private shakeX = 0;
  private shakeY = 0;

  constructor(
    private boundsW: number,
    private boundsH: number,
  ) {}

  snapTo(cx: number, cy: number): void {
    this.x = this.prevX = clamp(cx - VIEW_W / 2, 0, Math.max(0, this.boundsW - VIEW_W));
    this.y = this.prevY = clamp(cy - VIEW_H / 2, 0, Math.max(0, this.boundsH - VIEW_H));
  }

  update(targetX: number, targetY: number): void {
    this.prevX = this.x;
    this.prevY = this.y;

    // Horizontal deadzone: only pan once the target strays from center.
    const deadzone = 24;
    const cx = this.x + VIEW_W / 2;
    let want = this.x;
    if (targetX > cx + deadzone) want = targetX - VIEW_W / 2 - deadzone;
    else if (targetX < cx - deadzone) want = targetX - VIEW_W / 2 + deadzone;
    this.x = lerp(this.x, want, 0.18);
    this.y = lerp(this.y, targetY - VIEW_H / 2 - 16, 0.12);

    this.x = clamp(this.x, 0, Math.max(0, this.boundsW - VIEW_W));
    this.y = clamp(this.y, 0, Math.max(0, this.boundsH - VIEW_H));

    this.trauma = Math.max(0, this.trauma - 0.035);
    const amp = this.trauma * this.trauma * 7;
    this.shakeX = (Math.random() * 2 - 1) * amp;
    this.shakeY = (Math.random() * 2 - 1) * amp;
  }

  /** Add shake; small hits ~0.3, heavy impacts ~0.6. */
  addShake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Interpolated integer render position for pixel-snapped drawing. */
  renderX(alpha: number): number {
    return Math.round(lerp(this.prevX, this.x, alpha) + this.shakeX);
  }

  renderY(alpha: number): number {
    return Math.round(lerp(this.prevY, this.y, alpha) + this.shakeY);
  }
}
