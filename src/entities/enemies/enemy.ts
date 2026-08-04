import { Entity } from "../entity";
import type { Game } from "../../game";
import { audio } from "../../engine/audio";
import { chance, randInt } from "../../engine/math";
import { PAL } from "../../gfx/palette";
import { damageText, type DamageResult } from "../../combat/damage";
import type { BestiaryId } from "../../rpg/bestiary";

export interface EnemyStats {
  hp: number;
  defense: number;
  touchPower: number; // raw attack value for contact damage
  exp: number;
  goldChance: number;
  heartChance: number;
}

export abstract class Enemy extends Entity {
  hp: number;
  hurtFlash = 0;
  /** When set, first kill (and first hit) unlocks the enemy book entry. */
  readonly bestiaryId: BestiaryId | null;

  constructor(
    x: number,
    y: number,
    w: number,
    h: number,
    readonly stats: EnemyStats,
    bestiaryId: BestiaryId | null = null,
  ) {
    super(x, y, w, h);
    this.hp = stats.hp;
    this.bestiaryId = bestiaryId;
  }

  /** Apply an already-computed damage roll (crit decided by the attacker). */
  takeDamage(game: Game, result: DamageResult, fromX: number): void {
    // Encounter unlock — you've struck this foe at least once.
    if (this.bestiaryId) game.flags.add(`bestiary:${this.bestiaryId}`);
    this.hp -= result.amount;
    this.hurtFlash = 8;
    game.texts.push(damageText(this.centerX, this.body.y - 4, result));
    game.camera.addShake(result.crit ? 0.4 : 0.22);
    game.hitstop(result.crit ? 5 : 3);
    audio.play(result.crit ? "crit" : "hit");
    this.onHit(fromX);
    if (this.hp <= 0) this.die(game);
  }

  /** Knockback hook — flyers and walkers react differently. */
  protected onHit(fromX: number): void {
    this.body.vx = this.centerX < fromX ? -1.2 : 1.2;
  }

  protected die(game: Game): void {
    this.dead = true;
    if (this.bestiaryId) game.flags.add(`bestiary:${this.bestiaryId}`);
    game.player.gainExp(game, this.stats.exp);
    // Death burst
    for (let i = 0; i < 10; i++) {
      game.spawnParticle(this.centerX, this.centerY, {
        vx: Math.random() * 2.4 - 1.2,
        vy: -Math.random() * 2 - 0.4,
        life: randInt(16, 30),
        color: i % 3 === 0 ? PAL.eyeRed : PAL.bone,
        size: i % 2 === 0 ? 2 : 1,
      });
    }
    if (chance(this.stats.goldChance)) game.spawnPickup("gold", this.centerX, this.body.y + this.body.h);
    else if (chance(this.stats.heartChance)) game.spawnPickup("heart", this.centerX, this.body.y + this.body.h);
  }

  /** Shared per-tick bookkeeping; subclasses call at the top of update. */
  protected tickBase(): void {
    this.savePrev();
    if (this.hurtFlash > 0) this.hurtFlash--;
  }

  /** Draw with a white-silhouette flash for the first ticks after being hit. */
  protected drawFrame(
    ctx: CanvasRenderingContext2D,
    frame: HTMLCanvasElement,
    x: number,
    y: number,
  ): void {
    if (this.hurtFlash > 4) {
      ctx.save();
      ctx.filter = "brightness(0) invert(1)";
      ctx.drawImage(frame, Math.round(x), Math.round(y));
      ctx.restore();
    } else {
      ctx.drawImage(frame, Math.round(x), Math.round(y));
    }
  }
}
