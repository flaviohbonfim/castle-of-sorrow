import { Enemy } from "./enemy";
import type { Game } from "../../game";
import { moveBody } from "../../world/collision";
import { buildFleaManSprites, type SpriteSet } from "../../gfx/sprites";
import { resolveSpriteSet } from "../../gfx/resolveSprites";
import { statsFor } from "../../rpg/bestiary";

const GRAVITY = 0.28;

/** Small jumper — hops toward the player, annoying pressure. */
export class FleaMan extends Enemy {
  private static sprites: SpriteSet | null = null;
  private animTick = 0;
  private hopCd = 20 + Math.floor(Math.random() * 30);

  constructor(x: number, y: number, flags?: Set<string>) {
    super(x - 6, y - 16, 12, 16, statsFor("fleaMan", flags), "fleaMan");
    FleaMan.sprites ??= resolveSpriteSet("fleaMan.hop", buildFleaManSprites);
    this.facing = Math.random() < 0.5 ? 1 : -1;
  }

  update(game: Game): void {
    this.tickBase();
    this.animTick++;
    if (this.hopCd > 0) this.hopCd--;

    const p = game.player;
    const dx = p.centerX - this.centerX;
    if (Math.abs(dx) > 4) this.facing = (dx >= 0 ? 1 : -1) as 1 | -1;

    this.body.vy = Math.min(this.body.vy + GRAVITY, 6);

    if (this.body.onGround) {
      this.body.vx *= 0.7;
      if (this.hopCd === 0 && p.state.name !== "die" && Math.abs(dx) < 160) {
        this.body.vy = -3.8 - Math.random() * 0.8;
        this.body.vx = this.facing * (1.6 + Math.random() * 0.6);
        this.hopCd = 28 + Math.floor(Math.random() * 24);
      }
    }

    moveBody(this.body, game.map);
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, alpha: number): void {
    const sprites = FleaMan.sprites!;
    const set = this.facing > 0 ? sprites.right : sprites.left;
    const frames = set.length;
    // Procedural sheet is [ground, air]. AI hop strips are 8 frames
    // (crouch → leap → mid-air → land); map ground vs air onto that.
    let idx: number;
    if (frames <= 2) {
      idx = this.body.onGround ? 0 : Math.min(1, frames - 1);
    } else if (this.body.onGround) {
      idx = 0; // crouched ready pose
    } else {
      // Mid-air cluster (indices ~2..5 on an 8-frame hop strip).
      const lo = Math.min(frames - 1, Math.floor(frames * 0.3));
      const hi = Math.min(frames - 1, Math.floor(frames * 0.7));
      const span = Math.max(1, hi - lo + 1);
      idx = lo + (Math.floor(this.animTick / 3) % span);
    }
    const frame = set[idx];
    const x = this.renderX(alpha) + this.body.w / 2 - frame.width / 2 - camX;
    const y = this.renderY(alpha) + this.body.h - frame.height - camY;
    this.drawFrame(ctx, frame, x, y);
  }
}
