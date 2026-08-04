import { Entity } from "./entity";
import type { Game } from "../game";
import { TILE } from "../gfx/tiles";
import { Swing } from "../combat/hitbox";
import { buildSubweaponSprites, buildBoneSprites } from "../gfx/sprites";
import { PAL } from "../gfx/palette";
import { rectsOverlap } from "../engine/math";

export type ProjectileKind =
  | "dagger"
  | "axe"
  | "spell"
  | "fire"
  | "batFire"
  | "bone"
  | "spit"
  | "axeThrow"
  | "blood";

let SPRITES: ReturnType<typeof buildSubweaponSprites> | null = null;
let BONES: HTMLCanvasElement[] | null = null;

/**
 * Thrown sub-weapons, spells and enemy shots.
 *  - dagger: fast, flat, dies on first hit or wall (player)
 *  - axe: arcing spinner, pierces enemies, ignores walls (player)
 *  - spell "Soul Lance": piercing bolt, INT-scaled (player)
 *  - fire "Hellfire": arcing fireball, pierces, INT-scaled (player)
 *  - batFire: flat bat-form fireball (player); dies on walls
 *  - bone: arcing bone toss that damages the player (hostile)
 *  - spit: flat, slow hostile blob (Fishman); dies on walls
 *  - axeThrow: arcing hostile axe (Axe Knight); pierces terrain
 *  - blood: flat hostile blood bolt (Dracula)
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
    const isSpell = kind === "spell";
    const isTiny = kind === "spit" || kind === "blood";
    const isBat = kind === "batFire";
    super(
      x - (isSpell ? 8 : isTiny ? 3 : isBat ? 4 : 5),
      y - (isSpell ? 4 : isTiny ? 2 : isBat ? 4 : 3),
      isSpell ? 16 : isTiny ? 6 : isBat ? 10 : 10,
      isSpell ? 8 : isTiny ? 4 : isBat ? 8 : 6,
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
      case "batFire":
        this.body.vx = dir * 3.6;
        this.body.vy = 0;
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
      case "blood":
        this.body.vx = dir * 2.4;
        this.body.vy = vyBoost;
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

    // Flat projectiles stop at walls; arcing/piercing kinds ignore terrain.
    if (this.kind === "dagger" || this.kind === "spit" || this.kind === "batFire" || this.kind === "blood") {
      const col = Math.floor((this.body.x + (this.facing > 0 ? this.body.w : 0)) / TILE);
      const row = Math.floor(this.centerY / TILE);
      if (map.isSolid(col, row)) {
        this.dead = true;
        const spark =
          this.kind === "spit"
            ? PAL.waterHi
            : this.kind === "batFire"
              ? PAL.flameMid
              : this.kind === "blood"
                ? PAL.hpRed
                : PAL.bladeHi;
        this.impactSparks(game, spark);
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
        if (this.kind === "dagger" || this.kind === "batFire") {
          this.dead = true;
          this.impactSparks(game, this.kind === "batFire" ? PAL.flameMid : PAL.bladeHi);
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
    if ((this.kind === "fire" || this.kind === "batFire") && this.age % 2 === 0) {
      game.spawnParticle(this.centerX, this.centerY, {
        vx: (Math.random() - 0.5) * 0.5,
        vy: -0.4 - Math.random() * 0.4,
        life: 12,
        color: Math.random() < 0.5 ? PAL.flameMid : PAL.flameCore,
        size: 1,
      });
    }
    if (this.kind === "blood" && this.age % 2 === 0) {
      game.spawnParticle(this.centerX, this.centerY, {
        vx: -this.facing * 0.4,
        vy: (Math.random() - 0.5) * 0.5,
        life: 10,
        color: Math.random() < 0.5 ? PAL.hpRed : PAL.hpRedHi,
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
    } else if (this.kind === "blood") {
      const cx = x + this.body.w / 2 - camX;
      const cy = y + this.body.h / 2 - camY;
      ctx.fillStyle = PAL.hpRed;
      ctx.fillRect(Math.round(cx - 3), Math.round(cy - 2), 6, 4);
      ctx.fillStyle = PAL.hpRedHi;
      ctx.fillRect(Math.round(cx - 1), Math.round(cy - 1), 3, 2);
    } else {
      // Glowing bolt (Soul Lance cyan / Hellfire + bat fire orange).
      const fire = this.kind === "fire" || this.kind === "batFire";
      const cx = x + this.body.w / 2 - camX;
      const cy = y + this.body.h / 2 - camY;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, this.kind === "batFire" ? 12 : 10);
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
