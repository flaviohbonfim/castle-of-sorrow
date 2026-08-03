import { VIEW_H } from "../engine/renderer";
import { PAL } from "../gfx/palette";
import type { Player } from "../entities/player/player";
import { expToNext } from "../rpg/leveling";
import { buildPickupSprites } from "../gfx/sprites";

/**
 * HUD layout constants — nudge the left panel here without hunting draw calls.
 * Backbuffer is 480×270; plate ends at y = PLATE.y + PLATE.h (68).
 */
export const LAYOUT = {
  plate: { x: 6, y: 6, w: 168, h: 62 },
  hp: {
    labelX: 12,
    labelY: 18,
    barX: 30,
    barY: 12,
    barW: 92,
    barH: 6,
    valueX: 168,
  },
  mp: {
    labelX: 12,
    labelY: 29,
    barX: 30,
    barY: 24,
    barW: 92,
    barH: 4,
    valueX: 168,
  },
  level: { x: 12, y: 40, expX: 168 },
  weapon: { x: 12, y: 51 },
  strip: {
    y: 62,
    subX: 10,
    subBoxW: 18,
    subBoxH: 16,
    heartsX: 32,
    goldX: 78,
    potionsX: 128,
  },
  hints: { x: 8, y: VIEW_H - 10 },
} as const;

let PICKUPS: ReturnType<typeof buildPickupSprites> | null = null;

/**
 * Left vitals panel + bottom key hints. Minimap owns the top-right alone.
 */
export class Hud {
  draw(ctx: CanvasRenderingContext2D, p: Player): void {
    PICKUPS ??= buildPickupSprites();
    const L = LAYOUT;
    ctx.save();
    ctx.font = "8px 'Courier New', monospace";
    ctx.textAlign = "left";

    // --- translucent plate ---
    const { x, y, w, h } = L.plate;
    ctx.fillStyle = "rgba(10, 6, 20, 0.72)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = PAL.uiFrameDark;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // Top highlight edge
    ctx.strokeStyle = PAL.uiFrame;
    ctx.beginPath();
    ctx.moveTo(x + 1, y + 0.5);
    ctx.lineTo(x + w - 1, y + 0.5);
    ctx.stroke();

    // --- HP ---
    ctx.fillStyle = PAL.textWhite;
    ctx.fillText("HP", L.hp.labelX, L.hp.labelY);
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
    ctx.fillText(`${p.res.hp}/${p.res.maxHp}`, L.hp.valueX, L.hp.labelY);

    // --- MP ---
    ctx.textAlign = "left";
    ctx.fillText("MP", L.mp.labelX, L.mp.labelY);
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
    ctx.textAlign = "right";
    ctx.fillText(`${Math.floor(p.res.mp)}/${p.res.maxMp}`, L.mp.valueX, L.mp.labelY);

    // --- Level / EXP ---
    ctx.textAlign = "left";
    ctx.fillStyle = PAL.textWhite;
    ctx.fillText(`LV ${p.levelState.level}`, L.level.x, L.level.y);
    ctx.textAlign = "right";
    ctx.fillStyle = PAL.uiFrame;
    ctx.fillText(
      `EXP ${p.levelState.exp}/${expToNext(p.levelState.level)}`,
      L.level.expX,
      L.level.y,
    );

    // --- Weapon ---
    ctx.textAlign = "left";
    const weapon = p.inventory.weapon();
    ctx.fillStyle = PAL.uiFrame;
    const weaponName = weapon?.name ?? "—";
    // Clip to plate width so long names never escape.
    const maxW = L.plate.x + L.plate.w - L.weapon.x - 4;
    ctx.fillText(this.fit(ctx, weaponName, maxW), L.weapon.x, L.weapon.y);

    // --- Resource strip ---
    this.drawStrip(ctx, p);

    // --- Key hints (bottom-left, outside the plate) ---
    ctx.textAlign = "left";
    ctx.fillStyle = PAL.uiFrameDark;
    ctx.fillText("[Tab] Menu  [V] Sub", L.hints.x, L.hints.y);

    ctx.textAlign = "left";
    ctx.restore();
  }

  private drawStrip(ctx: CanvasRenderingContext2D, p: Player): void {
    const S = LAYOUT.strip;
    const icons = PICKUPS!;
    const baseline = S.y;

    // Sub-weapon slot
    const bx = S.subX;
    const by = baseline - 12;
    ctx.fillStyle = "rgba(16, 10, 28, 0.9)";
    ctx.fillRect(bx, by, S.subBoxW, S.subBoxH);
    ctx.strokeStyle = PAL.uiFrameDark;
    ctx.strokeRect(bx + 0.5, by + 0.5, S.subBoxW - 1, S.subBoxH - 1);
    this.drawSubGlyph(ctx, p.subweapon, bx + 3, by + 2);

    // Hearts
    const heart = icons.heart;
    const hx = S.heartsX;
    const hy = baseline - heart.height + 1;
    ctx.drawImage(heart, hx, hy);
    ctx.textAlign = "left";
    ctx.fillStyle = PAL.heartHi;
    ctx.fillText(String(p.res.hearts), hx + heart.width + 2, baseline);

    // Gold
    const gold = icons.gold;
    const gx = S.goldX;
    const gy = baseline - gold.height + 1;
    ctx.drawImage(gold, gx, gy);
    ctx.fillStyle = PAL.textGold;
    const goldText = String(p.inventory.gold);
    // Keep gold from colliding with potions / plate edge.
    ctx.fillText(this.fit(ctx, goldText, S.potionsX - gx - gold.width - 6), gx + gold.width + 2, baseline);

    // Potions (hidden when zero)
    const potions = p.inventory.count("potion");
    if (potions > 0) {
      const pot = icons.potion;
      const px = S.potionsX;
      const py = baseline - pot.height + 1;
      ctx.drawImage(pot, px, py);
      ctx.fillStyle = PAL.potionGlass;
      ctx.fillText(String(potions), px + pot.width + 2, baseline);
    }
  }

  /** Truncate with "…" so text stays inside `maxW` px. */
  private fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
    return t + "…";
  }

  private drawSubGlyph(ctx: CanvasRenderingContext2D, id: string, x: number, y: number): void {
    if (id === "axe") {
      ctx.fillStyle = PAL.blade;
      ctx.fillRect(x + 2, y, 8, 2);
      ctx.fillRect(x + 5, y + 2, 2, 8);
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(x + 4, y + 3, 4, 3);
    } else {
      ctx.fillStyle = PAL.bladeHi;
      ctx.fillRect(x + 6, y, 2, 9);
      ctx.fillStyle = PAL.blade;
      ctx.fillRect(x + 5, y + 1, 4, 2);
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(x + 4, y + 8, 6, 2);
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
