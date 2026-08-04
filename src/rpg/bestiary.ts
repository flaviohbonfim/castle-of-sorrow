import type { EnemyStats } from "../entities/enemies/enemy";

/**
 * Single source of truth for enemy combat stats + enemy-book metadata.
 * Unlock flag: `bestiary:<id>` (set on first hit / kill).
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
  zombie: {
    hp: 16,
    defense: 0,
    touchPower: 8,
    exp: 8,
    goldChance: 0.25,
    heartChance: 0.35,
  },
  spearGuard: {
    hp: 34,
    defense: 4,
    touchPower: 13,
    exp: 22,
    goldChance: 0.35,
    heartChance: 0.28,
  },
  fleaMan: {
    hp: 10,
    defense: 0,
    touchPower: 9,
    exp: 10,
    goldChance: 0.2,
    heartChance: 0.3,
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
  /** Legacy NG+ rematch colossus (kept for old saves). */
  sovereign: {
    hp: 280,
    defense: 6,
    touchPower: 18,
    exp: 300,
    goldChance: 1,
    heartChance: 0,
  },
  dracula: {
    hp: 320,
    defense: 7,
    touchPower: 18,
    exp: 400,
    goldChance: 1,
    heartChance: 0,
  },
} as const satisfies Record<string, EnemyStats>;

export type BestiaryId = keyof typeof BESTIARY;

export const BESTIARY_ORDER: readonly BestiaryId[] = [
  "skeleton",
  "zombie",
  "bat",
  "fleaMan",
  "fishman",
  "medusaHead",
  "spearGuard",
  "axeKnight",
  "colossus",
  "wraith",
  "dracula",
  "sovereign",
] as const;

export interface BestiaryEntryMeta {
  id: BestiaryId;
  nameKey: string;
  descKey: string;
  boss?: boolean;
}

export const BESTIARY_META: Record<BestiaryId, BestiaryEntryMeta> = {
  skeleton: { id: "skeleton", nameKey: "enemy.skeleton.name", descKey: "enemy.skeleton.desc" },
  bat: { id: "bat", nameKey: "enemy.bat.name", descKey: "enemy.bat.desc" },
  fishman: { id: "fishman", nameKey: "enemy.fishman.name", descKey: "enemy.fishman.desc" },
  medusaHead: { id: "medusaHead", nameKey: "enemy.medusaHead.name", descKey: "enemy.medusaHead.desc" },
  axeKnight: { id: "axeKnight", nameKey: "enemy.axeKnight.name", descKey: "enemy.axeKnight.desc" },
  zombie: { id: "zombie", nameKey: "enemy.zombie.name", descKey: "enemy.zombie.desc" },
  spearGuard: { id: "spearGuard", nameKey: "enemy.spearGuard.name", descKey: "enemy.spearGuard.desc" },
  fleaMan: { id: "fleaMan", nameKey: "enemy.fleaMan.name", descKey: "enemy.fleaMan.desc" },
  colossus: { id: "colossus", nameKey: "enemy.colossus.name", descKey: "enemy.colossus.desc", boss: true },
  wraith: { id: "wraith", nameKey: "enemy.wraith.name", descKey: "enemy.wraith.desc", boss: true },
  sovereign: { id: "sovereign", nameKey: "enemy.sovereign.name", descKey: "enemy.sovereign.desc", boss: true },
  dracula: { id: "dracula", nameKey: "enemy.dracula.name", descKey: "enemy.dracula.desc", boss: true },
};

export function isBestiaryUnlocked(flags: Set<string>, id: BestiaryId): boolean {
  return flags.has(`bestiary:${id}`);
}

export function unlockedBestiaryCount(flags: Set<string>): number {
  return BESTIARY_ORDER.filter((id) => isBestiaryUnlocked(flags, id)).length;
}

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
