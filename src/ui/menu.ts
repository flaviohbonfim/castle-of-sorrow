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
  pad: 10,
  tabY: 16,
  tabH: 14,
  bodyTop: 36,
  footerY: VIEW_H - 16,
  leftW: 148,
  gap: 6,
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

    // Footer
    ctx.fillStyle = "rgba(8, 4, 16, 0.9)";
    ctx.fillRect(CHROME.pad, CHROME.footerY - 4, VIEW_W - CHROME.pad * 2, 14);
    ctx.fillStyle = PAL.uiFrame;
    const hint = this.hintForPanel();
    ctx.fillText(hint, CHROME.pad + 4, CHROME.footerY + 6);

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
    const tabW = 70;
    const startX = CHROME.pad + 4;
    TABS.forEach((t, i) => {
      const x = startX + i * (tabW + 4);
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
      ctx.fillText(t, x + 8, CHROME.tabY + 10);
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
    const h = CHROME.footerY - y - 8;
    this.plate(ctx, x, y, w, h);

    ctx.fillStyle = PAL.textGold;
    ctx.fillText("STATUS", x + 8, y + 14);

    const stats = p.combatStats();
    const attrs = p.inventory.effectiveAttributes(p.attrs);
    const comp = computeCompletion(game.flags);

    // HP / MP bars
    ctx.fillStyle = PAL.textWhite;
    ctx.fillText("HP", x + 8, y + 30);
    this.bar(ctx, x + 24, y + 24, 80, 5, p.res.hp / Math.max(1, p.res.maxHp), PAL.hpRed, PAL.hpRedHi);
    ctx.textAlign = "right";
    ctx.fillText(`${p.res.hp}/${p.res.maxHp}`, x + w - 8, y + 30);
    ctx.textAlign = "left";

    ctx.fillText("MP", x + 8, y + 44);
    this.bar(ctx, x + 24, y + 38, 80, 4, p.res.mp / Math.max(1, p.res.maxMp), PAL.mpBlue, PAL.mpBlueHi);
    ctx.textAlign = "right";
    ctx.fillStyle = PAL.mpBlueHi;
    ctx.fillText(`${Math.floor(p.res.mp)}/${p.res.maxMp}`, x + w - 8, y + 44);
    ctx.textAlign = "left";

    // Level + exp bar
    ctx.fillStyle = PAL.textWhite;
    ctx.fillText(`LV ${p.levelState.level}`, x + 8, y + 60);
    const need = expToNext(p.levelState.level);
    this.bar(ctx, x + 48, y + 54, 56, 3, p.levelState.exp / Math.max(1, need), PAL.spellCyan, PAL.textWhite);
    ctx.fillStyle = PAL.uiFrame;
    ctx.fillText(`${p.levelState.exp}/${need}`, x + 8, y + 72);

    // Combat
    ctx.fillStyle = PAL.textGold;
    ctx.fillText("COMBAT", x + 8, y + 90);
    ctx.fillStyle = PAL.textWhite;
    ctx.fillText(`ATK  ${stats.attack}`, x + 8, y + 104);
    ctx.fillText(`DEF  ${stats.defense}`, x + 72, y + 104);

    ctx.fillStyle = PAL.uiFrame;
    ctx.fillText(`STR ${attrs.str}`, x + 8, y + 118);
    ctx.fillText(`CON ${attrs.con}`, x + 72, y + 118);
    ctx.fillText(`INT ${attrs.int}`, x + 8, y + 130);
    ctx.fillText(`LCK ${attrs.lck}`, x + 72, y + 130);

    ctx.fillStyle = PAL.textWhite;
    ctx.fillText(`♥ ${p.res.hearts}/${p.res.maxHearts}`, x + 8, y + 146);
    ctx.fillStyle = PAL.textGold;
    ctx.fillText(`$ ${p.inventory.gold}`, x + 72, y + 146);

    ctx.fillStyle = PAL.uiFrame;
    ctx.fillText(`Clear ${comp.percent}%`, x + 8, y + 162);
    ctx.fillText(formatPlayTime(game.playTicks), x + 80, y + 162);

    // Relics
    ctx.fillStyle = PAL.spellCyan;
    ctx.fillText("RELICS", x + 8, y + 180);
    ctx.fillStyle = PAL.textWhite;
    const relics = [...p.relics];
    if (relics.length === 0) {
      ctx.fillStyle = PAL.uiFrame;
      ctx.fillText("(none)", x + 8, y + 194);
    } else {
      relics.slice(0, 6).forEach((r, i) => {
        const name = RELIC_NAMES[r] ?? r;
        const short = name.length > 16 ? name.slice(0, 15) + "…" : name;
        ctx.fillText(`· ${short}`, x + 8, y + 194 + i * 11);
      });
    }
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
    _h: number,
  ): void {
    ctx.fillStyle = PAL.textGold;
    ctx.fillText("— EQUIPMENT —", x + 10, y + 16);

    const base = p.combatStats();
    SLOTS.forEach(({ slot, label }, i) => {
      const sel = this.cursor === i;
      const rowY = y + 32 + i * 14;
      if (sel) {
        ctx.fillStyle = "rgba(80, 60, 120, 0.45)";
        ctx.fillRect(x + 6, rowY - 10, w - 12, 13);
      }
      ctx.fillStyle = sel ? PAL.textGold : PAL.textWhite;
      const id = p.inventory.equipment[slot];
      const name = id ? ITEMS[id].name : "— empty —";
      ctx.fillText(`${label}`, x + 12, rowY);
      ctx.fillStyle = id ? (sel ? PAL.textWhite : PAL.uiFrame) : PAL.uiFrameDark;
      ctx.fillText(name, x + 88, rowY);
    });

    // Preview of selected slot contribution
    const sel = SLOTS[this.cursor];
    const id = p.inventory.equipment[sel.slot];
    ctx.fillStyle = PAL.textGold;
    ctx.fillText("— PREVIEW —", x + 10, y + 150);
    ctx.fillStyle = PAL.textWhite;
    ctx.fillText(`ATK ${base.attack}   DEF ${base.defense}`, x + 10, y + 166);
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
      ctx.fillText(label, x + 10, y + 180);
      ctx.fillStyle = PAL.uiFrame;
      ctx.fillText("X: unequip to bag", x + 10, y + 196);
    } else {
      ctx.fillStyle = PAL.uiFrame;
      ctx.fillText("Equip from ITEMS tab", x + 10, y + 180);
    }
  }

  private drawItems(
    ctx: CanvasRenderingContext2D,
    p: Player,
    x: number,
    y: number,
    w: number,
    _h: number,
  ): void {
    ctx.fillStyle = PAL.textGold;
    ctx.fillText("— ITEMS —", x + 10, y + 16);

    if (p.inventory.items.length === 0) {
      ctx.fillStyle = PAL.uiFrame;
      ctx.fillText("(bag empty)", x + 10, y + 40);
      return;
    }

    const icons = PICKUPS!;
    p.inventory.items.slice(0, 12).forEach((e, i) => {
      const sel = this.cursor === i;
      const rowY = y + 34 + i * 14;
      if (sel) {
        ctx.fillStyle = "rgba(80, 60, 120, 0.45)";
        ctx.fillRect(x + 6, rowY - 10, w - 12, 13);
      }
      const def = ITEMS[e.itemId];
      // Icon when we have a matching pickup sprite
      if (def.kind === "consumable" && e.itemId.includes("potion")) {
        ctx.drawImage(icons.potion, x + 10, rowY - 9);
      } else if (e.itemId === "coralRing" || def.kind === "armor") {
        // small gem proxy via gold coin tint area
        ctx.fillStyle = PAL.gold;
        ctx.fillRect(x + 12, rowY - 6, 5, 5);
      } else if (def.kind === "weapon") {
        ctx.fillStyle = PAL.bladeHi;
        ctx.fillRect(x + 13, rowY - 8, 2, 8);
      } else {
        ctx.fillStyle = PAL.uiFrame;
        ctx.fillRect(x + 12, rowY - 5, 5, 5);
      }
      ctx.fillStyle = sel ? PAL.textGold : PAL.textWhite;
      const tag =
        def.kind === "consumable" ? "use" : def.kind === "weapon" || def.kind === "armor" || def.kind === "shield" ? "eqp" : "";
      ctx.fillText(`${def.name}  x${e.count}`, x + 24, rowY);
      ctx.fillStyle = PAL.uiFrame;
      if (tag) ctx.fillText(tag, x + w - 36, rowY);
    });

    const entry = p.inventory.items[this.cursor];
    if (entry) {
      const def = ITEMS[entry.itemId];
      ctx.fillStyle = PAL.textGold;
      ctx.fillText("— DETAIL —", x + 10, y + 210);
      ctx.fillStyle = PAL.uiFrame;
      ctx.fillText(this.itemBlurb(def), x + 10, y + 224);
    }
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
