import { chance } from "../engine/math";
import { PAL } from "../gfx/palette";

export interface DamageResult {
  amount: number;
  crit: boolean;
}

/**
 * Classic formula: attack minus defense, small variance, never below 1.
 * Crits multiply by 1.5 and are announced with gold numbers + heavier shake.
 */
export function computeDamage(attack: number, defense: number, critChance: number): DamageResult {
  const crit = chance(critChance);
  const variance = 0.9 + Math.random() * 0.2;
  let amount = Math.max(1, Math.round((attack - defense) * variance));
  if (crit) amount = Math.round(amount * 1.5);
  return { amount, crit };
}

/** Floating damage number / notice text, rises and fades. */
export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
}

export function damageText(x: number, y: number, result: DamageResult): FloatingText {
  return {
    x,
    y,
    vy: -0.7,
    text: String(result.amount),
    color: result.crit ? PAL.dmgCrit : PAL.dmgWhite,
    life: 45,
  };
}

export function noticeText(x: number, y: number, text: string, color: string): FloatingText {
  return { x, y, vy: -0.4, text, color, life: 70 };
}
