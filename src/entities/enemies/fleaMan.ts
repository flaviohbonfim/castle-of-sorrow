import { Enemy } from "./enemy";
import type { Game } from "../../game";
import { moveBody } from "../../world/collision";
import { buildFleaManSprites, type SpriteSet } from "../../gfx/sprites";
import { statsFor } from "../../rpg/bestiary";

const GRAVITY = 0.28;

/** Small jumper — hops toward the player, annoying pressure. */
export class FleaMan extends Enemy {
  private static sprites: SpriteSet | null = null;
  private animTick = 0;
  private hopCd = 20 + Math.floor(Math.random() * 30);

  constructor(x: number, y: number, flags?: Set<string>) {
    super(x - 6, y - 16, 12, 16, statsFor("fleaMan", flags), "fleaMan");
    FleaMan.sprites ??= buildFleaManSprites();
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
    const frame = set[this.body.onGround ? 0 : 1];
    const x = this.renderX(alpha) + this.body.w / 2 - frame.width / 2 - camX;
    const y = this.renderY(alpha) + this.body.h - frame.height - camY;
    this.drawFrame(ctx, frame, x, y);
  }
}
