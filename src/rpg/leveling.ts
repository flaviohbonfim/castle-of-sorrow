import type { Attributes, Resources } from "./stats";

/** EXP needed to go from `level` to `level + 1` (quadratic-ish curve). */
export function expToNext(level: number): number {
  return 20 + level * level * 8;
}

export interface LevelUpResult {
  newLevel: number;
  gains: { maxHp: number; maxMp: number; str: number; con: number; int: number; lck: number };
}

/**
 * Grant EXP; on level-up, grow stats and refill HP/MP (classic SotN reward).
 * Returns results for each level gained so the HUD can announce them.
 */
export function grantExp(
  state: { level: number; exp: number },
  attrs: Attributes,
  res: Resources,
  amount: number,
): LevelUpResult[] {
  state.exp += amount;
  const results: LevelUpResult[] = [];
  while (state.exp >= expToNext(state.level)) {
    state.exp -= expToNext(state.level);
    state.level++;
    const gains = {
      maxHp: 5 + (state.level % 3 === 0 ? 3 : 0),
      maxMp: 2 + (state.level % 2 === 0 ? 2 : 0),
      str: state.level % 2 === 0 ? 1 : 0,
      con: state.level % 3 === 0 ? 1 : 0,
      int: state.level % 2 === 1 ? 1 : 0,
      lck: state.level % 4 === 0 ? 1 : 0,
    };
    res.maxHp += gains.maxHp;
    res.maxMp += gains.maxMp;
    attrs.str += gains.str;
    attrs.con += gains.con;
    attrs.int += gains.int;
    attrs.lck += gains.lck;
    res.hp = res.maxHp;
    res.mp = res.maxMp;
    results.push({ newLevel: state.level, gains });
  }
  return results;
}
