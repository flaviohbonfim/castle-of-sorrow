import { resolvePropSprites } from "../gfx/resolveSprites";
import type { PropId } from "../gfx/sprites";

let SPRITES: ReturnType<typeof resolvePropSprites> | null = null;

/**
 * Decorative scenery prop — no collision, no interaction.
 * Feet at (x, y) world space; drawn centre-x / feet-aligned like entities.
 */
export class Prop {
  private animTick = Math.floor(Math.random() * 40);

  constructor(
    readonly id: PropId,
    /** Feet center X (world px). */
    readonly x: number,
    /** Feet Y (world px). */
    readonly y: number,
    /** 1 = face right / hang natural, -1 = mirror (for paired banners). */
    readonly facing: 1 | -1 = 1,
  ) {
    SPRITES ??= resolvePropSprites();
  }

  update(): void {
    this.animTick++;
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const s = SPRITES!;
    const frames = s[this.id];
    if (!frames || frames.length === 0) return;
    // Chandelier gently sways between frames; others are static (or 1-frame).
    const rate = this.id === "chandelier" ? 14 : 20;
    const frame = frames[Math.floor(this.animTick / rate) % frames.length];
    const w = frame.width;
    const h = frame.height;
    const dx = Math.round(this.x - w / 2 - camX);
    const dy = Math.round(this.y - h - camY);

    if (this.facing < 0) {
      ctx.save();
      ctx.translate(dx + w, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(frame, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(frame, dx, dy);
    }
  }

  /** Soft glow for lit props (chandelier). */
  drawGlow(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    if (this.id !== "chandelier") return;
    const frames = SPRITES![this.id];
    const h = frames[0]?.height ?? 24;
    const gx = this.x - camX;
    const gy = this.y - h * 0.45 - camY;
    const flicker = 18 + Math.sin(this.animTick * 0.18) * 3;
    const grad = ctx.createRadialGradient(gx, gy, 2, gx, gy, flicker);
    grad.addColorStop(0, "rgba(255, 190, 90, 0.4)");
    grad.addColorStop(0.5, "rgba(255, 100, 40, 0.12)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(gx - flicker, gy - flicker, flicker * 2, flicker * 2);
  }
}
