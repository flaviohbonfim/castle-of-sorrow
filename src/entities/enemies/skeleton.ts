import { Enemy } from "./enemy";
import type { Game } from "../../game";
import { moveBody, groundAhead } from "../../world/collision";
import { buildSkeletonSprites, type SpriteSet } from "../../gfx/sprites";
import { statsFor } from "../../rpg/bestiary";

const GRAVITY = 0.26;
const WALK = 0.45;

/** Patrolling walker: shambles forward, turns at walls and ledges. */
export class Skeleton extends Enemy {
  private static sprites: SpriteSet | null = null;
  private animTick = 0;
  private turnCooldown = 0;

  constructor(x: number, y: number, flags?: Set<string>) {
    super(x - 6, y - 28, 12, 28, statsFor("skeleton", flags));
    Skeleton.sprites ??= buildSkeletonSprites();
    this.facing = Math.random() < 0.5 ? 1 : -1;
  }

  update(game: Game): void {
    this.tickBase();
    this.animTick++;
    if (this.turnCooldown > 0) this.turnCooldown--;

    this.body.vy = Math.min(this.body.vy + GRAVITY, 6);
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
        this.turnCooldown = 12;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, alpha: number): void {
    const sprites = Skeleton.sprites!;
    const set = this.facing > 0 ? sprites.right : sprites.left;
    const frame = set[Math.floor(this.animTick / 14) % set.length];
    const x = this.renderX(alpha) + this.body.w / 2 - frame.width / 2 - camX;
    const y = this.renderY(alpha) + this.body.h - frame.height - camY;
    this.drawFrame(ctx, frame, x, y);
  }
}
