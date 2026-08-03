import { Enemy } from "./enemy";
import type { Game } from "../../game";
import { moveBody, groundAhead } from "../../world/collision";
import { buildFishmanSprites, type SpriteSet } from "../../gfx/sprites";
import { TILE } from "../../gfx/tiles";
import { statsFor } from "../../rpg/bestiary";

const GRAVITY = 0.18;
const WALK = 0.5;
const SWIM_UP = 0.85;
const SPIT_CD = 90;

/**
 * Classic Castlevania merman: patrols the underwater floor, surges upward
 * when the player is above, and spits a slow flat projectile.
 */
export class Fishman extends Enemy {
  private static sprites: SpriteSet | null = null;
  private animTick = 0;
  private turnCooldown = 0;
  private spitCooldown = 40 + Math.floor(Math.random() * 40);
  private mode: "walk" | "swim" = "walk";

  constructor(x: number, y: number, flags?: Set<string>) {
    super(x - 7, y - 22, 14, 22, statsFor("fishman", flags));
    Fishman.sprites ??= buildFishmanSprites();
    this.facing = Math.random() < 0.5 ? 1 : -1;
  }

  update(game: Game): void {
    this.tickBase();
    this.animTick++;
    if (this.turnCooldown > 0) this.turnCooldown--;
    if (this.spitCooldown > 0) this.spitCooldown--;

    const p = game.player;
    const dx = p.centerX - this.centerX;
    const dy = p.centerY - this.centerY;
    const col = Math.floor(this.centerX / TILE);
    const row = Math.floor(this.centerY / TILE);
    const wet = game.map.isWater(col, row);

    // Surge toward the player when they are above and nearby.
    if (wet && dy < -12 && Math.abs(dx) < 120 && p.state.name !== "die") {
      this.mode = "swim";
    } else if (this.body.onGround || Math.abs(dy) < 8) {
      this.mode = "walk";
    }

    if (this.mode === "swim" && wet) {
      this.body.vy = Math.min(this.body.vy + GRAVITY * 0.4, 1.0);
      this.body.vy += (Math.sin(this.animTick * 0.12) * 0.15) - SWIM_UP * 0.08;
      // Drift toward player horizontally while swimming.
      const dir = dx >= 0 ? 1 : -1;
      this.facing = dir as 1 | -1;
      this.body.vx += (dir * WALK - this.body.vx) * 0.12;
      this.body.x += this.body.vx;
      this.body.y += this.body.vy;
      // Soft clamp inside water column (no solid floor resolution while free-swimming).
      if (!game.map.isWater(Math.floor(this.centerX / TILE), Math.floor(this.centerY / TILE))) {
        this.mode = "walk";
      }
    } else {
      // Bottom patrol with light underwater gravity.
      this.body.vy = Math.min(this.body.vy + GRAVITY, wet ? 1.5 : 6);
      if (Math.abs(this.body.vx) <= WALK + 0.01) {
        this.body.vx = this.facing * WALK;
      } else {
        this.body.vx *= 0.85;
      }
      const beforeVx = this.body.vx;
      moveBody(this.body, game.map);
      if (this.body.onGround && this.turnCooldown === 0) {
        const hitWall = beforeVx !== 0 && this.body.vx === 0;
        if (hitWall || !groundAhead(this.body, game.map, this.facing)) {
          this.facing = -this.facing as 1 | -1;
          this.turnCooldown = 16;
        }
      }
    }

    // Spit when facing the player with a clear line.
    if (this.spitCooldown === 0 && p.state.name !== "die" && Math.abs(dy) < 40) {
      const dir = (dx >= 0 ? 1 : -1) as 1 | -1;
      if (dir === this.facing && Math.abs(dx) < 160 && Math.abs(dx) > 24) {
        game.spawnHostile("spit", this.centerX + dir * 8, this.centerY - 2, dir, 8);
        this.spitCooldown = SPIT_CD;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, alpha: number): void {
    const sprites = Fishman.sprites!;
    const set = this.facing > 0 ? sprites.right : sprites.left;
    const frame = set[Math.floor(this.animTick / 12) % set.length];
    const x = this.renderX(alpha) + this.body.w / 2 - frame.width / 2 - camX;
    const y = this.renderY(alpha) + this.body.h - frame.height - camY;
    this.drawFrame(ctx, frame, x, y);
  }
}
