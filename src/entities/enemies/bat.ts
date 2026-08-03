import { Enemy } from "./enemy";
import type { Game } from "../../game";
import { buildBatSprites, type SpriteSet } from "../../gfx/sprites";
import { statsFor } from "../../rpg/bestiary";

/**
 * Flyer: hovers on a sine wave until the player comes near, then swoops in a
 * shallow dive. Ignores tile collision (classic Castlevania bat behavior).
 */
export class Bat extends Enemy {
  private static sprites: SpriteSet | null = null;
  private animTick = 0;
  private baseY: number;
  private t = Math.random() * Math.PI * 2;
  private mode: "hover" | "swoop" = "hover";

  constructor(x: number, y: number, flags?: Set<string>) {
    super(x - 7, y - 4, 14, 8, statsFor("bat", flags));
    this.baseY = y - 4;
    Bat.sprites ??= buildBatSprites();
  }

  protected override onHit(fromX: number): void {
    this.body.vx = this.centerX < fromX ? -2 : 2;
    this.body.vy = -1;
    this.mode = "hover";
  }

  update(game: Game): void {
    this.tickBase();
    this.animTick++;
    this.t += 0.05;

    const p = game.player;
    const dx = p.centerX - this.centerX;
    const dy = p.centerY - this.centerY;
    const dist = Math.hypot(dx, dy);

    if (this.mode === "hover") {
      this.body.vx *= 0.92;
      this.body.y = this.baseY + Math.sin(this.t) * 10;
      this.body.x += this.body.vx + Math.cos(this.t * 0.7) * 0.3;
      if (dist < 130 && p.state.name !== "die") this.mode = "swoop";
    } else {
      const speed = 1.1;
      this.body.vx = (dx / (dist || 1)) * speed;
      this.body.vy = (dy / (dist || 1)) * speed * 0.8;
      this.body.x += this.body.vx;
      this.body.y += this.body.vy;
      if (dist > 190) {
        this.mode = "hover";
        this.baseY = this.body.y;
      }
    }
    this.facing = dx >= 0 ? 1 : -1;
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, alpha: number): void {
    const sprites = Bat.sprites!;
    const set = this.facing > 0 ? sprites.right : sprites.left;
    const frame = set[Math.floor(this.animTick / 8) % set.length];
    const x = this.renderX(alpha) + this.body.w / 2 - frame.width / 2 - camX;
    const y = this.renderY(alpha) + this.body.h / 2 - frame.height / 2 - camY;
    this.drawFrame(ctx, frame, x, y);
  }
}
