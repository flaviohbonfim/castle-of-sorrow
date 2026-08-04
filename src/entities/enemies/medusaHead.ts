import { Enemy } from "./enemy";
import type { Game } from "../../game";
import { buildMedusaHeadSprites, type SpriteSet } from "../../gfx/sprites";
import { resolveSpriteSet } from "../../gfx/resolveSprites";
import { statsFor } from "../../rpg/bestiary";

/**
 * Classic Medusa Head: flies in a horizontal sine wave. Spawner-managed in
 * tall rooms; dies when it leaves the map bounds.
 */
export class MedusaHead extends Enemy {
  private static sprites: SpriteSet | null = null;
  private animTick = 0;
  private t = 0;
  private baseY: number;

  constructor(x: number, y: number, dir: 1 | -1 = 1, flags?: Set<string>) {
    super(x - 6, y - 6, 12, 12, statsFor("medusaHead", flags), "medusaHead");
    this.facing = dir;
    this.baseY = y;
    this.body.vx = dir * 1.35;
    MedusaHead.sprites ??= resolveSpriteSet("medusaHead.fly", buildMedusaHeadSprites);
  }

  protected override onHit(fromX: number): void {
    this.body.vx = this.centerX < fromX ? -1.6 : 1.6;
    this.facing = this.body.vx >= 0 ? 1 : -1;
  }

  update(game: Game): void {
    this.tickBase();
    this.animTick++;
    this.t += 0.09;
    this.body.x += this.body.vx;
    this.body.y = this.baseY + Math.sin(this.t) * 18;
    this.facing = this.body.vx >= 0 ? 1 : -1;

    if (
      this.body.x < -24 ||
      this.body.x > game.map.widthPx + 24 ||
      this.body.y < -40 ||
      this.body.y > game.map.heightPx + 40
    ) {
      this.dead = true;
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, alpha: number): void {
    const sprites = MedusaHead.sprites!;
    const set = this.facing > 0 ? sprites.right : sprites.left;
    const frame = set[Math.floor(this.animTick / 6) % set.length];
    const x = this.renderX(alpha) + this.body.w / 2 - frame.width / 2 - camX;
    const y = this.renderY(alpha) + this.body.h / 2 - frame.height / 2 - camY;
    this.drawFrame(ctx, frame, x, y);
  }
}
