import { VIEW_W, VIEW_H } from "../engine/renderer";
import { PAL } from "../gfx/palette";
import { ITEMS, type EquipSlot, type ItemDef } from "../rpg/items";
import { expToNext } from "../rpg/leveling";
import { audio } from "../engine/audio";
import { music } from "../engine/music";
import { ROOMS, WARP_PADS } from "../world/rooms";
import { computeCompletion, formatPlayTime } from "../rpg/completion";
import { resolvePickupSprites } from "../gfx/resolveSprites";
import { localeLabel, relicName, t, toggleLocale } from "../data/i18n";
import { getSettings, saveSettings } from "../engine/settings";
import {
  BESTIARY,
  BESTIARY_META,
  BESTIARY_ORDER,
  isBestiaryUnlocked,
  unlockedBestiaryCount,
  type BestiaryId,
} from "../rpg/bestiary";
import type { Game } from "../game";
import type { Player } from "../entities/player/player";

const SLOT_KEYS: { slot: EquipSlot; key: string }[] = [
  { slot: "rightHand", key: "menu.slot.rightHand" },
  { slot: "leftHand", key: "menu.slot.leftHand" },
  { slot: "head", key: "menu.slot.head" },
  { slot: "body", key: "menu.slot.body" },
  { slot: "cloak", key: "menu.slot.cloak" },
  { slot: "accessory1", key: "menu.slot.accessory1" },
  { slot: "accessory2", key: "menu.slot.accessory2" },
];

const TAB_KEYS = [
  "menu.tab.status",
  "menu.tab.equip",
  "menu.tab.items",
  "menu.tab.map",
  "menu.tab.book",
  "menu.tab.sys",
] as const;
type Panel = 0 | 1 | 2 | 3 | 4 | 5;

/** SYS rows: music, language, scanlines, save, title */
const SYS_COUNT = 5;

let PICKUPS: ReturnType<typeof resolvePickupSprites> | null = null;

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
      this.panel = ((this.panel + TAB_KEYS.length - 1) % TAB_KEYS.length) as Panel;
      this.cursor = 0;
      audio.play("pickup");
    }
    if (input.pressed("right")) {
      input.consume("right");
      this.panel = ((this.panel + 1) % TAB_KEYS.length) as Panel;
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
        return SLOT_KEYS.length;
      case 2:
        return Math.max(1, p.inventory.items.length);
      case 3:
        return 0; // map read-only
      case 4:
        return BESTIARY_ORDER.length; // enemy book
      case 5:
        return SYS_COUNT;
      default:
        return 0;
    }
  }

  private confirm(game: Game): void {
    const p = game.player;
    if (this.panel === 1) {
      const slot = SLOT_KEYS[this.cursor].slot;
      if (p.inventory.equipment[slot]) {
        p.inventory.unequip(slot);
        audio.play("pickup");
        this.flash(t("menu.flash.unequip"));
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
          this.flash(msg || t("menu.flash.used"));
        } else {
          audio.play("hurt");
          this.flash(t("menu.flash.noEffect"));
        }
      } else {
        if (p.inventory.equip(entry.itemId)) {
          audio.play("pickup");
          this.flash(t("menu.flash.equipped", { name: def.name }));
        } else {
          audio.play("hurt");
        }
      }
      this.cursor = Math.min(this.cursor, Math.max(0, p.inventory.items.length - 1));
      return;
    }
    if (this.panel === 5) {
      this.confirmSys(game);
    }
  }

  private confirmSys(game: Game): void {
    switch (this.cursor) {
      case 0:
        music.toggleMuted();
        audio.play("pickup");
        this.flash(music.isMuted() ? t("menu.flash.musicOff") : t("menu.flash.musicOn"));
        break;
      case 1: {
        const loc = toggleLocale();
        saveSettings({ language: loc });
        audio.play("pickup");
        this.flash(t("menu.flash.lang", { lang: localeLabel(loc) }));
        break;
      }
      case 2: {
        const next = !getSettings().scanlines;
        saveSettings({ scanlines: next });
        audio.play("pickup");
        this.flash(next ? t("menu.flash.scanOn") : t("menu.flash.scanOff"));
        break;
      }
      case 3:
        this.open = false;
        game.openSaveSlots();
        break;
      case 4:
        this.open = false;
        game.requestExitToTitle();
        break;
    }
  }

  private flash(text: string): void {
    this.notice = { text, life: 90 };
  }

  draw(ctx: CanvasRenderingContext2D, game: Game): void {
    PICKUPS ??= resolvePickupSprites();
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
    else if (this.panel === 4) this.drawBook(ctx, game, rx, ry, rw, rh);
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
        return t("menu.hint.status");
      case 1:
        return t("menu.hint.equip");
      case 2:
        return t("menu.hint.items");
      case 3:
        return t("menu.hint.map");
      case 4:
        return t("menu.hint.book");
      case 5:
        return t("menu.hint.sys");
      default:
        return "Tab";
    }
  }

  private drawTabs(ctx: CanvasRenderingContext2D): void {
    // Six tabs — slightly tighter so they fit the 480px frame.
    const tabW = 58;
    const startX = CHROME.pad + 2;
    TAB_KEYS.forEach((key, i) => {
      const x = startX + i * (tabW + 2);
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
      ctx.fillText(t(key), x + 6, CHROME.tabY + 9);
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
    ctx.fillText(t("menu.status"), left, row);
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
    ctx.fillText(t("menu.combat"), left, row);
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
    ctx.fillText(t("menu.relics"), left, row);
    row += 10;
    const relics = [...p.relics];
    if (relics.length === 0) {
      ctx.fillStyle = PAL.uiFrame;
      ctx.fillText(t("menu.none"), left, row);
    } else {
      const lineH = 9;
      const maxLines = Math.max(1, Math.floor((y + h - 4 - row) / lineH));
      relics.slice(0, maxLines).forEach((r, i) => {
        const name = relicName(r);
        const short = name.length > 18 ? name.slice(0, 17) + "…" : name;
        ctx.fillStyle = PAL.textWhite;
        ctx.fillText(`·${short}`, left, row + i * lineH);
      });
      if (relics.length > maxLines) {
        ctx.fillStyle = PAL.uiFrame;
        ctx.fillText(t("menu.more", { n: relics.length - maxLines }), left, row + maxLines * lineH);
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
    ctx.fillText(t("menu.character"), x + 10, y + 16);
    ctx.fillStyle = PAL.textWhite;
    const weapon = p.inventory.weapon();
    const lines = [
      `${t("menu.weapon")}   ${weapon?.name ?? "—"}`,
      `Sub  ${p.subweapon}`,
      "",
      t("tip.1"),
      t("tip.2"),
      t("tip.3"),
      t("tip.4"),
      t("tip.5"),
    ];
    lines.forEach((l, i) => {
      ctx.fillStyle = i >= 3 ? PAL.uiFrame : PAL.textWhite;
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
    ctx.fillText(t("menu.equipment"), x + 10, y + 14);

    const base = p.combatStats();
    const listTop = y + 28;
    const rowH = 13;
    SLOT_KEYS.forEach(({ slot, key }, i) => {
      const sel = this.cursor === i;
      const rowY = listTop + i * rowH;
      if (sel) {
        ctx.fillStyle = "rgba(80, 60, 120, 0.45)";
        ctx.fillRect(x + 6, rowY - 9, w - 12, 12);
      }
      ctx.fillStyle = sel ? PAL.textGold : PAL.textWhite;
      const id = p.inventory.equipment[slot];
      const name = id ? ITEMS[id].name : t("menu.empty");
      ctx.fillText(t(key), x + 10, rowY);
      ctx.fillStyle = id ? (sel ? PAL.textWhite : PAL.uiFrame) : PAL.uiFrameDark;
      ctx.fillText(name, x + 86, rowY);
    });

    const previewY = listTop + SLOT_KEYS.length * rowH + 10;
    const sel = SLOT_KEYS[this.cursor];
    const id = p.inventory.equipment[sel.slot];
    ctx.fillStyle = PAL.textGold;
    ctx.fillText("— PREVIEW —", x + 10, previewY);
    ctx.fillStyle = PAL.textWhite;
    ctx.fillText(`ATK ${base.attack}   DEF ${base.defense}`, x + 10, previewY + 14);
    if (id) {
      const def = ITEMS[id];
      const bits: string[] = [];
      if (def.kind === "weapon") bits.push(`ATK ${def.atk}`);
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
      ctx.fillText(t("menu.hint.equip"), x + 10, previewY + 40);
    } else {
      ctx.fillStyle = PAL.uiFrame;
      ctx.fillText(t("menu.tab.items"), x + 10, previewY + 26);
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
    ctx.fillText(t("menu.items"), x + 10, y + 14);

    if (p.inventory.items.length === 0) {
      ctx.fillStyle = PAL.uiFrame;
      ctx.fillText(t("menu.emptyItems"), x + 10, y + 36);
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
    ctx.fillText(t("menu.map"), x + 10, y + 16);
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

  /**
   * SotN-style enemy book: list every catalog entry; locked ones show ????.
   * Unlock flag `bestiary:<id>` on first hit/kill.
   */
  private drawBook(
    ctx: CanvasRenderingContext2D,
    game: Game,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y + 1, w - 2, h - 2);
    ctx.clip();

    const unlocked = unlockedBestiaryCount(game.flags);
    const total = BESTIARY_ORDER.length;
    ctx.fillStyle = PAL.textGold;
    ctx.fillText(t("menu.book"), x + 10, y + 14);
    ctx.fillStyle = PAL.uiFrame;
    ctx.fillText(t("menu.book.count", { n: unlocked, total }), x + 10, y + 26);

    // Left list
    const listX = x + 8;
    const listTop = y + 38;
    const rowH = 14;
    const listW = Math.floor(w * 0.42);
    const maxRows = Math.max(1, Math.floor((h - 50) / rowH));
    const start = Math.max(
      0,
      Math.min(this.cursor - maxRows + 1, BESTIARY_ORDER.length - maxRows),
    );

    for (let vi = 0; vi < maxRows && start + vi < BESTIARY_ORDER.length; vi++) {
      const i = start + vi;
      const id = BESTIARY_ORDER[i];
      const known = isBestiaryUnlocked(game.flags, id);
      const meta = BESTIARY_META[id];
      const sel = this.cursor === i;
      const rowY = listTop + vi * rowH;
      if (sel) {
        ctx.fillStyle = "rgba(80, 60, 120, 0.5)";
        ctx.fillRect(listX - 2, rowY - 10, listW, 13);
      }
      ctx.fillStyle = !known
        ? PAL.uiFrameDark
        : sel
          ? PAL.textGold
          : meta.boss
            ? PAL.spellCyan
            : PAL.textWhite;
      const label = known ? t(meta.nameKey) : t("menu.book.unknown");
      const mark = sel ? "» " : "  ";
      ctx.fillText(`${mark}${label}`, listX, rowY);
    }

    // Detail panel
    const dx = x + listW + 10;
    const dw = w - listW - 18;
    ctx.strokeStyle = PAL.uiFrameDark;
    ctx.strokeRect(dx - 4 + 0.5, listTop - 14 + 0.5, dw + 6, h - 48);

    const id = BESTIARY_ORDER[this.cursor] as BestiaryId;
    const known = isBestiaryUnlocked(game.flags, id);
    const meta = BESTIARY_META[id];
    const stats = BESTIARY[id];

    if (!known) {
      ctx.fillStyle = PAL.uiFrameDark;
      ctx.font = "16px 'Courier New', monospace";
      ctx.fillText("?", dx + dw / 2 - 6, listTop + 30);
      ctx.font = "8px 'Courier New', monospace";
      ctx.fillText(t("menu.book.unknown"), dx + 6, listTop + 50);
      ctx.fillStyle = PAL.uiFrame;
      const tip = t("menu.book.hint");
      this.wrapText(ctx, tip, dx + 6, listTop + 70, dw - 10, 11);
    } else {
      ctx.fillStyle = meta.boss ? PAL.textGold : PAL.textWhite;
      ctx.fillText(t(meta.nameKey), dx + 6, listTop);
      if (meta.boss) {
        ctx.fillStyle = PAL.spellCyan;
        ctx.fillText(t("menu.book.boss"), dx + 6, listTop + 12);
      }
      const statY = listTop + (meta.boss ? 28 : 16);
      ctx.fillStyle = PAL.textWhite;
      ctx.fillText(`${t("menu.book.hp")}  ${stats.hp}`, dx + 6, statY);
      ctx.fillText(`${t("menu.book.atk")} ${stats.touchPower}`, dx + 6, statY + 12);
      ctx.fillText(`${t("menu.book.def")} ${stats.defense}`, dx + 6, statY + 24);
      ctx.fillText(`${t("menu.book.exp")} ${stats.exp}`, dx + 6, statY + 36);

      ctx.fillStyle = PAL.uiFrame;
      this.wrapText(ctx, t(meta.descKey), dx + 6, statY + 54, dw - 10, 11);
    }

    ctx.restore();
  }

  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxW: number,
    lineH: number,
  ): void {
    const words = text.split(" ");
    let line = "";
    let yy = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy);
        line = word;
        yy += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
  }

  private drawSys(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    _h: number,
  ): void {
    ctx.fillStyle = PAL.textGold;
    ctx.fillText(t("menu.sys"), x + 10, y + 16);

    const scan = getSettings().scanlines;
    const rows = [
      music.isMuted() ? t("menu.sys.musicOff") : t("menu.sys.musicOn"),
      `${t("menu.sys.lang")}: ${localeLabel()}`,
      scan ? t("menu.sys.scanOn") : t("menu.sys.scanOff"),
      t("menu.sys.save"),
      t("menu.sys.title"),
    ];
    rows.forEach((line, i) => {
      const sel = this.cursor === i;
      const rowY = y + 36 + i * 18;
      if (sel) {
        ctx.fillStyle = "rgba(80, 60, 120, 0.45)";
        ctx.fillRect(x + 6, rowY - 12, w - 12, 16);
      }
      ctx.fillStyle = sel ? PAL.textGold : PAL.textWhite;
      ctx.fillText(`${sel ? "» " : "  "}${line}`, x + 14, rowY);
    });

    ctx.fillStyle = PAL.uiFrame;
    ctx.fillText(t("tip.3"), x + 14, y + 148);
    ctx.fillText(t("tip.4"), x + 14, y + 160);
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
