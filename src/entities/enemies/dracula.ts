import { Enemy } from "./enemy";
import type { Game } from "../../game";
import { moveBody } from "../../world/collision";
import { resolveDraculaSprites } from "../../gfx/resolveSprites";
import { PAL } from "../../gfx/palette";
import { statsFor } from "../../rpg/bestiary";
import { audio } from "../../engine/audio";

const GRAVITY = 0.22;
const WALK = 0.55;

type Phase = "human" | "beast";
type Mode = "idle" | "cast" | "teleport" | "lunge" | "recover";

/**
 * Final boss — Lord of the castle.
 * Phase 1 (human): teleports, blood bolts, occasional lunge.
 * Phase 2 (beast, ≤50% HP): faster, triple volleys, aggressive lunges.
 */
export class Dracula extends Enemy {
  private static sprites: ReturnType<typeof resolveDraculaSprites> | null = null;
  private animTick = 0;
  private mode: Mode = "idle";
  private modeTicks = 0;
  private cooldown = 50;
  private phase: Phase = "human";
  readonly maxHp: number;
  readonly displayName = "DRACULA";
  readonly bossId = "dracula";

  constructor(x: number, y: number, flags?: Set<string>) {
    // Larger than wing bosses — final lord presence (sprite ~40×50).
    super(x - 14, y - 44, 28, 44, statsFor("dracula", flags), "dracula");
    this.maxHp = this.stats.hp;
    Dracula.sprites ??= resolveDraculaSprites();
    this.facing = -1;
  }

  protected override onHit(_fromX: number): void {
    // No knockback — lord of the castle.
  }

  update(game: Game): void {
    this.tickBase();
    this.animTick++;
    if (this.cooldown > 0) this.cooldown--;

    // Phase transition
    if (this.phase === "human" && this.hp <= this.maxHp * 0.5) {
      this.phase = "beast";
      this.mode = "recover";
      this.modeTicks = 40;
      this.cooldown = 20;
      audio.play("levelup");
      game.camera.addShake(0.6);
      game.hitstop(8);
      for (let i = 0; i < 20; i++) {
        game.spawnParticle(this.centerX, this.centerY, {
          vx: (Math.random() - 0.5) * 3,
          vy: (Math.random() - 0.5) * 3,
          life: 20 + Math.floor(Math.random() * 16),
          color: i % 2 === 0 ? PAL.hpRed : PAL.coatTrim,
          size: 2,
        });
      }
    }

    const p = game.player;
    const dx = p.centerX - this.centerX;
    if (Math.abs(dx) > 8 && this.mode === "idle") {
      this.facing = (dx >= 0 ? 1 : -1) as 1 | -1;
    }

    this.body.vy = Math.min(this.body.vy + GRAVITY, 6);

    switch (this.mode) {
      case "idle": {
        // Slow pace toward player
        const want = this.facing * (this.phase === "beast" ? WALK * 1.3 : WALK);
        this.body.vx += (want - this.body.vx) * 0.12;
        this.modeTicks++;
        if (this.cooldown === 0 && p.state.name !== "die") {
          this.pickAttack(game, dx);
        }
        break;
      }
      case "cast": {
        this.body.vx *= 0.8;
        this.modeTicks++;
        if (this.modeTicks === 12) this.fireVolley(game);
        if (this.modeTicks >= 28) {
          this.mode = "idle";
          this.cooldown = this.phase === "beast" ? 36 : 55;
        }
        break;
      }
      case "teleport": {
        this.body.vx = 0;
        this.modeTicks++;
        // Mid fade: reappear near player
        if (this.modeTicks === 16) {
          const side = Math.random() < 0.5 ? -1 : 1;
          const tx = p.centerX + side * (48 + Math.random() * 40);
          this.body.x = Math.max(32, Math.min(game.map.widthPx - 48, tx - this.body.w / 2));
          this.facing = (p.centerX >= this.centerX ? 1 : -1) as 1 | -1;
          this.poof(game);
        }
        if (this.modeTicks >= 28) {
          this.mode = "idle";
          this.cooldown = this.phase === "beast" ? 30 : 45;
        }
        break;
      }
      case "lunge": {
        this.modeTicks++;
        if (this.modeTicks < 8) {
          this.body.vx = 0;
        } else if (this.modeTicks < 22) {
          this.body.vx = this.facing * (this.phase === "beast" ? 4.2 : 3.4);
        } else {
          this.body.vx *= 0.85;
        }
        if (this.modeTicks >= 34) {
          this.mode = "idle";
          this.cooldown = this.phase === "beast" ? 40 : 60;
        }
        break;
      }
      case "recover": {
        this.body.vx *= 0.7;
        this.modeTicks++;
        if (this.modeTicks >= 40) this.mode = "idle";
        break;
      }
    }

    moveBody(this.body, game.map);
  }

  private pickAttack(game: Game, dx: number): void {
    const roll = Math.random();
    const abs = Math.abs(dx);
    if (roll < 0.35 || abs > 120) {
      this.mode = "cast";
      this.modeTicks = 0;
    } else if (roll < 0.65) {
      this.mode = "teleport";
      this.modeTicks = 0;
      this.poof(game);
    } else {
      this.facing = (dx >= 0 ? 1 : -1) as 1 | -1;
      this.mode = "lunge";
      this.modeTicks = 0;
    }
  }

  private fireVolley(game: Game): void {
    const dir = this.facing;
    const x = this.centerX + dir * 14;
    const y = this.centerY - 4;
    const power = this.phase === "beast" ? 16 : 13;
    if (this.phase === "beast") {
      game.spawnHostile("blood", x, y - 8, dir, power, -0.6);
      game.spawnHostile("blood", x, y, dir, power, 0);
      game.spawnHostile("blood", x, y + 8, dir, power, 0.6);
    } else {
      game.spawnHostile("blood", x, y, dir, power, 0);
      if (Math.random() < 0.5) {
        game.spawnHostile("blood", x, y - 6, dir, power, -0.4);
      }
    }
    audio.play("spell");
  }

  private poof(game: Game): void {
    for (let i = 0; i < 12; i++) {
      game.spawnParticle(this.centerX, this.centerY, {
        vx: (Math.random() - 0.5) * 2.4,
        vy: (Math.random() - 0.5) * 2.4,
        life: 14 + Math.floor(Math.random() * 10),
        color: i % 2 === 0 ? "#401828" : PAL.hpRed,
        size: 1,
      });
    }
  }

  protected override die(game: Game): void {
    super.die(game);
    game.onBossDefeated(this.bossId);
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, alpha: number): void {
    // Blink during teleport
    if (this.mode === "teleport" && this.modeTicks > 4 && this.modeTicks < 16) return;

    const s = Dracula.sprites!;
    const sheet = this.phase === "beast" ? s.beast : s.human;
    const set = this.facing > 0 ? sheet.right : sheet.left;
    // Sheet layout: [idle0..idleN-3, cast, lunge] (procedural: idleA, idleB, cast, lunge).
    const n = set.length;
    const idleCount = Math.max(1, n - 2);
    let idx: number;
    if (this.mode === "cast") idx = Math.max(0, n - 2);
    else if (this.mode === "lunge") idx = Math.max(0, n - 1);
    else idx = Math.floor(this.animTick / 14) % idleCount;
    const frame = set[Math.min(idx, n - 1)];
    const x = this.renderX(alpha) + this.body.w / 2 - frame.width / 2 - camX;
    const y = this.renderY(alpha) + this.body.h - frame.height - camY;

    // Phase-2 red aura
    if (this.phase === "beast") {
      ctx.save();
      ctx.globalAlpha = 0.25 + Math.sin(this.animTick * 0.15) * 0.1;
      ctx.fillStyle = PAL.hpRed;
      ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, frame.width + 4, frame.height + 4);
      ctx.restore();
    }
    this.drawFrame(ctx, frame, x, y);
  }
}
