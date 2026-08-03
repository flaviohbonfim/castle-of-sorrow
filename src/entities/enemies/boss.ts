import { Enemy } from "./enemy";
import type { Game } from "../../game";
import { audio } from "../../engine/audio";
import { moveBody } from "../../world/collision";
import { buildBossSprites } from "../../gfx/sprites";
import { PAL } from "../../gfx/palette";

const GRAVITY = 0.26;

/**
 * Bone Colossus — the milestone boss. Lumbers toward the player, tosses bone
 * volleys at range and telegraphs a charging slam up close. Enrages below
 * half HP (faster walk, shorter attack cooldown). Defeat opens the gate and
 * drops the Bat & Wolf form relics.
 */
export class BoneColossus extends Enemy {
  private static sprites: ReturnType<typeof buildBossSprites> | null = null;
  private animTick = 0;
  private cooldown = 90;
  private mode: "walk" | "windup" | "charge" = "walk";
  private modeTicks = 0;
  readonly maxHp: number;
  readonly displayName = "BONE COLOSSUS";
  readonly bossId = "colossus";

  constructor(x: number, y: number) {
    super(x - 13, y - 40, 26, 40, {
      hp: 170,
      defense: 4,
      touchPower: 14,
      exp: 150,
      goldChance: 1,
      heartChance: 0,
    });
    this.maxHp = this.stats.hp;
    BoneColossus.sprites ??= buildBossSprites();
    this.facing = -1;
  }

  private get enraged(): boolean {
    return this.hp < this.maxHp / 2;
  }

  protected override onHit(_fromX: number): void {
    // Too massive for knockback.
  }

  update(game: Game): void {
    this.tickBase();
    this.animTick++;
    this.modeTicks++;
    const p = game.player;
    const dx = p.centerX - this.centerX;

    this.body.vy = Math.min(this.body.vy + GRAVITY, 6);

    switch (this.mode) {
      case "walk": {
        this.facing = dx >= 0 ? 1 : -1;
        this.body.vx = this.facing * (this.enraged ? 0.55 : 0.35);
        if (--this.cooldown <= 0) {
          this.mode = "windup";
          this.modeTicks = 0;
          this.body.vx = 0;
        }
        break;
      }
      case "windup": {
        this.body.vx = 0;
        if (this.modeTicks === 20) {
          if (Math.abs(dx) > 90) {
            // Bone volley at range.
            for (const boost of [-1.2, 0, 1.0]) {
              game.spawnHostile("bone", this.centerX + this.facing * 10, this.body.y + 6, this.facing, 12, boost);
            }
            audio.play("throw");
            this.endAttack();
          }
        }
        if (this.modeTicks >= 34) {
          // Close range: charge.
          this.mode = "charge";
          this.modeTicks = 0;
          audio.play("hurt");
        }
        break;
      }
      case "charge": {
        this.body.vx = this.facing * (this.enraged ? 3.4 : 2.7);
        const hitWall = this.body.vx !== 0;
        if (this.modeTicks > 34 || (hitWall && this.chargeBlocked(game))) {
          game.camera.addShake(0.45);
          audio.play("hit");
          this.endAttack();
        }
        break;
      }
    }

    moveBody(this.body, game.map);

    // Dust while charging
    if (this.mode === "charge" && this.animTick % 3 === 0) {
      game.spawnParticle(this.centerX - this.facing * 12, this.body.y + this.body.h - 2, {
        vx: -this.facing * (0.5 + Math.random()),
        vy: -Math.random() * 0.8,
        life: 14,
        color: PAL.stoneLight,
        size: 1,
      });
    }
  }

  private chargeBlocked(game: Game): boolean {
    const probeX = this.facing > 0 ? this.body.x + this.body.w + 2 : this.body.x - 2;
    const col = Math.floor(probeX / 16);
    const row = Math.floor(this.centerY / 16);
    return game.map.isSolid(col, row);
  }

  private endAttack(): void {
    this.mode = "walk";
    this.modeTicks = 0;
    this.cooldown = this.enraged ? 70 : 110;
  }

  protected override die(game: Game): void {
    super.die(game);
    game.onBossDefeated(this.bossId);
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, alpha: number): void {
    const s = BoneColossus.sprites!;
    const sheet = this.mode === "walk" ? s.walk : s.windup;
    const set = this.facing > 0 ? sheet.right : sheet.left;
    const frame = set[Math.floor(this.animTick / 12) % set.length];
    const bob = this.mode === "walk" ? (Math.floor(this.animTick / 12) % 2) : 0;
    const x = this.renderX(alpha) + this.body.w / 2 - frame.width / 2 - camX;
    const y = this.renderY(alpha) + this.body.h - frame.height - camY + bob;
    this.drawFrame(ctx, frame, x, y);
  }
}
