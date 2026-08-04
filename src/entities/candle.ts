import { Entity } from "./entity";
import type { Game } from "../game";
import { audio } from "../engine/audio";
import { chance } from "../engine/math";
import { resolveCandleSprites } from "../gfx/resolveSprites";
import { PAL } from "../gfx/palette";

let SPRITES: ReturnType<typeof resolveCandleSprites> | null = null;

/**
 * Breakable candelabra. One hit from anything shatters it and drops a heart
 * (mostly) or gold — the classic Castlevania resource loop.
 */
export class Candle extends Entity {
  private animTick = Math.floor(Math.random() * 60);

  constructor(x: number, y: number) {
    super(x - 3, y - 12, 6, 12); // bottom-center anchor
    SPRITES ??= resolveCandleSprites();
  }

  smash(game: Game): void {
    if (this.dead) return;
    this.dead = true;
    audio.play("candle");
    for (let i = 0; i < 8; i++) {
      game.spawnParticle(this.centerX, this.body.y + 3, {
        vx: Math.random() * 2 - 1,
        vy: -Math.random() * 1.6,
        life: 14 + Math.floor(Math.random() * 12),
        color: i % 2 === 0 ? PAL.flameMid : PAL.flameCore,
        size: 1,
      });
    }
    if (chance(0.12)) game.spawnPickup("bigHeart", this.centerX, this.body.y + this.body.h);
    else if (chance(0.72)) game.spawnPickup("heart", this.centerX, this.body.y + this.body.h);
    else game.spawnPickup("gold", this.centerX, this.body.y + this.body.h);
  }

  update(_game: Game): void {
    this.animTick++;
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, _alpha: number): void {
    const s = SPRITES!;
    const frame = s.lit[Math.floor(this.animTick / 9) % s.lit.length];
    const x = Math.round(this.centerX - frame.width / 2 - camX);
    const y = Math.round(this.body.y + this.body.h - frame.height - camY);
    ctx.drawImage(frame, x, y);
  }

  /** Additive flame glow — drawn in the lighting pass. */
  drawGlow(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const gx = this.centerX - camX;
    const gy = this.body.y - camY + 1;
    const flicker = 12 + Math.sin(this.animTick * 0.21) * 2;
    const grad = ctx.createRadialGradient(gx, gy, 1, gx, gy, flicker);
    grad.addColorStop(0, "rgba(255, 190, 90, 0.55)");
    grad.addColorStop(1, "rgba(255, 120, 20, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(gx - flicker, gy - flicker, flicker * 2, flicker * 2);
  }
}
