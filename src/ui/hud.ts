import { VIEW_H } from "../engine/renderer";
import { PAL } from "../gfx/palette";
import type { Player } from "../entities/player/player";
import { buildPickupSprites } from "../gfx/sprites";
import { t } from "../data/i18n";

/**
 * Compact combat HUD (Phase 8.6 option B).
 * LV / EXP / weapon name live in the pause menu only.
 *
 * Plate ~104×28 — under 3% of the 480×270 backbuffer.
 */
export const LAYOUT = {
  plate: { x: 4, y: 4, w: 104, h: 28 },
  hp: { barX: 8, barY: 7, barW: 72, barH: 5, valueX: 100 },
  mp: { barX: 8, barY: 14, barW: 72, barH: 3, valueX: 100 },
  strip: {
    y: 28,
    subX: 6,
    subBoxW: 14,
    subBoxH: 12,
    heartsX: 24,
    goldX: 52,
    potionsX: 82,
  },
  hints: { x: 6, y: VIEW_H - 10 },
} as const;

let PICKUPS: ReturnType<typeof buildPickupSprites> | null = null;

/**
 * Minimal left vitals + resource strip. Minimap owns the top-right alone.
 */
export class Hud {
  draw(ctx: CanvasRenderingContext2D, p: Player): void {
    PICKUPS ??= buildPickupSprites();
    const L = LAYOUT;
    ctx.save();
    ctx.font = "8px 'Courier New', monospace";
    ctx.textAlign = "left";

    // --- plate ---
    const { x, y, w, h } = L.plate;
    ctx.fillStyle = "rgba(10, 6, 20, 0.72)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = PAL.uiFrameDark;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeStyle = PAL.uiFrame;
    ctx.beginPath();
    ctx.moveTo(x + 1, y + 0.5);
    ctx.lineTo(x + w - 1, y + 0.5);
    ctx.stroke();

    // --- HP (color carries the meaning; no "HP" label) ---
    this.bar(
      ctx,
      L.hp.barX,
      L.hp.barY,
      L.hp.barW,
      L.hp.barH,
      p.res.hp / Math.max(1, p.res.maxHp),
      PAL.hpRed,
      PAL.hpRedHi,
    );
    ctx.textAlign = "right";
    ctx.fillStyle = PAL.textWhite;
    ctx.fillText(String(p.res.hp), L.hp.valueX, L.hp.barY + 6);

    // --- MP ---
    this.bar(
      ctx,
      L.mp.barX,
      L.mp.barY,
      L.mp.barW,
      L.mp.barH,
      p.res.mp / Math.max(1, p.res.maxMp),
      PAL.mpBlue,
      PAL.mpBlueHi,
    );
    ctx.fillStyle = PAL.mpBlueHi;
    ctx.fillText(String(Math.floor(p.res.mp)), L.mp.valueX, L.mp.barY + 5);

    // --- resource strip ---
    this.drawStrip(ctx, p);

    // --- key hints ---
    ctx.textAlign = "left";
    ctx.fillStyle = PAL.uiFrameDark;
    ctx.fillText(t("hud.hints"), L.hints.x, L.hints.y);

    ctx.textAlign = "left";
    ctx.restore();
  }

  private drawStrip(ctx: CanvasRenderingContext2D, p: Player): void {
    const S = LAYOUT.strip;
    const icons = PICKUPS!;
    const baseline = S.y;

    // Sub-weapon slot
    const bx = S.subX;
    const by = baseline - 10;
    ctx.fillStyle = "rgba(16, 10, 28, 0.9)";
    ctx.fillRect(bx, by, S.subBoxW, S.subBoxH);
    ctx.strokeStyle = PAL.uiFrameDark;
    ctx.strokeRect(bx + 0.5, by + 0.5, S.subBoxW - 1, S.subBoxH - 1);
    this.drawSubGlyph(ctx, p.subweapon, bx + 1, by + 1);

    // Hearts
    const heart = icons.heart;
    ctx.drawImage(heart, S.heartsX, baseline - heart.height + 1);
    ctx.textAlign = "left";
    ctx.fillStyle = PAL.heartHi;
    ctx.fillText(String(p.res.hearts), S.heartsX + heart.width + 1, baseline);

    // Gold
    const gold = icons.gold;
    ctx.drawImage(gold, S.goldX, baseline - gold.height + 1);
    ctx.fillStyle = PAL.textGold;
    ctx.fillText(String(p.inventory.gold), S.goldX + gold.width + 1, baseline);

    // Potions (hidden at 0)
    const potions = p.inventory.count("potion");
    if (potions > 0) {
      const pot = icons.potion;
      // Don't overflow the 104px plate
      const px = Math.min(S.potionsX, LAYOUT.plate.x + LAYOUT.plate.w - pot.width - 12);
      ctx.drawImage(pot, px, baseline - pot.height + 1);
      ctx.fillStyle = PAL.potionGlass;
      ctx.fillText(String(potions), px + pot.width + 1, baseline);
    }
  }

  private drawSubGlyph(ctx: CanvasRenderingContext2D, id: string, x: number, y: number): void {
    if (id === "axe") {
      ctx.fillStyle = PAL.blade;
      ctx.fillRect(x + 1, y + 1, 7, 2);
      ctx.fillRect(x + 4, y + 2, 2, 7);
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(x + 3, y + 3, 3, 2);
    } else {
      ctx.fillStyle = PAL.bladeHi;
      ctx.fillRect(x + 5, y, 2, 8);
      ctx.fillStyle = PAL.blade;
      ctx.fillRect(x + 4, y + 1, 4, 2);
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(x + 3, y + 7, 5, 2);
    }
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
