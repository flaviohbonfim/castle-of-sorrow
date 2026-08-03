import type { Attributes } from "./stats";
import {
  ITEMS,
  type ArmorDef,
  type ConsumableDef,
  type EquipSlot,
  type ItemDef,
  type ShieldDef,
  type StatBonus,
  type WeaponDef,
} from "./items";

export interface InventoryEntry {
  itemId: string;
  count: number;
}

/**
 * Inventory + SotN-style equipment loadout. Equipment contributes ATK/DEF and
 * stat bonuses through `equipmentTotals`, which the combat engine reads every
 * hit — equipping better gear immediately changes damage math.
 */
export class Inventory {
  items: InventoryEntry[] = [];
  gold = 0;

  equipment: Record<EquipSlot, string | null> = {
    rightHand: null,
    leftHand: null,
    head: null,
    body: null,
    cloak: null,
    accessory1: null,
    accessory2: null,
  };

  add(itemId: string, count = 1): void {
    if (!ITEMS[itemId]) throw new Error(`Unknown item: ${itemId}`);
    const entry = this.items.find((e) => e.itemId === itemId);
    if (entry) entry.count += count;
    else this.items.push({ itemId, count });
  }

  remove(itemId: string, count = 1): boolean {
    const i = this.items.findIndex((e) => e.itemId === itemId);
    if (i < 0 || this.items[i].count < count) return false;
    this.items[i].count -= count;
    if (this.items[i].count === 0) this.items.splice(i, 1);
    return true;
  }

  count(itemId: string): number {
    return this.items.find((e) => e.itemId === itemId)?.count ?? 0;
  }

  /** Equip from inventory into the item's natural slot. Returns success. */
  equip(itemId: string): boolean {
    const def = ITEMS[itemId] as ItemDef | undefined;
    if (!def || this.count(itemId) === 0) return false;
    let slot: EquipSlot;
    if (def.kind === "weapon") slot = "rightHand";
    else if (def.kind === "shield") slot = "leftHand";
    else if (def.kind === "armor") slot = def.slot;
    else return false; // consumables aren't equippable
    if (this.equipment[slot]) this.add(this.equipment[slot]!);
    this.remove(itemId);
    this.equipment[slot] = itemId;
    return true;
  }

  unequip(slot: EquipSlot): void {
    const cur = this.equipment[slot];
    if (cur) {
      this.add(cur);
      this.equipment[slot] = null;
    }
  }

  weapon(): WeaponDef | null {
    const id = this.equipment.rightHand;
    const def = id ? ITEMS[id] : null;
    return def?.kind === "weapon" ? def : null;
  }

  /** Sum ATK/DEF and bonus stats across everything equipped. */
  equipmentTotals(): { atk: number; def: number; bonus: Required<StatBonus> } {
    let atk = 0;
    let def = 0;
    const bonus: Required<StatBonus> = { atk: 0, def: 0, str: 0, con: 0, int: 0, lck: 0, maxHp: 0, maxMp: 0 };
    for (const id of Object.values(this.equipment)) {
      if (!id) continue;
      const item = ITEMS[id];
      if (item.kind === "weapon") atk += item.atk;
      else if (item.kind === "shield" || item.kind === "armor") def += (item as ShieldDef | ArmorDef).def;
      if (item.kind !== "consumable" && item.bonus) {
        for (const [k, v] of Object.entries(item.bonus)) {
          bonus[k as keyof StatBonus] += v;
        }
      }
    }
    return { atk, def, bonus };
  }

  /** Apply equipment bonuses on top of base attributes. */
  effectiveAttributes(base: Attributes): Attributes {
    const { bonus } = this.equipmentTotals();
    return {
      str: base.str + bonus.str,
      con: base.con + bonus.con,
      int: base.int + bonus.int,
      lck: base.lck + bonus.lck,
    };
  }

  consumable(itemId: string): ConsumableDef | null {
    const def = ITEMS[itemId];
    return def?.kind === "consumable" && this.count(itemId) > 0 ? def : null;
  }
}
