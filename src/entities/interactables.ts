import { Entity } from "./entity";
import type { Game } from "../game";
import { audio } from "../engine/audio";
import { rectsOverlap } from "../engine/math";
import { buildInteractableSprites, buildShopkeeperSprites, type SpriteSet } from "../gfx/sprites";
import { PAL } from "../gfx/palette";
import { noticeText } from "../combat/damage";
import { ITEMS } from "../rpg/items";

let SPRITES: ReturnType<typeof buildInteractableSprites> | null = null;

export const RELIC_NAMES: Record<string, string> = {
  doubleJump: "Soul of the Gale",
  batForm: "Soul of the Bat",
  wolfForm: "Skin of the Wolf",
  mistForm: "Power of the Mist",
  waterWalk: "Mermaid Statue",
};

const RELIC_DESCS: Record<string, string> = {
  doubleJump: "Double Jump!",
  batForm: "Bat Form [1]!",
  wolfForm: "Wolf Form [2]!",
  mistForm: "Mist Form [3]!",
  waterWalk: "Water Walking!",
};

/** Floating relic pickup — grants a permanent ability on touch. */
export class RelicPickup extends Entity {
  private age = 0;

  constructor(
    readonly relicId: string,
    x: number,
    y: number,
  ) {
    super(x - 5, y - 16, 10, 10);
    SPRITES ??= buildInteractableSprites();
  }

  update(game: Game): void {
    this.age++;
    if (rectsOverlap(this.body, game.player.body)) {
      this.dead = true;
      game.player.relics.add(this.relicId);
      game.flags.add(`relic:${this.relicId}`);
      const name = RELIC_NAMES[this.relicId] ?? this.relicId;
      game.texts.push(noticeText(this.centerX, this.body.y - 14, name, PAL.spellCyan));
      game.texts.push(
        noticeText(this.centerX, this.body.y - 4, RELIC_DESCS[this.relicId] ?? "", PAL.textGold),
      );
      audio.play("levelup");
      game.camera.addShake(0.3);
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, _alpha: number): void {
    const bob = Math.sin(this.age * 0.08) * 3;
    const x = Math.round(this.centerX - 4 - camX);
    const y = Math.round(this.body.y - camY + bob);
    // Glow halo
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const grad = ctx.createRadialGradient(x + 4, y + 3, 1, x + 4, y + 3, 12);
    grad.addColorStop(0, "rgba(96, 208, 255, 0.5)");
    grad.addColorStop(1, "rgba(96, 208, 255, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(x - 8, y - 9, 24, 24);
    ctx.restore();
    ctx.drawImage(SPRITES!.relic, x, y);
  }
}

/**
 * One-shot world item (chest-style). Flag `item:<roomId>:<n>` prevents respawn.
 * Touch to collect into inventory.
 */
export class ItemPickup extends Entity {
  private age = 0;

  constructor(
    readonly itemId: string,
    readonly flagKey: string,
    x: number,
    y: number,
  ) {
    super(x - 5, y - 12, 10, 12);
    SPRITES ??= buildInteractableSprites();
  }

  update(game: Game): void {
    this.age++;
    if (!rectsOverlap(this.body, game.player.body)) return;
    this.dead = true;
    game.flags.add(this.flagKey);
    game.player.inventory.add(this.itemId);
    const name = ITEMS[this.itemId]?.name ?? this.itemId;
    game.texts.push(noticeText(this.centerX, this.body.y - 10, name, PAL.textGold));
    audio.play("levelup");
    game.camera.addShake(0.2);
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, _alpha: number): void {
    const bob = Math.sin(this.age * 0.1) * 2;
    const x = Math.round(this.centerX - 4 - camX);
    const y = Math.round(this.body.y - camY + bob);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const grad = ctx.createRadialGradient(x + 4, y + 4, 1, x + 4, y + 4, 10);
    grad.addColorStop(0, "rgba(232, 192, 64, 0.45)");
    grad.addColorStop(1, "rgba(232, 192, 64, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(x - 6, y - 6, 20, 20);
    ctx.restore();
    // Small treasure chest glyph
    ctx.fillStyle = PAL.goldShade;
    ctx.fillRect(x, y + 4, 8, 6);
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(x, y + 2, 8, 3);
    ctx.fillStyle = PAL.goldHi;
    ctx.fillRect(x + 3, y + 1, 2, 2);
    ctx.fillRect(x + 1, y + 5, 6, 1);
  }
}

/** Warp pad: stand on it and press Up to travel to the linked pad. */
export class WarpPad extends Entity {
  private age = 0;
  private playerNear = false;

  constructor(x: number, y: number) {
    super(x - 8, y - 20, 16, 20); // interaction volume above the pad
  }

  update(game: Game): void {
    this.age++;
    this.playerNear = rectsOverlap(this.body, game.player.body);
    if (this.playerNear && game.input.pressed("up")) {
      game.input.consume("up");
      game.warpFrom(this);
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, _alpha: number): void {
    const s = SPRITES ?? (SPRITES = buildInteractableSprites());
    const frame = s.warp[Math.floor(this.age / 20) % 2];
    const x = Math.round(this.centerX - frame.width / 2 - camX);
    const y = Math.round(this.body.y + this.body.h - frame.height - camY);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const grad = ctx.createRadialGradient(x + 6, y, 1, x + 6, y, 14);
    grad.addColorStop(0, "rgba(96, 208, 255, 0.35)");
    grad.addColorStop(1, "rgba(96, 208, 255, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(x - 8, y - 14, 28, 28);
    ctx.restore();
    ctx.drawImage(frame, x, y);
    if (this.playerNear) this.hint(ctx, camX, camY);
  }

  private hint(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    ctx.font = "8px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = PAL.textWhite;
    ctx.fillText("[^] Warp", Math.round(this.centerX - camX), Math.round(this.body.y - 6 - camY));
    ctx.textAlign = "left";
  }
}

/** The Hermit: stand close and press Up to open the shop. */
export class Shopkeeper extends Entity {
  private age = 0;
  private playerNear = false;
  private sprites: SpriteSet = buildShopkeeperSprites();

  constructor(x: number, y: number) {
    super(x - 10, y - 20, 20, 20);
  }

  update(game: Game): void {
    this.age++;
    this.playerNear = rectsOverlap(this.body, game.player.body);
    this.facing = game.player.centerX >= this.centerX ? 1 : -1;
    if (this.playerNear && game.input.pressed("up")) {
      game.input.consume("up");
      game.openShop();
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, _alpha: number): void {
    const set = this.facing > 0 ? this.sprites.right : this.sprites.left;
    const frame = set[Math.floor(this.age / 40) % 2];
    const x = Math.round(this.centerX - frame.width / 2 - camX);
    const y = Math.round(this.body.y + this.body.h - frame.height - camY);
    ctx.drawImage(frame, x, y);
    if (this.playerNear) {
      ctx.font = "8px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = PAL.textWhite;
      ctx.fillText("[^] Shop", Math.round(this.centerX - camX), Math.round(this.body.y - 6 - camY));
      ctx.textAlign = "left";
    }
  }
}

/** Save pedestal: press Up to fully heal and write the save file. */
export class SavePoint extends Entity {
  private age = 0;
  private playerNear = false;
  private cooldown = 0;

  constructor(x: number, y: number) {
    super(x - 8, y - 24, 16, 24);
  }

  update(game: Game): void {
    this.age++;
    if (this.cooldown > 0) this.cooldown--;
    this.playerNear = rectsOverlap(this.body, game.player.body);
    if (this.playerNear && this.cooldown === 0 && game.input.pressed("up")) {
      game.input.consume("up");
      this.cooldown = 60;
      const p = game.player;
      p.res.hp = p.res.maxHp;
      p.res.mp = p.res.maxMp;
      game.saveGame();
      game.texts.push(noticeText(this.centerX, this.body.y - 10, "Game saved", PAL.textGold));
      audio.play("heart");
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, _alpha: number): void {
    const s = SPRITES ?? (SPRITES = buildInteractableSprites());
    const frame = s.save[Math.floor(this.age / 16) % 2];
    const x = Math.round(this.centerX - frame.width / 2 - camX);
    const y = Math.round(this.body.y + this.body.h - frame.height - camY);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const gx = x + 5;
    const gy = y + 2;
    const grad = ctx.createRadialGradient(gx, gy, 1, gx, gy, 11);
    grad.addColorStop(0, "rgba(240, 104, 88, 0.45)");
    grad.addColorStop(1, "rgba(208, 40, 56, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(gx - 11, gy - 11, 22, 22);
    ctx.restore();
    ctx.drawImage(frame, x, y);
    if (this.playerNear) {
      ctx.font = "8px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = PAL.textWhite;
      ctx.fillText("[^] Save", Math.round(this.centerX - camX), Math.round(this.body.y - 6 - camY));
      ctx.textAlign = "left";
    }
  }
}
