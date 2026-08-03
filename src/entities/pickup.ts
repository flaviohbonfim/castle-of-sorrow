import { Entity } from "./entity";
import type { Game } from "../game";
import { audio } from "../engine/audio";
import { moveBody } from "../world/collision";
import { rectsOverlap } from "../engine/math";
import { buildPickupSprites } from "../gfx/sprites";
import { PAL } from "../gfx/palette";
import { noticeText } from "../combat/damage";

export type PickupKind = "heart" | "bigHeart" | "gold" | "potion";

let SPRITES: ReturnType<typeof buildPickupSprites> | null = null;

/** Dropped loot: falls, settles, then magnetizes to the player when close. */
export class Pickup extends Entity {
  private age = 0;

  constructor(
    readonly kind: PickupKind,
    x: number,
    y: number,
  ) {
    super(x - 4, y - 8, 8, 8);
    SPRITES ??= buildPickupSprites();
    this.body.vx = Math.random() * 1.2 - 0.6;
    this.body.vy = -1.8;
  }

  update(game: Game): void {
    this.savePrev();
    this.age++;
    if (this.age > 60 * 8 || this.body.y > game.map.heightPx + 60) {
      this.dead = true; // stale, or fell out of the room
      return;
    }

    const p = game.player;
    const dx = p.centerX - this.centerX;
    const dy = p.centerY - this.centerY;
    const dist = Math.hypot(dx, dy);

    if (this.age > 14 && dist < 28) {
      // Magnetize
      this.body.x += (dx / (dist || 1)) * 2.2;
      this.body.y += (dy / (dist || 1)) * 2.2;
    } else {
      this.body.vy = Math.min(this.body.vy + 0.24, 5);
      this.body.vx *= this.body.onGround ? 0.8 : 0.99;
      moveBody(this.body, game.map);
    }

    if (rectsOverlap(this.body, p.body)) this.collect(game);
  }

  private collect(game: Game): void {
    this.dead = true;
    const p = game.player;
    switch (this.kind) {
      case "heart":
        p.res.hearts = Math.min(p.res.maxHearts, p.res.hearts + 1);
        audio.play("heart");
        break;
      case "bigHeart":
        p.res.hearts = Math.min(p.res.maxHearts, p.res.hearts + 5);
        game.texts.push(noticeText(this.centerX, this.body.y - 4, "+5", PAL.heartHi));
        audio.play("heart");
        break;
      case "gold": {
        const amount = 25;
        p.inventory.gold += amount;
        game.texts.push(noticeText(this.centerX, this.body.y - 4, `$${amount}`, PAL.textGold));
        audio.play("pickup");
        break;
      }
      case "potion":
        p.inventory.add("potion");
        game.texts.push(noticeText(this.centerX, this.body.y - 4, "Potion", PAL.textWhite));
        audio.play("pickup");
        break;
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, alpha: number): void {
    const s = SPRITES!;
    const frame =
      this.kind === "heart" ? s.heart :
      this.kind === "bigHeart" ? s.bigHeart :
      this.kind === "gold" ? s.gold : s.potion;
    // Gentle bob once settled
    const bob = this.body.onGround ? Math.sin(this.age * 0.15) * 1.5 : 0;
    const x = Math.round(this.renderX(alpha) + this.body.w / 2 - frame.width / 2 - camX);
    const y = Math.round(this.renderY(alpha) + this.body.h - frame.height - camY + bob);
    ctx.drawImage(frame, x, y);
  }
}
