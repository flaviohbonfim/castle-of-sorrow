import { Entity } from "./entity";
import type { Game } from "../game";
import { TILE } from "../gfx/tiles";
import { Swing } from "../combat/hitbox";
import { buildSubweaponSprites, buildBoneSprites } from "../gfx/sprites";
import { PAL } from "../gfx/palette";
import { rectsOverlap } from "../engine/math";

export type ProjectileKind = "dagger" | "axe" | "spell" | "fire" | "bone" | "spit" | "axeThrow";

let SPRITES: ReturnType<typeof buildSubweaponSprites> | null = null;
let BONES: HTMLCanvasElement[] | null = null;

/**
 * Thrown sub-weapons, spells and enemy shots.
 *  - dagger: fast, flat, dies on first hit or wall (player)
 *  - axe: arcing spinner, pierces enemies, ignores walls (player)
 *  - spell "Soul Lance": piercing bolt, INT-scaled (player)
 *  - fire "Hellfire": arcing fireball, pierces, INT-scaled (player)
 *  - bone: arcing bone toss that damages the player (hostile)
 *  - spit: flat, slow hostile blob (Fishman); dies on walls
 *  - axeThrow: arcing hostile axe (Axe Knight); pierces terrain
 */
export class Projectile extends Entity {
  private swing = new Swing();
  private age = 0;
  power: number;

  constructor(
    readonly kind: ProjectileKind,
    x: number,
    y: number,
    dir: 1 | -1,
    power: number,
    readonly hostile = false,
    vyBoost = 0,
  ) {
    super(
      x - (kind === "spell" ? 8 : kind === "spit" ? 3 : 5),
      y - (kind === "spell" ? 4 : kind === "spit" ? 2 : 3),
      kind === "spell" ? 16 : kind === "spit" ? 6 : 10,
      kind === "spell" ? 8 : kind === "spit" ? 4 : 6,
    );
    SPRITES ??= buildSubweaponSprites();
    BONES ??= buildBoneSprites();
    this.facing = dir;
    this.power = power;
    switch (kind) {
      case "dagger": this.body.vx = dir * 5.5; break;
      case "axe":
        this.body.vx = dir * 2.2;
        this.body.vy = -5.2;
        break;
      case "spell": this.body.vx = dir * 3.4; break;
      case "fire":
        this.body.vx = dir * 2.6;
        this.body.vy = -2.2 + vyBoost;
        break;
      case "bone":
        this.body.vx = dir * 1.9;
        this.body.vy = -4.6 + vyBoost;
        break;
      case "spit":
        this.body.vx = dir * 1.7;
        this.body.vy = vyBoost; // optional vertical offset for volleys
        break;
      case "axeThrow":
        this.body.vx = dir * 2.0;
        this.body.vy = -4.4 + vyBoost;
        break;
    }
  }

  update(game: Game): void {
    this.savePrev();
    this.age++;

    if (this.kind === "axe" || this.kind === "bone" || this.kind === "axeThrow") {
      this.body.vy = Math.min(this.body.vy + 0.22, 7);
    } else if (this.kind === "fire") {
      this.body.vy = Math.min(this.body.vy + 0.09, 4);
    }
    this.body.x += this.body.vx;
    this.body.y += this.body.vy;

    // Lifetime / bounds
    const map = game.map;
    if (
      this.body.x < -20 || this.body.x > map.widthPx + 20 ||
      this.body.y > map.heightPx + 20 || this.age > 170 ||
      (this.kind === "spell" && this.age > 55)
    ) {
      this.dead = true;
      return;
    }

    // Daggers and spit stop at walls; everything else pierces terrain.
    if (this.kind === "dagger" || this.kind === "spit") {
      const col = Math.floor((this.body.x + (this.facing > 0 ? this.body.w : 0)) / TILE);
      const row = Math.floor(this.centerY / TILE);
      if (map.isSolid(col, row)) {
        this.dead = true;
        this.impactSparks(game, this.kind === "spit" ? PAL.waterHi : PAL.bladeHi);
        return;
      }
    }

    if (this.hostile) {
      // Enemy shot: hurts the player on contact.
      if (rectsOverlap(this.body, game.player.body) && game.player.form !== "mist") {
        game.player.takeDamage(game, this.power, this.centerX);
        this.dead = true;
      }
    } else {
      // Damage pass — the Game routes this swing to enemies and candles.
      game.applySwing(this.swing, this.body, this.power, this.centerX, () => {
        if (this.kind === "dagger") {
          this.dead = true;
          this.impactSparks(game, PAL.bladeHi);
        }
      });
    }

    // Trails
    if (this.kind === "spell" && this.age % 2 === 0) {
      game.spawnParticle(this.centerX - this.facing * 6, this.centerY, {
        vx: -this.facing * 0.3,
        vy: (Math.random() - 0.5) * 0.6,
        life: 16,
        color: Math.random() < 0.5 ? PAL.spellCyan : PAL.spellWhite,
        size: 1,
      });
    }
    if (this.kind === "fire" && this.age % 2 === 0) {
      game.spawnParticle(this.centerX, this.centerY, {
        vx: (Math.random() - 0.5) * 0.5,
        vy: -0.4 - Math.random() * 0.4,
        life: 12,
        color: Math.random() < 0.5 ? PAL.flameMid : PAL.flameCore,
        size: 1,
      });
    }
  }

  private impactSparks(game: Game, color: string): void {
    for (let i = 0; i < 4; i++) {
      game.spawnParticle(this.centerX, this.centerY, {
        vx: -this.facing * Math.random() * 1.5,
        vy: (Math.random() - 0.5) * 1.6,
        life: 10,
        color,
        size: 1,
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, alpha: number): void {
    const s = SPRITES!;
    const x = this.renderX(alpha);
    const y = this.renderY(alpha);
    if (this.kind === "dagger") {
      const frame = this.facing > 0 ? s.dagger.right[0] : s.dagger.left[0];
      ctx.drawImage(frame, Math.round(x - camX), Math.round(y - camY));
    } else if (this.kind === "axe" || this.kind === "axeThrow") {
      const frame = s.axe[Math.floor(this.age / 4) % s.axe.length];
      ctx.drawImage(frame, Math.round(x - camX), Math.round(y - camY));
    } else if (this.kind === "bone") {
      const frame = BONES![Math.floor(this.age / 6) % BONES!.length];
      ctx.drawImage(frame, Math.round(x - camX), Math.round(y - camY));
    } else if (this.kind === "spit") {
      const cx = x + this.body.w / 2 - camX;
      const cy = y + this.body.h / 2 - camY;
      ctx.fillStyle = PAL.waterHi;
      ctx.fillRect(Math.round(cx - 2), Math.round(cy - 2), 4, 4);
      ctx.fillStyle = PAL.spellCyan;
      ctx.fillRect(Math.round(cx - 1), Math.round(cy - 1), 2, 2);
    } else {
      // Glowing bolt (Soul Lance cyan / Hellfire orange).
      const fire = this.kind === "fire";
      const cx = x + this.body.w / 2 - camX;
      const cy = y + this.body.h / 2 - camY;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, 10);
      if (fire) {
        grad.addColorStop(0, "rgba(255, 240, 160, 0.95)");
        grad.addColorStop(0.4, "rgba(255, 160, 48, 0.55)");
        grad.addColorStop(1, "rgba(224, 64, 16, 0)");
      } else {
        grad.addColorStop(0, "rgba(220, 250, 255, 0.9)");
        grad.addColorStop(0.4, "rgba(96, 208, 255, 0.5)");
        grad.addColorStop(1, "rgba(96, 208, 255, 0)");
      }
      ctx.fillStyle = grad;
      ctx.fillRect(cx - 10, cy - 10, 20, 20);
      ctx.fillStyle = fire ? PAL.flameCore : PAL.spellWhite;
      ctx.fillRect(Math.round(cx - (fire ? 3 : 5)), Math.round(cy - 1), fire ? 6 : 10, 2);
      ctx.restore();
    }
  }
}
