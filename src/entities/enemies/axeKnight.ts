import { Enemy } from "./enemy";
import type { Game } from "../../game";
import type { Projectile } from "../projectile";
import { moveBody, groundAhead } from "../../world/collision";
import {
  buildAxeKnightEmptySprites,
  buildAxeKnightSprites,
  type SpriteSet,
} from "../../gfx/sprites";
import { resolveSpriteSet } from "../../gfx/resolveSprites";
import { audio } from "../../engine/audio";
import { statsFor } from "../../rpg/bestiary";

const GRAVITY = 0.26;
const WALK = 0.38;
const THROW_CD = 110;

/** Armored walker that hurls arcing axes at the player. */
export class AxeKnight extends Enemy {
  private static armed: SpriteSet | null = null;
  private static empty: SpriteSet | null = null;
  private animTick = 0;
  private turnCooldown = 0;
  private throwCooldown = 50 + Math.floor(Math.random() * 40);
  /** Live thrown axe — empty hands only while this is still in flight. */
  private thrown: Projectile | null = null;

  constructor(x: number, y: number, flags?: Set<string>) {
    super(x - 8, y - 32, 16, 32, statsFor("axeKnight", flags), "axeKnight");
    AxeKnight.armed ??= resolveSpriteSet("axeKnight.walk", buildAxeKnightSprites);
    AxeKnight.empty ??= resolveSpriteSet("axeKnight.empty", buildAxeKnightEmptySprites);
    this.facing = Math.random() < 0.5 ? 1 : -1;
  }

  /** True while the thrown axe still exists (not yet dead / despawned). */
  private get axeInFlight(): boolean {
    if (!this.thrown) return false;
    if (this.thrown.dead) {
      this.thrown = null;
      return false;
    }
    return true;
  }

  update(game: Game): void {
    this.tickBase();
    this.animTick++;
    if (this.turnCooldown > 0) this.turnCooldown--;
    if (this.throwCooldown > 0) this.throwCooldown--;
    // Drop the ref as soon as the projectile dies so the held axe returns.
    void this.axeInFlight;

    this.body.vy = Math.min(this.body.vy + GRAVITY, 6);
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
        this.turnCooldown = 18;
      }
    }

    const p = game.player;
    const dx = p.centerX - this.centerX;
    if (
      this.throwCooldown === 0 &&
      !this.axeInFlight &&
      p.state.name !== "die" &&
      Math.abs(dx) < 180 &&
      Math.abs(p.centerY - this.centerY) < 50
    ) {
      const dir = (dx >= 0 ? 1 : -1) as 1 | -1;
      this.facing = dir;
      // Spawn from the hand/shoulder so the held axe appears to leave the body.
      this.thrown = game.spawnHostile(
        "axeThrow",
        this.centerX + dir * 12,
        this.body.y + 8,
        dir,
        12,
      );
      audio.play("throw");
      this.throwCooldown = THROW_CD;
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, alpha: number): void {
    const sprites = this.axeInFlight ? AxeKnight.empty! : AxeKnight.armed!;
    const set = this.facing > 0 ? sprites.right : sprites.left;
    const frame = set[Math.floor(this.animTick / 14) % set.length];
    const x = this.renderX(alpha) + this.body.w / 2 - frame.width / 2 - camX;
    const y = this.renderY(alpha) + this.body.h - frame.height - camY;
    this.drawFrame(ctx, frame, x, y);
  }
}
