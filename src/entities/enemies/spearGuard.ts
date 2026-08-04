import { Enemy } from "./enemy";
import type { Game } from "../../game";
import { moveBody, groundAhead } from "../../world/collision";
import { buildSpearGuardSprites, type SpriteSet } from "../../gfx/sprites";
import { resolveSpriteSet } from "../../gfx/resolveSprites";
import { statsFor } from "../../rpg/bestiary";

const GRAVITY = 0.26;
const WALK = 0.4;
const LUNGE = 3.2;

/**
 * Armored spear guard: patrols, then lunges when the player is in range.
 */
export class SpearGuard extends Enemy {
  private static sprites: SpriteSet | null = null;
  private animTick = 0;
  private turnCooldown = 0;
  private lungeCd = 50 + Math.floor(Math.random() * 40);
  private lunging = 0;

  constructor(x: number, y: number, flags?: Set<string>) {
    super(x - 8, y - 32, 16, 32, statsFor("spearGuard", flags), "spearGuard");
    SpearGuard.sprites ??= resolveSpriteSet("spearGuard.walk", buildSpearGuardSprites);
    this.facing = Math.random() < 0.5 ? 1 : -1;
  }

  update(game: Game): void {
    this.tickBase();
    this.animTick++;
    if (this.turnCooldown > 0) this.turnCooldown--;
    if (this.lungeCd > 0) this.lungeCd--;

    const p = game.player;
    const dx = p.centerX - this.centerX;
    const dy = p.centerY - this.centerY;

    this.body.vy = Math.min(this.body.vy + GRAVITY, 6);

    if (this.lunging > 0) {
      this.lunging--;
      this.body.vx = this.facing * LUNGE;
      if (this.lunging === 0) this.lungeCd = 70;
    } else {
      if (Math.abs(this.body.vx) <= WALK + 0.01) this.body.vx = this.facing * WALK;
      else this.body.vx *= 0.85;

      // Lunge when player is roughly level and mid-range.
      if (
        this.lungeCd === 0 &&
        p.state.name !== "die" &&
        Math.abs(dy) < 28 &&
        Math.abs(dx) > 24 &&
        Math.abs(dx) < 110
      ) {
        this.facing = (dx >= 0 ? 1 : -1) as 1 | -1;
        this.lunging = 14;
        this.body.vx = this.facing * LUNGE;
      }
    }

    const beforeVx = this.body.vx;
    moveBody(this.body, game.map);

    if (this.body.onGround && this.turnCooldown === 0 && this.lunging === 0) {
      const hitWall = beforeVx !== 0 && this.body.vx === 0;
      if (hitWall || !groundAhead(this.body, game.map, this.facing)) {
        this.facing = -this.facing as 1 | -1;
        this.turnCooldown = 14;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, alpha: number): void {
    const sprites = SpearGuard.sprites!;
    const set = this.facing > 0 ? sprites.right : sprites.left;
    const frame = set[this.lunging > 0 ? 1 : Math.floor(this.animTick / 12) % 2];
    const x = this.renderX(alpha) + this.body.w / 2 - frame.width / 2 - camX;
    const y = this.renderY(alpha) + this.body.h - frame.height - camY;
    this.drawFrame(ctx, frame, x, y);
  }
}
