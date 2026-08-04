import { Enemy } from "./enemy";
import type { Game } from "../../game";
import { moveBody, groundAhead } from "../../world/collision";
import { buildFishmanSprites, type SpriteSet } from "../../gfx/sprites";
import { TILE } from "../../gfx/tiles";
import { PAL } from "../../gfx/palette";
import { statsFor } from "../../rpg/bestiary";
import { audio } from "../../engine/audio";

const GRAVITY_AIR = 0.24;
const GRAVITY_WATER = 0.14;
const WALK = 0.55;
const SWIM = 0.7;
const LEAP_VY = -5.4;
const LEAP_VX = 1.55;
const SPIT_CD = 85;
const LEAP_CD = 110;
const LAND_TICKS = 100;

type Mode = "walk" | "swim" | "leap" | "land";

/**
 * Classic Castlevania merman:
 *  - patrols the flooded floor
 *  - swims up toward the surface when the player is near
 *  - leaps out of the water in an arc (the signature move)
 *  - walks/spits briefly on land, then falls or re-enters the water
 */
export class Fishman extends Enemy {
  private static sprites: SpriteSet | null = null;
  private animTick = 0;
  private turnCooldown = 0;
  private spitCooldown = 40 + Math.floor(Math.random() * 50);
  private leapCooldown = 30 + Math.floor(Math.random() * 40);
  private landTimer = 0;
  private mode: Mode = "walk";

  constructor(x: number, y: number, flags?: Set<string>) {
    super(x - 7, y - 32, 14, 32, statsFor("fishman", flags), "fishman");
    Fishman.sprites ??= buildFishmanSprites();
    this.facing = Math.random() < 0.5 ? 1 : -1;
  }

  update(game: Game): void {
    this.tickBase();
    this.animTick++;
    if (this.turnCooldown > 0) this.turnCooldown--;
    if (this.spitCooldown > 0) this.spitCooldown--;
    if (this.leapCooldown > 0) this.leapCooldown--;

    const p = game.player;
    const dx = p.centerX - this.centerX;
    const dy = p.centerY - this.centerY;
    const col = Math.floor(this.centerX / TILE);
    const footRow = Math.floor((this.body.y + this.body.h - 1) / TILE);
    const midRow = Math.floor(this.centerY / TILE);
    const wet = game.map.isWater(col, midRow) || game.map.isWater(col, footRow);
    const nearSurface = this.nearWaterSurface(game, col, midRow);
    const playerAlive = p.state.name !== "die";
    const nearPlayer = playerAlive && Math.abs(dx) < 150 && Math.abs(dy) < 140;

    // --- LEAP: airborne arc after bursting from the water ---
    if (this.mode === "leap") {
      this.body.vy = Math.min(this.body.vy + GRAVITY_AIR, 6);
      moveBody(this.body, game.map);

      // Face player while airborne; spit mid-jump (classic fireball).
      if (playerAlive && Math.abs(dx) > 8) {
        this.facing = (dx >= 0 ? 1 : -1) as 1 | -1;
      }
      this.trySpit(game, dx, dy, true);

      if (this.body.onGround) {
        const landedWet =
          game.map.isWater(Math.floor(this.centerX / TILE), Math.floor((this.body.y + this.body.h + 2) / TILE)) ||
          game.map.isWater(Math.floor(this.centerX / TILE), Math.floor(this.centerY / TILE));
        if (landedWet) {
          this.mode = "walk";
          this.leapCooldown = LEAP_CD;
        } else {
          this.mode = "land";
          this.landTimer = LAND_TICKS;
          this.body.vx = this.facing * WALK;
        }
      }
      return;
    }

    // --- LAND: brief shore patrol after a successful leap ---
    if (this.mode === "land") {
      this.landTimer--;
      this.body.vy = Math.min(this.body.vy + GRAVITY_AIR, 6);
      if (Math.abs(this.body.vx) <= WALK + 0.01) this.body.vx = this.facing * WALK;
      else this.body.vx *= 0.9;
      const beforeVx = this.body.vx;
      moveBody(this.body, game.map);

      if (playerAlive && Math.abs(dx) > 10) {
        this.facing = (dx >= 0 ? 1 : -1) as 1 | -1;
      }
      this.trySpit(game, dx, dy, false);

      if (this.body.onGround && this.turnCooldown === 0) {
        const hitWall = beforeVx !== 0 && this.body.vx === 0;
        if (hitWall || !groundAhead(this.body, game.map, this.facing)) {
          this.facing = -this.facing as 1 | -1;
          this.turnCooldown = 12;
        }
      }

      // Fell back into water or timer expired → return to aquatic AI.
      const nowWet = game.map.isWater(
        Math.floor(this.centerX / TILE),
        Math.floor(this.centerY / TILE),
      );
      if (nowWet || this.landTimer <= 0) {
        this.mode = nowWet ? "walk" : "land";
        if (nowWet) {
          this.mode = "walk";
          this.leapCooldown = LEAP_CD;
        } else if (this.landTimer <= 0) {
          // Hop back toward water / player
          this.facing = (dx >= 0 ? 1 : -1) as 1 | -1;
          this.body.vy = -3.2;
          this.body.vx = this.facing * 1.1;
          this.mode = "leap";
          this.leapCooldown = LEAP_CD;
        }
      }
      return;
    }

    // --- Underwater: walk floor or swim up to leap ---
    if (wet && nearPlayer && nearSurface && this.leapCooldown === 0 && dy < 40) {
      this.beginLeap(game, dx);
      return;
    }

    // Swim upward when player is above and we're still deep.
    if (wet && nearPlayer && dy < -16 && !nearSurface) {
      this.mode = "swim";
    } else if (this.body.onGround || Math.abs(dy) < 10) {
      this.mode = "walk";
    }

    if (this.mode === "swim" && wet) {
      this.body.vy = Math.min(this.body.vy + GRAVITY_WATER * 0.5, 1.0);
      // Surge toward surface + horizontal track.
      this.body.vy -= SWIM * 0.12;
      const dir = (dx >= 0 ? 1 : -1) as 1 | -1;
      this.facing = dir;
      this.body.vx += (dir * SWIM - this.body.vx) * 0.14;
      this.body.x += this.body.vx;
      this.body.y += this.body.vy;

      // Soft clamp: if we left water while swimming, either leap or drop walk.
      const stillWet = game.map.isWater(
        Math.floor(this.centerX / TILE),
        Math.floor(this.centerY / TILE),
      );
      if (!stillWet) {
        this.beginLeap(game, dx);
        return;
      }
      // Close enough to surface → commit the jump.
      if (this.nearWaterSurface(game, Math.floor(this.centerX / TILE), Math.floor(this.centerY / TILE))) {
        if (this.leapCooldown === 0 && nearPlayer) {
          this.beginLeap(game, dx);
          return;
        }
      }
    } else {
      // Bottom patrol with light underwater gravity.
      this.body.vy = Math.min(this.body.vy + (wet ? GRAVITY_WATER : GRAVITY_AIR), wet ? 1.6 : 6);
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

    // Spit while submerged only if roughly level with the player.
    if (wet) this.trySpit(game, dx, dy, false);
  }

  /** Burst from the water toward the player — the signature merman leap. */
  private beginLeap(game: Game, dx: number): void {
    const dir = (dx >= 0 ? 1 : -1) as 1 | -1;
    this.facing = dir;
    this.body.vx = dir * LEAP_VX;
    this.body.vy = LEAP_VY;
    this.mode = "leap";
    this.leapCooldown = LEAP_CD;
    this.spitCooldown = Math.min(this.spitCooldown, 20);
    audio.play("splash");
    // Splash ring at feet
    const y = this.body.y + this.body.h;
    for (let i = 0; i < 8; i++) {
      game.spawnParticle(this.centerX + (Math.random() * 14 - 7), y, {
        vx: Math.random() * 1.8 - 0.9,
        vy: -Math.random() * 1.6 - 0.4,
        life: 12 + Math.floor(Math.random() * 10),
        color: i % 2 === 0 ? PAL.waterHi : PAL.waterMid,
        size: i % 3 === 0 ? 2 : 1,
      });
    }
  }

  private trySpit(game: Game, dx: number, dy: number, aerial: boolean): void {
    if (this.spitCooldown > 0 || game.player.state.name === "die") return;
    const maxDy = aerial ? 80 : 36;
    if (Math.abs(dy) > maxDy) return;
    const dir = (dx >= 0 ? 1 : -1) as 1 | -1;
    if (dir !== this.facing) return;
    if (Math.abs(dx) < 20 || Math.abs(dx) > 180) return;
    game.spawnHostile("spit", this.centerX + dir * 8, this.centerY - 2, dir, 8);
    this.spitCooldown = SPIT_CD;
  }

  /**
   * True when the body is in/near a WaterTop row (ready to breach).
   * Looks up to 2 tiles above center for a surface marker.
   */
  private nearWaterSurface(game: Game, col: number, row: number): boolean {
    for (let r = row - 2; r <= row + 1; r++) {
      if (game.map.isWaterTop(col, r)) {
        // Center is within ~1.5 tiles of the surface row.
        const surfaceY = r * TILE + TILE * 0.5;
        return Math.abs(this.centerY - surfaceY) < TILE * 1.6;
      }
      // No WaterTop tile in map: treat topmost water cell in column as surface.
    }
    // Fallback: above us is air, we are still in water → at surface.
    const above = game.map.isWater(col, row - 1);
    const here = game.map.isWater(col, row);
    return here && !above;
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, alpha: number): void {
    const sprites = Fishman.sprites!;
    const set = this.facing > 0 ? sprites.right : sprites.left;
    // Faster flap while leaping / swimming.
    const rate = this.mode === "leap" || this.mode === "swim" ? 6 : 12;
    const frame = set[Math.floor(this.animTick / rate) % set.length];
    const x = this.renderX(alpha) + this.body.w / 2 - frame.width / 2 - camX;
    const y = this.renderY(alpha) + this.body.h - frame.height - camY;
    this.drawFrame(ctx, frame, x, y);
  }
}
