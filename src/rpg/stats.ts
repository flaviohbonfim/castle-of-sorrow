/** Core attribute block, SotN-style. */
export interface Attributes {
  str: number; // melee power
  con: number; // defense contribution
  int: number; // spell power / MP
  lck: number; // crit + drop rates
}

export interface Resources {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  hearts: number;
  maxHearts: number;
}

/** Derived combat values, computed from attributes + equipment. */
export interface CombatStats {
  attack: number;
  defense: number;
  critChance: number; // 0..1
}

export function deriveCombat(attrs: Attributes, weaponAtk: number, gearDef: number): CombatStats {
  return {
    attack: weaponAtk + Math.floor(attrs.str / 2),
    defense: gearDef + Math.floor(attrs.con / 3),
    critChance: Math.min(0.35, 0.03 + attrs.lck * 0.008),
  };
}
