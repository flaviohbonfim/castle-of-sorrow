import { VIEW_W, VIEW_H } from "../engine/renderer";
import { PAL } from "../gfx/palette";
import { ITEMS, type EquipSlot, type ItemDef } from "../rpg/items";
import { expToNext } from "../rpg/leveling";
import { RELIC_NAMES } from "../entities/interactables";
import { audio } from "../engine/audio";
import { music } from "../engine/music";
import { ROOMS, WARP_PADS } from "../world/rooms";
import { computeCompletion, formatPlayTime } from "../rpg/completion";
import { buildPickupSprites } from "../gfx/sprites";
import type { Game } from "../game";
import type { Player } from "../entities/player/player";

const SLOTS: { slot: EquipSlot; label: string }[] = [
  { slot: "rightHand", label: "Right Hand" },
  { slot: "leftHand", label: "Left Hand" },
  { slot: "head", label: "Head" },
  { slot: "body", label: "Body" },
  { slot: "cloak", label: "Cloak" },
  { slot: "accessory1", label: "Acc. 1" },
  { slot: "accessory2", label: "Acc. 2" },
];

const TABS = ["STATUS", "EQUIP", "ITEMS", "MAP", "SYS"] as const;
type Panel = 0 | 1 | 2 | 3 | 4;

const SYS_ROWS = ["Music", "Save game", "Return to title"] as const;

let PICKUPS: ReturnType<typeof buildPickupSprites> | null = null;

/** Shared chrome metrics for the pause menu. */
const CHROME = {
  pad: 8,
  tabY: 12,
  tabH: 13,
  bodyTop: 30,
  footerY: VIEW_H - 14,
  leftW: 156,
  gap: 5,
} as const;

/**
 * Pause menu — gothic plates, tabs, status bars, equip preview, map, system.
 * World freezes while open (host checks `.open`).
 */
export class Menu {
  open = false;
  private panel: Panel = 0;
  private cursor = 0;
  private notice = { text: "", life: 0 };
  private vignette: CanvasGradient | null = null;

  toggle(): void {
    this.open = !this.open;
    this.panel = 0;
    this.cursor = 0;
    this.notice.life = 0;
  }

  update(game: Game): void {
    const input = game.input;
    if (this.notice.life > 0) this.notice.life--;

    if (input.pressed("menu")) {
      input.consume("menu");
      this.open = false;
      return;
    }

    // Z = back / no-op close only from SYS confirm patterns — does not close menu.
    if (input.pressed("jump")) {
      input.consume("jump");
      // no full close; players use Tab
    }

    if (input.pressed("left")) {
      input.consume("left");
      this.panel = ((this.panel + TABS.length - 1) % TABS.length) as Panel;
      this.cursor = 0;
      audio.play("pickup");
    }
    if (input.pressed("right")) {
      input.consume("right");
      this.panel = ((this.panel + 1) % TABS.length) as Panel;
      this.cursor = 0;
      audio.play("pickup");
    }

    const listLen = this.listLen(game);
    if (listLen > 0) {
      if (input.pressed("down")) {
        input.consume("down");
        this.cursor = (this.cursor + 1) % listLen;
        audio.play("pickup");
      }
      if (input.pressed("up")) {
        input.consume("up");
        this.cursor = (this.cursor - 1 + listLen) % listLen;
        audio.play("pickup");
      }
    }

    if (input.pressed("attack")) {
      input.consume("attack");
      this.confirm(game);
    }
  }

  private listLen(game: Game): number {
    const p = game.player;
    switch (this.panel) {
      case 0:
        return 0; // status is read-only
      case 1:
        return SLOTS.length;
      case 2:
        return Math.max(1, p.inventory.items.length);
      case 3:
        return 0; // map read-only (music moved to SYS)
      case 4:
        return SYS_ROWS.length;
      default:
        return 0;
    }
  }

  private confirm(game: Game): void {
    const p = game.player;
    if (this.panel === 1) {
      const slot = SLOTS[this.cursor].slot;
      if (p.inventory.equipment[slot]) {
        p.inventory.unequip(slot);
        audio.play("pickup");
        this.flash("Unequipped");
      } else {
        audio.play("hurt");
      }
      return;
    }
    if (this.panel === 2) {
      const entry = p.inventory.items[this.cursor];
      if (!entry) {
        audio.play("hurt");
        return;
      }
      const def = ITEMS[entry.itemId];
      if (def.kind === "consumable") {
        let used = false;
        let msg = "";
        if (def.restoreHp && p.res.hp < p.res.maxHp) {
          const before = p.res.hp;
          p.res.hp = Math.min(p.res.maxHp, p.res.hp + (def.restoreHp ?? 0));
          msg = `+${p.res.hp - before} HP`;
          used = true;
        }
        if (def.restoreMp && p.res.mp < p.res.maxMp) {
          const before = p.res.mp;
          p.res.mp = Math.min(p.res.maxMp, p.res.mp + (def.restoreMp ?? 0));
          msg = msg ? `${msg}  +${Math.floor(p.res.mp - before)} MP` : `+${Math.floor(p.res.mp - before)} MP`;
          used = true;
        }
        if (used) {
          p.inventory.remove(entry.itemId);
          audio.play("heart");
          this.flash(msg || "Used");
        } else {
          audio.play("hurt");
          this.flash("No effect");
        }
      } else {
        if (p.inventory.equip(entry.itemId)) {
          audio.play("pickup");
          this.flash(`Equipped ${def.name}`);
        } else {
          audio.play("hurt");
        }
      }
      this.cursor = Math.min(this.cursor, Math.max(0, p.inventory.items.length - 1));
      return;
    }
    if (this.panel === 4) {
      this.confirmSys(game);
    }
  }

  private confirmSys(game: Game): void {
    switch (this.cursor) {
      case 0:
        music.toggleMuted();
        audio.play("pickup");
        this.flash(music.isMuted() ? "Music OFF" : "Music ON");
        break;
      case 1:
        this.open = false;
        game.openSaveSlots();
        break;
      case 2:
        this.open = false;
        game.requestExitToTitle();
        break;
    }
  }

  private flash(text: string): void {
    this.notice = { text, life: 90 };
  }

  draw(ctx: CanvasRenderingContext2D, game: Game): void {
    PICKUPS ??= buildPickupSprites();
    const p = game.player;
    ctx.save();
    ctx.font = "8px 'Courier New', monospace";
    ctx.textAlign = "left";

    // Dim world + soft vignette
    ctx.fillStyle = "rgba(4, 2, 12, 0.78)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (!this.vignette) {
      this.vignette = ctx.createRadialGradient(
        VIEW_W / 2,
        VIEW_H / 2,
        VIEW_H * 0.2,
        VIEW_W / 2,
        VIEW_H / 2,
        VIEW_H * 0.85,
      );
      this.vignette.addColorStop(0, "rgba(0,0,0,0)");
      this.vignette.addColorStop(1, "rgba(0,0,0,0.45)");
    }
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Outer double frame
    ctx.strokeStyle = PAL.uiFrameDark;
    ctx.strokeRect(6.5, 6.5, VIEW_W - 13, VIEW_H - 13);
    ctx.strokeStyle = PAL.uiFrame;
    ctx.strokeRect(8.5, 8.5, VIEW_W - 17, VIEW_H - 17);

    this.drawTabs(ctx);
    this.drawStatusColumn(ctx, game);

    // Right / main content plate
    const rx = CHROME.pad + CHROME.leftW + CHROME.gap;
    const ry = CHROME.bodyTop;
    const rw = VIEW_W - rx - CHROME.pad;
    const rh = CHROME.footerY - ry - 8;
    this.plate(ctx, rx, ry, rw, rh);

    if (this.panel === 0) this.drawStatusDetail(ctx, p, rx, ry, rw, rh);
    else if (this.panel === 1) this.drawEquip(ctx, p, rx, ry, rw, rh);
    else if (this.panel === 2) this.drawItems(ctx, p, rx, ry, rw, rh);
    else if (this.panel === 3) this.drawMap(ctx, game, rx, ry, rw, rh);
    else this.drawSys(ctx, rx, ry, rw, rh);

    // Footer — solid bar so it never collides with plate text
    ctx.fillStyle = "rgba(6, 3, 12, 0.98)";
    ctx.fillRect(CHROME.pad, CHROME.footerY - 2, VIEW_W - CHROME.pad * 2, 12);
    ctx.strokeStyle = PAL.uiFrameDark;
    ctx.strokeRect(CHROME.pad + 0.5, CHROME.footerY - 1.5, VIEW_W - CHROME.pad * 2 - 1, 11);
    ctx.fillStyle = PAL.uiFrame;
    const hint = this.hintForPanel();
    ctx.fillText(hint, CHROME.pad + 4, CHROME.footerY + 7);

    // Toast
    if (this.notice.life > 0) {
      ctx.globalAlpha = Math.min(1, this.notice.life / 20);
      ctx.fillStyle = PAL.textGold;
      ctx.textAlign = "center";
      ctx.fillText(this.notice.text, VIEW_W / 2, VIEW_H / 2);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }

    ctx.textAlign = "left";
    ctx.restore();
  }

  private hintForPanel(): string {
    switch (this.panel) {
      case 0:
        return "←→ tabs   Tab close";
      case 1:
        return "←→ tabs   ↑↓ select   X unequip   Tab close";
      case 2:
        return "←→ tabs   ↑↓ select   X use/equip   Tab close";
      case 3:
        return "←→ tabs   Tab close";
      case 4:
        return "←→ tabs   ↑↓ select   X confirm   Tab close";
      default:
        return "Tab close";
    }
  }

  private drawTabs(ctx: CanvasRenderingContext2D): void {
    const tabW = 68;
    const startX = CHROME.pad + 2;
    TABS.forEach((t, i) => {
      const x = startX + i * (tabW + 3);
      const active = this.panel === i;
      ctx.fillStyle = active ? "rgba(40, 28, 64, 0.95)" : "rgba(16, 10, 28, 0.9)";
      ctx.fillRect(x, CHROME.tabY, tabW, CHROME.tabH);
      ctx.strokeStyle = active ? PAL.textGold : PAL.uiFrameDark;
      ctx.strokeRect(x + 0.5, CHROME.tabY + 0.5, tabW - 1, CHROME.tabH - 1);
      if (active) {
        ctx.strokeStyle = PAL.uiFrame;
        ctx.beginPath();
        ctx.moveTo(x + 1, CHROME.tabY + 0.5);
        ctx.lineTo(x + tabW - 1, CHROME.tabY + 0.5);
        ctx.stroke();
      }
      ctx.fillStyle = active ? PAL.textGold : PAL.uiFrame;
      ctx.fillText(t, x + 6, CHROME.tabY + 9);
    });
  }

  private plate(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    ctx.fillStyle = "rgba(10, 6, 20, 0.88)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = PAL.uiFrameDark;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeStyle = PAL.uiFrame;
    ctx.beginPath();
    ctx.moveTo(x + 1, y + 0.5);
    ctx.lineTo(x + w - 1, y + 0.5);
    ctx.stroke();
  }

  private drawStatusColumn(ctx: CanvasRenderingContext2D, game: Game): void {
    const p = game.player;
    const x = CHROME.pad;
    const y = CHROME.bodyTop;
    const w = CHROME.leftW;
    const h = CHROME.footerY - y - 6;
    this.plate(ctx, x, y, w, h);

    // Clip all status text to the plate so nothing bleeds into the footer.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y + 1, w - 2, h - 2);
    ctx.clip();

    let row = y + 12;
    const left = x + 6;
    const right = x + w - 6;
    const barW = w - 48;

    ctx.fillStyle = PAL.textGold;
    ctx.fillText("STATUS", left, row);
    row += 12;

    const stats = p.combatStats();
    const attrs = p.inventory.effectiveAttributes(p.attrs);
    const comp = computeCompletion(game.flags);
    const need = expToNext(p.levelState.level);

    // HP
    ctx.fillStyle = PAL.textWhite;
    ctx.fillText("HP", left, row);
    this.bar(ctx, left + 18, row - 6, barW, 5, p.res.hp / Math.max(1, p.res.maxHp), PAL.hpRed, PAL.hpRedHi);
    ctx.textAlign = "right";
    ctx.fillText(`${p.res.hp}/${p.res.maxHp}`, right, row);
    ctx.textAlign = "left";
    row += 11;

    // MP
    ctx.fillText("MP", left, row);
    this.bar(ctx, left + 18, row - 5, barW, 4, p.res.mp / Math.max(1, p.res.maxMp), PAL.mpBlue, PAL.mpBlueHi);
    ctx.textAlign = "right";
    ctx.fillStyle = PAL.mpBlueHi;
    ctx.fillText(`${Math.floor(p.res.mp)}/${p.res.maxMp}`, right, row);
    ctx.textAlign = "left";
    row += 11;

    // LV + exp
    ctx.fillStyle = PAL.textWhite;
    ctx.fillText(`LV ${p.levelState.level}`, left, row);
    this.bar(ctx, left + 36, row - 5, barW - 18, 3, p.levelState.exp / Math.max(1, need), PAL.spellCyan, PAL.textWhite);
    row += 10;
    ctx.fillStyle = PAL.uiFrame;
    ctx.fillText(`EXP ${p.levelState.exp}/${need}`, left, row);
    row += 12;

    // Combat block (compact 2-col)
    ctx.fillStyle = PAL.textGold;
    ctx.fillText("COMBAT", left, row);
    row += 11;
    ctx.fillStyle = PAL.textWhite;
    ctx.fillText(`ATK ${stats.attack}`, left, row);
    ctx.fillText(`DEF ${stats.defense}`, left + 70, row);
    row += 10;
    ctx.fillStyle = PAL.uiFrame;
    ctx.fillText(`STR ${attrs.str}`, left, row);
    ctx.fillText(`CON ${attrs.con}`, left + 70, row);
    row += 10;
    ctx.fillText(`INT ${attrs.int}`, left, row);
    ctx.fillText(`LCK ${attrs.lck}`, left + 70, row);
    row += 11;

    ctx.fillStyle = PAL.textWhite;
    ctx.fillText(`♥${p.res.hearts}/${p.res.maxHearts}`, left, row);
    ctx.fillStyle = PAL.textGold;
    ctx.fillText(`$${p.inventory.gold}`, left + 70, row);
    row += 10;
    ctx.fillStyle = PAL.uiFrame;
    ctx.fillText(`${comp.percent}%`, left, row);
    ctx.fillText(formatPlayTime(game.playTicks), left + 70, row);
    row += 12;

    // Relics — fill remaining plate height (all 6 fit with 9px lines)
    ctx.fillStyle = PAL.spellCyan;
    ctx.fillText("RELICS", left, row);
    row += 10;
    const relics = [...p.relics];
    if (relics.length === 0) {
      ctx.fillStyle = PAL.uiFrame;
      ctx.fillText("(none)", left, row);
    } else {
      const lineH = 9;
      const maxLines = Math.max(1, Math.floor((y + h - 4 - row) / lineH));
      relics.slice(0, maxLines).forEach((r, i) => {
        const name = RELIC_NAMES[r] ?? r;
        const short = name.length > 18 ? name.slice(0, 17) + "…" : name;
        ctx.fillStyle = PAL.textWhite;
        ctx.fillText(`·${short}`, left, row + i * lineH);
      });
      if (relics.length > maxLines) {
        ctx.fillStyle = PAL.uiFrame;
        ctx.fillText(`+${relics.length - maxLines} more`, left, row + maxLines * lineH);
      }
    }

    ctx.restore();
  }

  /** STATUS tab: long-form tips in the main plate. */
  private drawStatusDetail(
    ctx: CanvasRenderingContext2D,
    p: Player,
    x: number,
    y: number,
    _w: number,
    _h: number,
  ): void {
    ctx.fillStyle = PAL.textGold;
    ctx.fillText("— CHARACTER —", x + 10, y + 16);
    ctx.fillStyle = PAL.textWhite;
    const weapon = p.inventory.weapon();
    const lines = [
      `Weapon   ${weapon?.name ?? "—"}`,
      `Sub-arm  ${p.subweapon}`,
      "",
      "Combat HUD shows bars & resources.",
      "Open EQUIP to change gear.",
      "Open ITEMS to use potions.",
      "MAP shows the castle layout.",
      "SYS: music, save, title.",
    ];
    lines.forEach((l, i) => {
      ctx.fillStyle = l.startsWith(" ") || l.includes("HUD") || l.startsWith("Open") || l.startsWith("MAP") || l.startsWith("SYS")
        ? PAL.uiFrame
        : PAL.textWhite;
      if (l.startsWith("Weapon") || l.startsWith("Sub")) ctx.fillStyle = PAL.textWhite;
      ctx.fillText(l, x + 10, y + 36 + i * 12);
    });
  }

  private drawEquip(
    ctx: CanvasRenderingContext2D,
    p: Player,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y + 1, w - 2, h - 2);
    ctx.clip();

    ctx.fillStyle = PAL.textGold;
    ctx.fillText("— EQUIPMENT —", x + 10, y + 14);

    const base = p.combatStats();
    const listTop = y + 28;
    const rowH = 13;
    SLOTS.forEach(({ slot, label }, i) => {
      const sel = this.cursor === i;
      const rowY = listTop + i * rowH;
      if (sel) {
        ctx.fillStyle = "rgba(80, 60, 120, 0.45)";
        ctx.fillRect(x + 6, rowY - 9, w - 12, 12);
      }
      ctx.fillStyle = sel ? PAL.textGold : PAL.textWhite;
      const id = p.inventory.equipment[slot];
      const name = id ? ITEMS[id].name : "— empty —";
      ctx.fillText(label, x + 10, rowY);
      ctx.fillStyle = id ? (sel ? PAL.textWhite : PAL.uiFrame) : PAL.uiFrameDark;
      ctx.fillText(name, x + 86, rowY);
    });

    const previewY = listTop + SLOTS.length * rowH + 10;
    const sel = SLOTS[this.cursor];
    const id = p.inventory.equipment[sel.slot];
    ctx.fillStyle = PAL.textGold;
    ctx.fillText("— PREVIEW —", x + 10, previewY);
    ctx.fillStyle = PAL.textWhite;
    ctx.fillText(`ATK ${base.attack}   DEF ${base.defense}`, x + 10, previewY + 14);
    if (id) {
      const def = ITEMS[id];
      const bits: string[] = [];
      if (def.kind === "weapon") bits.push(`Weapon ATK ${def.atk}`);
      if (def.kind === "armor" || def.kind === "shield") bits.push(`DEF ${def.def}`);
      if (def.kind !== "consumable" && def.bonus) {
        for (const [k, v] of Object.entries(def.bonus)) {
          if (v) bits.push(`${k.toUpperCase()} ${v > 0 ? "+" : ""}${v}`);
        }
      }
      ctx.fillStyle = PAL.spellCyan;
      const label = bits.length > 0 ? bits.join("  ") : ITEMS[id].name;
      ctx.fillText(label, x + 10, previewY + 26);
      ctx.fillStyle = PAL.uiFrame;
      ctx.fillText("X: unequip to bag", x + 10, previewY + 40);
    } else {
      ctx.fillStyle = PAL.uiFrame;
      ctx.fillText("Equip from ITEMS tab", x + 10, previewY + 26);
    }
    ctx.restore();
  }

  private drawItems(
    ctx: CanvasRenderingContext2D,
    p: Player,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y + 1, w - 2, h - 2);
    ctx.clip();

    ctx.fillStyle = PAL.textGold;
    ctx.fillText("— ITEMS —", x + 10, y + 14);

    if (p.inventory.items.length === 0) {
      ctx.fillStyle = PAL.uiFrame;
      ctx.fillText("(bag empty)", x + 10, y + 36);
      ctx.restore();
      return;
    }

    const icons = PICKUPS!;
    const rowH = 13;
    const listTop = y + 30;
    const detailH = 28;
    const maxRows = Math.max(1, Math.floor((h - 30 - detailH) / rowH));
    const start = Math.max(0, Math.min(this.cursor - maxRows + 1, p.inventory.items.length - maxRows));
    const visible = p.inventory.items.slice(start, start + maxRows);

    visible.forEach((e, vi) => {
      const i = start + vi;
      const sel = this.cursor === i;
      const rowY = listTop + vi * rowH;
      if (sel) {
        ctx.fillStyle = "rgba(80, 60, 120, 0.45)";
        ctx.fillRect(x + 6, rowY - 9, w - 12, 12);
      }
      const def = ITEMS[e.itemId];
      if (def.kind === "consumable" && e.itemId.includes("potion")) {
        ctx.drawImage(icons.potion, x + 10, rowY - 8);
      } else if (e.itemId === "coralRing" || def.kind === "armor") {
        ctx.fillStyle = PAL.gold;
        ctx.fillRect(x + 12, rowY - 5, 5, 5);
      } else if (def.kind === "weapon") {
        ctx.fillStyle = PAL.bladeHi;
        ctx.fillRect(x + 13, rowY - 7, 2, 8);
      } else {
        ctx.fillStyle = PAL.uiFrame;
        ctx.fillRect(x + 12, rowY - 4, 5, 5);
      }
      ctx.fillStyle = sel ? PAL.textGold : PAL.textWhite;
      const tag =
        def.kind === "consumable"
          ? "use"
          : def.kind === "weapon" || def.kind === "armor" || def.kind === "shield"
            ? "eqp"
            : "";
      ctx.fillText(`${def.name}  x${e.count}`, x + 24, rowY);
      ctx.fillStyle = PAL.uiFrame;
      if (tag) ctx.fillText(tag, x + w - 32, rowY);
    });

    const entry = p.inventory.items[this.cursor];
    if (entry) {
      const def = ITEMS[entry.itemId];
      const dy = y + h - 22;
      ctx.fillStyle = PAL.textGold;
      ctx.fillText("— DETAIL —", x + 10, dy);
      ctx.fillStyle = PAL.uiFrame;
      ctx.fillText(this.itemBlurb(def), x + 10, dy + 12);
    }
    ctx.restore();
  }

  private itemBlurb(def: ItemDef): string {
    if (def.kind === "consumable") {
      const parts: string[] = [];
      if (def.restoreHp) parts.push(`Restores ${def.restoreHp} HP`);
      if (def.restoreMp) parts.push(`Restores ${def.restoreMp} MP`);
      return parts.join(" · ") || "Consumable";
    }
    if (def.kind === "weapon") return `${def.class}  ATK ${def.atk}  reach ${def.reach}`;
    if (def.kind === "armor") return `Armor  DEF ${def.def}`;
    if (def.kind === "shield") return `Shield  DEF ${def.def}`;
    return "Item";
  }

  private drawMap(
    ctx: CanvasRenderingContext2D,
    game: Game,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    ctx.fillStyle = PAL.textGold;
    ctx.fillText("— CASTLE MAP —", x + 10, y + 16);
    const room = ROOMS[game.currentRoomId];
    ctx.fillStyle = PAL.textWhite;
    ctx.fillText(room?.name ?? game.currentRoomId, x + 120, y + 16);

    const CELL = 12;
    let minGx = 0;
    let minGy = 0;
    let maxGx = 0;
    let maxGy = 0;
    for (const def of Object.values(ROOMS)) {
      const { gx, gy, gw, gh } = def.mapRect;
      minGx = Math.min(minGx, gx);
      minGy = Math.min(minGy, gy);
      maxGx = Math.max(maxGx, gx + gw);
      maxGy = Math.max(maxGy, gy + gh);
    }
    const gridW = maxGx - minGx;
    const gridH = maxGy - minGy;
    const mapW = gridW * CELL;
    const mapH = gridH * CELL;
    const originX = x + Math.max(10, Math.floor((w - mapW) / 2));
    const originY = y + 28;

    ctx.fillStyle = "rgba(6, 4, 14, 0.95)";
    ctx.fillRect(originX - 4, originY - 4, mapW + 8, mapH + 8);
    ctx.strokeStyle = PAL.uiFrameDark;
    ctx.strokeRect(originX - 3.5, originY - 3.5, mapW + 7, mapH + 7);

    const visited = (id: string) => game.flags.has(`visited:${id}`);

    for (const def of Object.values(ROOMS)) {
      if (!visited(def.id)) continue;
      const { gx, gy, gw, gh } = def.mapRect;
      const rx = originX + (gx - minGx) * CELL;
      const ry = originY + (gy - minGy) * CELL;
      const isCurrent = def.id === game.currentRoomId;
      ctx.fillStyle = isCurrent ? "#5a4a80" : "#2a2038";
      ctx.fillRect(rx, ry, gw * CELL - 1, gh * CELL - 1);
      ctx.strokeStyle = PAL.uiFrame;
      ctx.strokeRect(rx + 0.5, ry + 0.5, gw * CELL - 2, gh * CELL - 2);

      if (def.id === "saveRoom") {
        ctx.fillStyle = PAL.textGold;
        ctx.fillText("♦", rx + 2, ry + 9);
      }
      if (WARP_PADS[def.id]) {
        ctx.fillStyle = PAL.spellCyan;
        ctx.fillText("▲", rx + gw * CELL - 10, ry + 9);
      }
      if (def.id === "shop" && !game.flags.has("quest:coral:done")) {
        ctx.fillStyle = PAL.textGold;
        ctx.fillText("!", rx + (gw * CELL) / 2 - 2, ry + 9);
      }
      if (isCurrent && game.tick % 40 < 25) {
        ctx.fillStyle = PAL.textWhite;
        ctx.fillRect(rx + (gw * CELL) / 2 - 1, ry + (gh * CELL) / 2 - 1, 2, 2);
      }
    }

    // Door notches
    ctx.fillStyle = PAL.uiFrame;
    for (const def of Object.values(ROOMS)) {
      if (!visited(def.id)) continue;
      for (const exit of def.exits) {
        if (!visited(exit.target)) continue;
        const a = def.mapRect;
        const ax = originX + (a.gx - minGx) * CELL;
        const ay = originY + (a.gy - minGy) * CELL;
        const aw = a.gw * CELL - 1;
        const ah = a.gh * CELL - 1;
        if (exit.side === "right") ctx.fillRect(ax + aw - 1, ay + ah / 2 - 1, 3, 2);
        if (exit.side === "left") ctx.fillRect(ax - 1, ay + ah / 2 - 1, 3, 2);
        if (exit.side === "top") ctx.fillRect(ax + aw / 2 - 1, ay - 1, 2, 3);
        if (exit.side === "bottom") ctx.fillRect(ax + aw / 2 - 1, ay + ah - 1, 2, 3);
      }
    }

    const comp = computeCompletion(game.flags);
    const legendY = Math.min(originY + mapH + 16, y + h - 28);
    ctx.fillStyle = PAL.uiFrame;
    ctx.fillText("♦ save   ▲ warp   ! quest   ■ you", x + 10, legendY);
    ctx.fillStyle = PAL.textGold;
    ctx.fillText(
      `Clear ${comp.percent}%   Time ${formatPlayTime(game.playTicks)}   Deaths ${game.deaths}`,
      x + 10,
      legendY + 12,
    );
  }

  private drawSys(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    _h: number,
  ): void {
    ctx.fillStyle = PAL.textGold;
    ctx.fillText("— SYSTEM —", x + 10, y + 16);

    SYS_ROWS.forEach((label, i) => {
      const sel = this.cursor === i;
      const rowY = y + 40 + i * 20;
      if (sel) {
        ctx.fillStyle = "rgba(80, 60, 120, 0.45)";
        ctx.fillRect(x + 6, rowY - 12, w - 12, 18);
      }
      ctx.fillStyle = sel ? PAL.textGold : PAL.textWhite;
      const line = i === 0 ? `Music: ${music.isMuted() ? "OFF" : "ON"}` : label;
      ctx.fillText(`${sel ? "» " : "  "}${line}`, x + 14, rowY);
    });

    ctx.fillStyle = PAL.uiFrame;
    ctx.fillText("Save opens the slot picker and fully heals.", x + 14, y + 120);
    ctx.fillText("Return to title leaves this run (save first!).", x + 14, y + 134);
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
