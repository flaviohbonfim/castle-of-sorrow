import { VIEW_W, VIEW_H } from "../engine/renderer";
import { PAL } from "../gfx/palette";
import { ITEMS, type EquipSlot } from "../rpg/items";
import { expToNext } from "../rpg/leveling";
import { RELIC_NAMES } from "../entities/interactables";
import { audio } from "../engine/audio";
import { music } from "../engine/music";
import { ROOMS, WARP_PADS } from "../world/rooms";
import type { Game } from "../game";

const SLOTS: { slot: EquipSlot; label: string }[] = [
  { slot: "rightHand", label: "R.Hand" },
  { slot: "leftHand", label: "L.Hand" },
  { slot: "head", label: "Head" },
  { slot: "body", label: "Body" },
  { slot: "cloak", label: "Cloak" },
  { slot: "accessory1", label: "Acc.1" },
  { slot: "accessory2", label: "Acc.2" },
];

type Panel = 0 | 1 | 2; // equipment | items | map

/**
 * Pause menu (Tab/E/Esc): stats + equipment + inventory + map.
 * Left/right cycles panels. World is frozen while open.
 */
export class Menu {
  open = false;
  private panel: Panel = 1;
  private cursor = 0;

  toggle(): void {
    this.open = !this.open;
    this.panel = 1;
    this.cursor = 0;
  }

  update(game: Game): void {
    const input = game.input;
    const p = game.player;
    if (input.pressed("menu")) {
      input.consume("menu");
      this.open = false;
      return;
    }
    // Jump closes only on equip/items (map uses jump for nothing).
    if (input.pressed("jump") && this.panel !== 2) {
      input.consume("jump");
      this.open = false;
      return;
    }

    if (input.pressed("left")) {
      input.consume("left");
      this.panel = ((this.panel + 2) % 3) as Panel;
      this.cursor = 0;
    }
    if (input.pressed("right")) {
      input.consume("right");
      this.panel = ((this.panel + 1) % 3) as Panel;
      this.cursor = 0;
    }

    if (this.panel === 2) {
      // Map panel: attack toggles music.
      if (input.pressed("attack")) {
        input.consume("attack");
        music.toggleMuted();
        audio.play("pickup");
      }
      return;
    }

    const listLen = this.panel === 0 ? SLOTS.length : Math.max(1, p.inventory.items.length);
    if (input.pressed("down")) {
      input.consume("down");
      this.cursor = (this.cursor + 1) % listLen;
    }
    if (input.pressed("up")) {
      input.consume("up");
      this.cursor = (this.cursor - 1 + listLen) % listLen;
    }
    if (input.pressed("attack")) {
      input.consume("attack");
      this.confirm(game);
    }
  }

  private confirm(game: Game): void {
    const p = game.player;
    if (this.panel === 0) {
      const slot = SLOTS[this.cursor].slot;
      if (p.inventory.equipment[slot]) {
        p.inventory.unequip(slot);
        audio.play("pickup");
      }
      return;
    }
    if (this.panel !== 1) return;
    const entry = p.inventory.items[this.cursor];
    if (!entry) return;
    const def = ITEMS[entry.itemId];
    if (def.kind === "consumable") {
      let used = false;
      if (def.restoreHp && p.res.hp < p.res.maxHp) {
        p.res.hp = Math.min(p.res.maxHp, p.res.hp + def.restoreHp);
        used = true;
      }
      if (def.restoreMp && p.res.mp < p.res.maxMp) {
        p.res.mp = Math.min(p.res.maxMp, p.res.mp + def.restoreMp);
        used = true;
      }
      if (used) {
        p.inventory.remove(entry.itemId);
        audio.play("heart");
      }
    } else {
      if (p.inventory.equip(entry.itemId)) audio.play("pickup");
    }
    this.cursor = Math.min(this.cursor, Math.max(0, p.inventory.items.length - 1));
  }

  draw(ctx: CanvasRenderingContext2D, game: Game): void {
    const p = game.player;
    ctx.save();
    ctx.fillStyle = "rgba(6, 4, 14, 0.82)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.strokeStyle = PAL.uiFrame;
    ctx.strokeRect(12.5, 12.5, VIEW_W - 25, VIEW_H - 25);
    ctx.font = "8px 'Courier New', monospace";

    // Panel tabs
    const tabs = ["EQUIP", "ITEMS", "MAP"];
    tabs.forEach((t, i) => {
      ctx.fillStyle = this.panel === i ? PAL.textGold : PAL.uiFrame;
      ctx.fillText(`${this.panel === i ? "[" : " "}${t}${this.panel === i ? "]" : " "}`, 24 + i * 70, 26);
    });

    // Left status column (always)
    ctx.fillStyle = PAL.textGold;
    ctx.fillText("— STATUS —", 24, 44);
    const stats = p.combatStats();
    const attrs = p.inventory.effectiveAttributes(p.attrs);
    const lines = [
      `LV   ${p.levelState.level}`,
      `EXP  ${p.levelState.exp}/${expToNext(p.levelState.level)}`,
      `HP   ${p.res.hp}/${p.res.maxHp}`,
      `MP   ${Math.floor(p.res.mp)}/${p.res.maxMp}`,
      `HRT  ${p.res.hearts}/${p.res.maxHearts}`,
      `GOLD ${p.inventory.gold}`,
      "",
      `ATK  ${stats.attack}`,
      `DEF  ${stats.defense}`,
      `STR ${attrs.str}  CON ${attrs.con}`,
      `INT ${attrs.int}  LCK ${attrs.lck}`,
    ];
    ctx.fillStyle = PAL.textWhite;
    lines.forEach((l, i) => ctx.fillText(l, 24, 58 + i * 10));

    ctx.fillStyle = PAL.spellCyan;
    ctx.fillText("RELICS", 24, 180);
    ctx.fillStyle = PAL.textWhite;
    if (p.relics.size === 0) ctx.fillText("(none)", 24, 192);
    else [...p.relics].forEach((r, i) => ctx.fillText(RELIC_NAMES[r] ?? r, 24, 192 + i * 10));

    if (this.panel === 0) this.drawEquip(ctx, p);
    else if (this.panel === 1) this.drawItems(ctx, p);
    else this.drawMap(ctx, game);

    ctx.fillStyle = PAL.uiFrame;
    const hint =
      this.panel === 2
        ? "←→ panels   X: music on/off   Tab: close"
        : "←→ panels   ↑↓ navigate   X: use   Tab: close";
    ctx.fillText(hint, 24, VIEW_H - 20);
    ctx.restore();
  }

  private drawEquip(ctx: CanvasRenderingContext2D, p: import("../entities/player/player").Player): void {
    ctx.fillStyle = PAL.textGold;
    ctx.fillText("— EQUIPMENT —", 160, 44);
    SLOTS.forEach(({ slot, label }, i) => {
      const sel = this.cursor === i;
      ctx.fillStyle = sel ? PAL.textGold : PAL.textWhite;
      const id = p.inventory.equipment[slot];
      const name = id ? ITEMS[id].name : "--";
      ctx.fillText(`${sel ? ">" : " "}${label.padEnd(7)} ${name}`, 160, 60 + i * 12);
    });
  }

  private drawItems(ctx: CanvasRenderingContext2D, p: import("../entities/player/player").Player): void {
    ctx.fillStyle = PAL.textGold;
    ctx.fillText("— ITEMS —", 160, 44);
    if (p.inventory.items.length === 0) {
      ctx.fillStyle = PAL.textWhite;
      ctx.fillText("(empty)", 160, 60);
      return;
    }
    p.inventory.items.slice(0, 14).forEach((e, i) => {
      const sel = this.cursor === i;
      ctx.fillStyle = sel ? PAL.textGold : PAL.textWhite;
      ctx.fillText(`${sel ? ">" : " "}${ITEMS[e.itemId].name} x${e.count}`, 160, 60 + i * 12);
    });
  }

  private drawMap(ctx: CanvasRenderingContext2D, game: Game): void {
    ctx.fillStyle = PAL.textGold;
    ctx.fillText("— CASTLE MAP —", 160, 44);

    const CELL = 14;
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
    const originX = 168;
    const originY = 58;

    // Background
    const gridW = maxGx - minGx;
    const gridH = maxGy - minGy;
    ctx.fillStyle = "rgba(10, 6, 20, 0.9)";
    ctx.fillRect(originX - 4, originY - 4, gridW * CELL + 8, gridH * CELL + 8);

    const visited = (id: string) => game.flags.has(`visited:${id}`);

    // Room boxes
    for (const def of Object.values(ROOMS)) {
      if (!visited(def.id)) continue;
      const { gx, gy, gw, gh } = def.mapRect;
      const x = originX + (gx - minGx) * CELL;
      const y = originY + (gy - minGy) * CELL;
      const isCurrent = def.id === game.currentRoomId;
      ctx.fillStyle = isCurrent ? "#5a4a80" : "#2a2038";
      ctx.fillRect(x, y, gw * CELL - 2, gh * CELL - 2);
      ctx.strokeStyle = PAL.uiFrame;
      ctx.strokeRect(x + 0.5, y + 0.5, gw * CELL - 3, gh * CELL - 3);

      // Markers: save ♦, warp ▲
      const hasSave = def.id === "saveRoom";
      const hasWarp = !!WARP_PADS[def.id];
      ctx.fillStyle = PAL.textGold;
      if (hasSave) {
        ctx.fillText("♦", x + 2, y + 10);
      }
      if (hasWarp) {
        ctx.fillStyle = PAL.spellCyan;
        ctx.fillText("▲", x + gw * CELL - 12, y + 10);
      }
      // Quest bang on the Hermit's den while coral quest is open.
      if (def.id === "shop" && !game.flags.has("quest:coral:done")) {
        ctx.fillStyle = PAL.textGold;
        ctx.fillText("!", x + gw * CELL / 2 - 2, y + 10);
      }

      // Blink current
      if (isCurrent && game.tick % 40 < 25) {
        ctx.fillStyle = PAL.textWhite;
        ctx.fillRect(x + (gw * CELL) / 2 - 2, y + (gh * CELL) / 2 - 2, 3, 3);
      }
    }

    // Door notches between visited rooms that link via exits
    ctx.fillStyle = PAL.uiFrame;
    for (const def of Object.values(ROOMS)) {
      if (!visited(def.id)) continue;
      for (const exit of def.exits) {
        if (!visited(exit.target)) continue;
        const a = def.mapRect;
        const b = ROOMS[exit.target]?.mapRect;
        if (!b) continue;
        // Notch on the shared edge of room A toward the exit side
        const ax = originX + (a.gx - minGx) * CELL;
        const ay = originY + (a.gy - minGy) * CELL;
        const aw = a.gw * CELL - 2;
        const ah = a.gh * CELL - 2;
        const n = 3;
        if (exit.side === "right") ctx.fillRect(ax + aw - 1, ay + ah / 2 - 1, n, 2);
        if (exit.side === "left") ctx.fillRect(ax - 1, ay + ah / 2 - 1, n, 2);
        if (exit.side === "top") ctx.fillRect(ax + aw / 2 - 1, ay - 1, 2, n);
        if (exit.side === "bottom") ctx.fillRect(ax + aw / 2 - 1, ay + ah - 1, 2, n);
      }
    }

    // Legend + options
    ctx.fillStyle = PAL.textWhite;
    ctx.fillText("♦ save  ▲ warp  ! quest  ■ you", 160, originY + gridH * CELL + 18);
    ctx.fillStyle = music.isMuted() ? PAL.uiFrame : PAL.textGold;
    ctx.fillText(`Music: ${music.isMuted() ? "OFF" : "ON"}  (X toggle)`, 160, originY + gridH * CELL + 30);
  }
}
