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
  /**
   * Distance-driven walk phase (px accumulated). Ties gait to actual motion so
   * the cycle stays smooth when speed varies and never skips frames on pause.
   */
  private walkDist = 0;
  private mode: Mode = "idle";
  private modeTicks = 0;
  private cooldown = 50;
  private phase: Phase = "human";
  readonly maxHp: number;
  readonly displayName = "DRACULA";
  readonly bossId = "dracula";

  constructor(x: number, y: number, flags?: Set<string>) {
    // Hitbox stays near the original 24×36 so multi-step floors (throne dais)
    // and pillars don't swallow the body. The AI sprite is larger (~50px) and
    // draws feet-aligned to the hitbox bottom for final-boss presence.
    super(x - 12, y - 36, 24, 36, statsFor("dracula", flags), "dracula");
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
    // Sheet layout (AI override): [walk0..walkN-3, cast, lunge] (10 frames:
    // 8 walk + cast + lunge). Procedural fallback is shorter but same layout.
    const n = set.length;
    const walkCount = Math.max(1, n - 2);
    const castIdx = Math.max(0, n - 2);
    const lungeIdx = Math.max(0, n - 1);
    let idx: number;
    if (this.mode === "cast") {
      idx = castIdx;
    } else if (this.mode === "lunge") {
      // Wind-up holds a mid walk pose, then the lunge frame while dashing.
      idx = this.modeTicks < 8 ? Math.min(3, walkCount - 1) : lungeIdx;
    } else if (this.mode === "teleport" || this.mode === "recover") {
      idx = 0;
    } else {
      // Walk only while moving. ~4px of travel per frame → full 8-frame cycle
      // every ~32px (matches slow lordly pace without a hitch).
      const moving = Math.abs(this.body.vx) > 0.12;
      if (moving) {
        this.walkDist += Math.abs(this.body.vx);
        idx = Math.floor(this.walkDist / 4) % walkCount;
      } else {
        idx = 0;
        this.walkDist = 0;
      }
    }
    const frame = set[Math.min(idx, n - 1)];
    // Feet-align to hitbox; centre on body. Frame cell size is fixed across
    // poses so lunge does not appear to scale up the whole sprite.
    const x = this.renderX(alpha) + this.body.w / 2 - frame.width / 2 - camX;
    const y = this.renderY(alpha) + this.body.h - frame.height - camY;
    const rx = Math.round(x);
    const ry = Math.round(y);

    // Phase-2 presence: soft crimson glow under the silhouette — never a solid
    // rect (that read as a red background box behind the sprite).
    if (this.phase === "beast") {
      const cx = rx + frame.width / 2;
      const cy = ry + frame.height * 0.55;
      const pulse = 0.12 + Math.sin(this.animTick * 0.12) * 0.04;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = pulse;
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, frame.width * 0.42);
      g.addColorStop(0, PAL.hpRedHi);
      g.addColorStop(0.55, PAL.hpRed);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, frame.width * 0.42, frame.height * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    this.drawFrame(ctx, frame, x, y);
  }
}
