import { VIEW_W, VIEW_H } from "../engine/renderer";
import { PAL } from "../gfx/palette";
import type { Player } from "../entities/player/player";
import { expToNext } from "../rpg/leveling";

/** SotN-style HUD: HP/MP bars, hearts, gold, level/EXP, equipped weapon. */
export class Hud {
  draw(ctx: CanvasRenderingContext2D, p: Player): void {
    ctx.save();
    ctx.font = "8px 'Courier New', monospace";
    ctx.textAlign = "left";

    this.bar(ctx, 8, 8, 90, 6, p.res.hp / p.res.maxHp, PAL.hpRed, PAL.hpRedHi);
    this.bar(ctx, 8, 17, 70, 4, p.res.mp / p.res.maxMp, PAL.mpBlue, PAL.mpBlueHi);

    ctx.fillStyle = PAL.textWhite;
    ctx.fillText(`HP ${p.res.hp}/${p.res.maxHp}`, 102, 14);
    ctx.fillText(`MP ${Math.floor(p.res.mp)}`, 82, 22);

    // Hearts (sub-weapon ammo) + gold, top-right like the classics.
    ctx.textAlign = "right";
    ctx.fillStyle = PAL.heartHi;
    ctx.fillText(`♥ ${p.res.hearts}`, VIEW_W - 8, 14);
    ctx.fillStyle = PAL.textGold;
    ctx.fillText(`$ ${p.inventory.gold}`, VIEW_W - 8, 24);

    // Level / EXP / weapon, bottom-left.
    ctx.textAlign = "left";
    ctx.fillStyle = PAL.textWhite;
    const weapon = p.inventory.weapon();
    ctx.fillText(
      `LV ${p.levelState.level}  EXP ${p.levelState.exp}/${expToNext(p.levelState.level)}`,
      8, 30,
    );
    if (weapon) {
      ctx.fillStyle = PAL.uiFrame;
      ctx.fillText(weapon.name, 8, 39);
    }
    const potions = p.inventory.count("potion");
    if (potions > 0) {
      ctx.fillStyle = PAL.potionGlass;
      ctx.fillText(`[Q] Potion x${potions}`, 8, 48);
    }
    ctx.fillStyle = PAL.uiFrameDark;
    ctx.fillText("[Tab] Menu", 8, VIEW_H - 10);

    ctx.restore();
  }

  private bar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    frac: number,
    color: string,
    hi: string,
  ): void {
    ctx.fillStyle = PAL.uiFrameDark;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = PAL.barBack;
    ctx.fillRect(x, y, w, h);
    const fw = Math.max(0, Math.round(w * Math.max(0, Math.min(1, frac))));
    if (fw > 0) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, fw, h);
      ctx.fillStyle = hi;
      ctx.fillRect(x, y, fw, 1);
    }
  }
}
