import type { EnemyStats } from "../entities/enemies/enemy";

/**
 * Single source of truth for enemy combat stats.
 * Target feel (LV1 short sword ~ ATK 11):
 *  - entrance fodder dies in 2–3 hits
 *  - tower elites need ~5 hits or better gear
 */
export const BESTIARY = {
  skeleton: {
    hp: 22,
    defense: 1,
    touchPower: 9,
    exp: 12,
    goldChance: 0.35,
    heartChance: 0.3,
  },
  bat: {
    hp: 8,
    defense: 0,
    touchPower: 7,
    exp: 6,
    goldChance: 0.15,
    heartChance: 0.45,
  },
  fishman: {
    hp: 18,
    defense: 1,
    touchPower: 12,
    exp: 16,
    goldChance: 0.3,
    heartChance: 0.35,
  },
  medusaHead: {
    hp: 5,
    defense: 0,
    touchPower: 10,
    exp: 5,
    goldChance: 0.08,
    heartChance: 0.2,
  },
  axeKnight: {
    hp: 42,
    defense: 6,
    touchPower: 14,
    exp: 30,
    goldChance: 0.4,
    heartChance: 0.25,
  },
  colossus: {
    hp: 170,
    defense: 4,
    touchPower: 14,
    exp: 150,
    goldChance: 1,
    heartChance: 0,
  },
  wraith: {
    hp: 220,
    defense: 5,
    touchPower: 16,
    exp: 200,
    goldChance: 1,
    heartChance: 0,
  },
  /** Final boss — Colossus rematch with extra bulk. */
  sovereign: {
    hp: 280,
    defense: 6,
    touchPower: 18,
    exp: 300,
    goldChance: 1,
    heartChance: 0,
  },
} as const satisfies Record<string, EnemyStats>;

export type BestiaryId = keyof typeof BESTIARY;

/** Apply NG+ multiplier when flag `ng+:1` is set. */
export function statsFor(id: BestiaryId, flags?: Set<string>): EnemyStats {
  const base = BESTIARY[id];
  const ng = flags?.has("ng+:1") ? 1.5 : 1;
  if (ng === 1) return { ...base };
  return {
    hp: Math.round(base.hp * ng),
    defense: Math.round(base.defense * ng),
    touchPower: Math.round(base.touchPower * ng),
    exp: Math.round(base.exp * 1.25),
    goldChance: base.goldChance,
    heartChance: base.heartChance,
  };
}
