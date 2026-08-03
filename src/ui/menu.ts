import { VIEW_W, VIEW_H } from "../engine/renderer";
import { PAL } from "../gfx/palette";
import { ITEMS, type EquipSlot } from "../rpg/items";
import { expToNext } from "../rpg/leveling";
import { RELIC_NAMES } from "../entities/interactables";
import { audio } from "../engine/audio";
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

/**
 * Pause menu (Tab/E/Esc): stats + equipment + inventory. Arrows navigate,
 * left/right switch column, X equips/uses/unequips. The world is frozen
 * while it is open.
 */
export class Menu {
  open = false;
  private panel: 0 | 1 = 1; // 0 = equipment, 1 = inventory
  private cursor = 0;

  toggle(): void {
    this.open = !this.open;
    this.panel = 1;
    this.cursor = 0;
  }

  update(game: Game): void {
    const input = game.input;
    const p = game.player;
    if (input.pressed("menu") || input.pressed("jump")) {
      input.consume("menu");
      input.consume("jump");
      this.open = false;
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
    if (input.pressed("left") || input.pressed("right")) {
      input.consume("left");
      input.consume("right");
      this.panel = this.panel === 0 ? 1 : 0;
      this.cursor = 0;
    }
    if (input.pressed("attack")) {
      input.consume("attack");
      this.confirm(game);
    }
  }

  private confirm(game: Game): void {
    const p = game.player;
    if (this.panel === 0) {
      // Unequip the highlighted slot.
      const slot = SLOTS[this.cursor].slot;
      if (p.inventory.equipment[slot]) {
        p.inventory.unequip(slot);
        audio.play("pickup");
      }
      return;
    }
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

    ctx.fillStyle = PAL.textGold;
    ctx.fillText("— STATUS —", 24, 28);

    // Stats column
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
    lines.forEach((l, i) => ctx.fillText(l, 24, 44 + i * 11));

    // Relics
    ctx.fillStyle = PAL.spellCyan;
    ctx.fillText("RELICS", 24, 176);
    ctx.fillStyle = PAL.textWhite;
    if (p.relics.size === 0) ctx.fillText("(none)", 24, 188);
    else [...p.relics].forEach((r, i) => ctx.fillText(RELIC_NAMES[r] ?? r, 24, 188 + i * 11));

    // Equipment column
    ctx.fillStyle = this.panel === 0 ? PAL.textGold : PAL.uiFrame;
    ctx.fillText("— EQUIPMENT —", 150, 28);
    SLOTS.forEach(({ slot, label }, i) => {
      const sel = this.panel === 0 && this.cursor === i;
      ctx.fillStyle = sel ? PAL.textGold : PAL.textWhite;
      const id = p.inventory.equipment[slot];
      const name = id ? ITEMS[id].name : "--";
      ctx.fillText(`${sel ? ">" : " "}${label.padEnd(7)} ${name}`, 150, 44 + i * 12);
    });

    // Inventory column
    ctx.fillStyle = this.panel === 1 ? PAL.textGold : PAL.uiFrame;
    ctx.fillText("— ITEMS —", 320, 28);
    if (p.inventory.items.length === 0) {
      ctx.fillStyle = PAL.textWhite;
      ctx.fillText("(empty)", 320, 44);
    }
    p.inventory.items.slice(0, 14).forEach((e, i) => {
      const sel = this.panel === 1 && this.cursor === i;
      ctx.fillStyle = sel ? PAL.textGold : PAL.textWhite;
      ctx.fillText(`${sel ? ">" : " "}${ITEMS[e.itemId].name} x${e.count}`, 320, 44 + i * 12);
    });

    ctx.fillStyle = PAL.uiFrame;
    ctx.fillText("Arrows: navigate   X: equip/use/remove   Tab: close", 24, VIEW_H - 22);
    ctx.restore();
  }
}
