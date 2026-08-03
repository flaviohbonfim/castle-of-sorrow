export type WeaponClass = "sword" | "whip" | "rapier";

export type EquipSlot =
  | "rightHand"
  | "leftHand"
  | "head"
  | "body"
  | "cloak"
  | "accessory1"
  | "accessory2";

export interface StatBonus {
  atk?: number;
  def?: number;
  str?: number;
  con?: number;
  int?: number;
  lck?: number;
  maxHp?: number;
  maxMp?: number;
}

export interface WeaponDef {
  kind: "weapon";
  id: string;
  name: string;
  class: WeaponClass;
  atk: number;
  /** Frame data in ticks — tuning combat feel is editing this table. */
  frames: { startup: number; active: number; recovery: number };
  reach: number; // hitbox length, px
  bonus?: StatBonus;
}

export interface ArmorDef {
  kind: "armor";
  id: string;
  name: string;
  slot: Exclude<EquipSlot, "rightHand" | "leftHand">;
  def: number;
  bonus?: StatBonus;
}

export interface ShieldDef {
  kind: "shield";
  id: string;
  name: string;
  def: number;
  bonus?: StatBonus;
}

export interface ConsumableDef {
  kind: "consumable";
  id: string;
  name: string;
  restoreHp?: number;
  restoreMp?: number;
}

export type ItemDef = WeaponDef | ArmorDef | ShieldDef | ConsumableDef;

/* ------------------------- item catalog ------------------------- */

export const ITEMS: Record<string, ItemDef> = {
  // Weapons: class determines swing feel via frame data.
  shortSword: {
    kind: "weapon", id: "shortSword", name: "Short Sword", class: "sword",
    atk: 8, frames: { startup: 6, active: 8, recovery: 10 }, reach: 26,
  },
  leatherWhip: {
    kind: "weapon", id: "leatherWhip", name: "Leather Whip", class: "whip",
    atk: 6, frames: { startup: 8, active: 10, recovery: 12 }, reach: 40,
  },
  nobleRapier: {
    kind: "weapon", id: "nobleRapier", name: "Noble Rapier", class: "rapier",
    atk: 7, frames: { startup: 4, active: 6, recovery: 8 }, reach: 30, bonus: { lck: 2 },
  },

  // Armor & gear
  ironShield: { kind: "shield", id: "ironShield", name: "Iron Shield", def: 3 },
  leatherCap: { kind: "armor", id: "leatherCap", name: "Leather Cap", slot: "head", def: 1 },
  travelerTunic: { kind: "armor", id: "travelerTunic", name: "Traveler Tunic", slot: "body", def: 3 },
  wornCloak: { kind: "armor", id: "wornCloak", name: "Worn Cloak", slot: "cloak", def: 1, bonus: { lck: 1 } },
  heartBrooch: {
    kind: "armor", id: "heartBrooch", name: "Heart Brooch", slot: "accessory1",
    def: 0, bonus: { maxHp: 10 },
  },
  moonRing: {
    kind: "armor", id: "moonRing", name: "Moon Ring", slot: "accessory2",
    def: 0, bonus: { int: 2, maxMp: 10 },
  },
  coralRing: {
    kind: "armor", id: "coralRing", name: "Coral Ring", slot: "accessory1",
    def: 0, bonus: { lck: 2 },
  },

  // Consumables
  potion: { kind: "consumable", id: "potion", name: "Potion", restoreHp: 50 },
  highPotion: { kind: "consumable", id: "highPotion", name: "High Potion", restoreHp: 120 },
  manaPrism: { kind: "consumable", id: "manaPrism", name: "Mana Prism", restoreMp: 40 },
  roastBeef: { kind: "consumable", id: "roastBeef", name: "Roast Beef", restoreHp: 80 },
};
