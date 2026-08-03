import { Enemy } from "./enemy";
import type { Game } from "../../game";
import { audio } from "../../engine/audio";
import { PAL } from "../../gfx/palette";
import { buildWraithSprites, type SpriteSet } from "../../gfx/sprites";
import { MedusaHead } from "./medusaHead";

type Mode = "idle" | "fadeOut" | "fadeIn" | "volley" | "summon";

/**
 * Clockwork Wraith — second boss. Teleports with particle fade, fires 3-way
 * spit volleys, and summons a Medusa Head once below half HP.
 */
export class ClockworkWraith extends Enemy {
  private static sprites: SpriteSet | null = null;
  private animTick = 0;
  private mode: Mode = "idle";
  private modeTicks = 0;
  private cooldown = 70;
  private summoned = false;
  private alpha = 1;
  readonly maxHp: number;
  readonly displayName = "CLOCKWORK WRAITH";
  readonly bossId = "wraith";

  constructor(x: number, y: number) {
    super(x - 12, y - 36, 24, 36, {
      hp: 220,
      defense: 5,
      touchPower: 16,
      exp: 200,
      goldChance: 1,
      heartChance: 0,
    });
    this.maxHp = this.stats.hp;
    ClockworkWraith.sprites ??= buildWraithSprites();
    this.facing = -1;
  }

  private get enraged(): boolean {
    return this.hp < this.maxHp / 2;
  }

  protected override onHit(_fromX: number): void {
    // Ethereal — no knockback.
  }

  update(game: Game): void {
    this.tickBase();
    this.animTick++;
    this.modeTicks++;
    const p = game.player;
    const dx = p.centerX - this.centerX;
    this.facing = dx >= 0 ? 1 : -1;
    this.body.vx = 0;
    this.body.vy = 0;

    // Hover bob while visible.
    if (this.mode === "idle" || this.mode === "volley") {
      this.body.y += Math.sin(this.animTick * 0.08) * 0.15;
    }

    switch (this.mode) {
      case "idle": {
        this.alpha = 1;
        if (--this.cooldown <= 0) {
          // Prefer teleport, occasionally volley in place when close.
          if (Math.abs(dx) < 70 && Math.random() < 0.35) {
            this.mode = "volley";
            this.modeTicks = 0;
          } else {
            this.mode = "fadeOut";
            this.modeTicks = 0;
            audio.play("spell");
          }
        }
        break;
      }
      case "fadeOut": {
        this.alpha = Math.max(0, 1 - this.modeTicks / 18);
        this.puff(game, 2);
        if (this.modeTicks >= 18) {
          this.teleportNear(game);
          this.mode = "fadeIn";
          this.modeTicks = 0;
        }
        break;
      }
      case "fadeIn": {
        this.alpha = Math.min(1, this.modeTicks / 16);
        this.puff(game, 2);
        if (this.modeTicks >= 16) {
          this.alpha = 1;
          this.mode = "volley";
          this.modeTicks = 0;
        }
        break;
      }
      case "volley": {
        this.alpha = 1;
        if (this.modeTicks === 8 || (this.enraged && this.modeTicks === 22)) {
          for (const boost of [-0.9, 0, 0.9]) {
            game.spawnHostile(
              "spit",
              this.centerX + this.facing * 8,
              this.centerY,
              this.facing,
              11,
              boost,
            );
          }
          // Give spit a slight vertical spread via vyBoost is ignored by spit —
          // fire extra vertical offsets instead.
          audio.play("throw");
        }
        if (this.modeTicks === 10) {
          // Arc variants using bone for vertical spread when enraged.
          if (this.enraged) {
            for (const boost of [-1.4, 0.6]) {
              game.spawnHostile(
                "bone",
                this.centerX + this.facing * 6,
                this.body.y + 4,
                this.facing,
                10,
                boost,
              );
            }
          }
        }
        if (this.modeTicks >= (this.enraged ? 36 : 28)) {
          if (this.enraged && !this.summoned) {
            this.mode = "summon";
            this.modeTicks = 0;
          } else {
            this.endAction();
          }
        }
        break;
      }
      case "summon": {
        if (this.modeTicks === 6 && !this.summoned) {
          this.summoned = true;
          const head = new MedusaHead(this.centerX, this.body.y + 8, this.facing);
          game.spawnEnemy(head);
          audio.play("spell");
          game.camera.addShake(0.35);
          this.puff(game, 10);
        }
        if (this.modeTicks >= 24) this.endAction();
        break;
      }
    }
  }

  private endAction(): void {
    this.mode = "idle";
    this.modeTicks = 0;
    this.cooldown = this.enraged ? 48 : 78;
  }

  private teleportNear(game: Game): void {
    const map = game.map;
    const p = game.player;
    // Pick a side of the player with room to stand.
    const side = Math.random() < 0.5 ? -1 : 1;
    let nx = p.centerX + side * (70 + Math.random() * 50);
    nx = Math.max(40, Math.min(map.widthPx - 40, nx));
    const feetY = Math.min(map.heightPx - 24, Math.max(48, p.body.y + p.body.h));
    this.body.x = nx - this.body.w / 2;
    this.body.y = feetY - this.body.h - 8;
  }

  private puff(game: Game, n: number): void {
    for (let i = 0; i < n; i++) {
      game.spawnParticle(this.centerX + (Math.random() - 0.5) * 20, this.centerY + (Math.random() - 0.5) * 24, {
        vx: (Math.random() - 0.5) * 1.4,
        vy: (Math.random() - 0.5) * 1.4,
        life: 12 + Math.floor(Math.random() * 10),
        color: i % 2 === 0 ? PAL.spellCyan : PAL.towerStoneHi,
        size: 1,
      });
    }
  }

  protected override die(game: Game): void {
    super.die(game);
    game.onBossDefeated(this.bossId);
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, alpha: number): void {
    if (this.alpha <= 0.02) return;
    const sprites = ClockworkWraith.sprites!;
    const set = this.facing > 0 ? sprites.right : sprites.left;
    const frame = set[Math.floor(this.animTick / 10) % set.length];
    const x = this.renderX(alpha) + this.body.w / 2 - frame.width / 2 - camX;
    const y = this.renderY(alpha) + this.body.h - frame.height - camY;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    this.drawFrame(ctx, frame, x, y);
    ctx.restore();
  }
}
