import type { PlayerSave } from "../entities/player/player";

/**
 * The starting loadout — the single source of truth for a fresh run.
 * Both `new Player()` and `Game.startFreshRun()` restore from this, so the
 * two can never drift apart (they used to be hand-duplicated).
 *
 * Note: equipped pieces live in `equipment`, NOT also in `items`.
 */
export function defaultPlayerSave(): PlayerSave {
  return {
    attrs: { str: 6, con: 6, int: 6, lck: 5 },
    res: { hp: 70, maxHp: 70, mp: 20, maxMp: 20, hearts: 10, maxHearts: 50 },
    levelState: { level: 1, exp: 0 },
    relics: [],
    subweapon: "dagger",
    inventory: {
      items: [
        { itemId: "leatherWhip", count: 1 },
        { itemId: "nobleRapier", count: 1 },
        { itemId: "potion", count: 3 },
      ],
      gold: 0,
      equipment: {
        rightHand: "shortSword",
        leftHand: null,
        head: null,
        body: "travelerTunic",
        cloak: "wornCloak",
        accessory1: null,
        accessory2: null,
      },
    },
  };
}
