/**
 * Resolve sprites from optional asset overrides, else procedural builders.
 * Call from entity constructors (after loadAssets has finished at boot).
 *
 * This module is also the registry of every override key the game answers to
 * — `public/assets/README.md` mirrors this list. A key that is absent from
 * the manifest silently keeps the procedural art, so the game never depends
 * on a file existing.
 */
import { getSheet, sheetToFacingSet } from "./assets";
import {
  buildBoneSprites,
  buildBossSprites,
  buildCandleSprites,
  buildDraculaSprites,
  buildInteractableSprites,
  buildPickupSprites,
  buildPlayerSprites,
  buildPortraitSprites,
  buildPropSprites,
  buildAxeThrowSprites,
  buildSubweaponSprites,
  type Frame,
  type PlayerSprites,
  type PropId,
  type SpriteSet,
} from "./sprites";

export type { PropId };

/**
 * Pad an override up to the frame count the procedural art has.
 *
 * Entities index frames positionally — `set[1]` for the idle bob, `[0]` idle
 * and `[1..3]` run for the wolf — so a sheet with fewer frames than expected
 * used to hand `undefined` to `drawImage`, which throws inside the draw loop
 * and takes the rest of the frame (player, HUD, everything after it) with it.
 * Repeating the last frame degrades to a held pose instead. Extra frames are
 * left alone: entities that cycle use `% length`, and the rest ignore them.
 */
function padTo(frames: Frame[], expected: number): Frame[] {
  if (frames.length >= expected) return frames;
  const out = frames.slice();
  while (out.length < expected) out.push(frames[frames.length - 1]);
  return out;
}

export function resolveSpriteSet(key: string, fallback: () => SpriteSet): SpriteSet {
  const frames = getSheet(key);
  if (frames && frames.length > 0) {
    return sheetToFacingSet(padTo(frames, fallback().right.length));
  }
  return fallback();
}

/** Frame list with no facing (spins, flames, warp pads). */
export function resolveFrames(key: string, fallback: () => Frame[]): Frame[] {
  const frames = getSheet(key);
  if (frames && frames.length > 0) return padTo(frames, fallback().length);
  return fallback();
}

/** Single static frame — takes the first frame of the sheet. */
export function resolveFrame(key: string, fallback: () => Frame): Frame {
  const frames = getSheet(key);
  if (frames && frames.length > 0) return frames[0];
  return fallback();
}

/** Every player animation is overridable on its own: `player.idle`, `player.walk`, … */
export function resolvePlayerSprites(): PlayerSprites {
  const base = buildPlayerSprites();
  const out = {} as PlayerSprites;
  for (const key of Object.keys(base) as (keyof PlayerSprites)[]) {
    out[key] = resolveSpriteSet(`player.${key}`, () => base[key]);
  }
  return out;
}

export function resolveDraculaSprites(): ReturnType<typeof buildDraculaSprites> {
  const base = buildDraculaSprites();
  return {
    human: resolveSpriteSet("dracula.human", () => base.human),
    beast: resolveSpriteSet("dracula.beast", () => base.beast),
  };
}

export function resolveBossSprites(): ReturnType<typeof buildBossSprites> {
  const base = buildBossSprites();
  return {
    walk: resolveSpriteSet("boss.walk", () => base.walk),
    windup: resolveSpriteSet("boss.windup", () => base.windup),
  };
}

export function resolveCandleSprites(): ReturnType<typeof buildCandleSprites> {
  const base = buildCandleSprites();
  return {
    lit: resolveFrames("candle.lit", () => base.lit),
    broken: resolveFrame("candle.broken", () => base.broken),
  };
}

export function resolvePickupSprites(): ReturnType<typeof buildPickupSprites> {
  const base = buildPickupSprites();
  return {
    heart: resolveFrame("pickup.heart", () => base.heart),
    bigHeart: resolveFrame("pickup.bigHeart", () => base.bigHeart),
    gold: resolveFrame("pickup.gold", () => base.gold),
    potion: resolveFrame("pickup.potion", () => base.potion),
  };
}

export function resolveInteractableSprites(): ReturnType<typeof buildInteractableSprites> {
  const base = buildInteractableSprites();
  return {
    relic: resolveFrame("interactable.relic", () => base.relic),
    warp: resolveFrames("interactable.warp", () => base.warp),
    save: resolveFrames("interactable.save", () => base.save),
  };
}

export function resolveSubweaponSprites(): ReturnType<typeof buildSubweaponSprites> {
  const base = buildSubweaponSprites();
  return {
    dagger: resolveSpriteSet("subweapon.dagger", () => base.dagger),
    axe: resolveFrames("subweapon.axe", () => base.axe),
  };
}

export function resolveBoneSprites(): Frame[] {
  return resolveFrames("projectile.bone", buildBoneSprites);
}

/** Axe Knight thrown axe — separate from the player subweapon strip. */
export function resolveAxeThrowSprites(): Frame[] {
  return resolveFrames("projectile.axeThrow", buildAxeThrowSprites);
}

export function resolvePortraitSprites(): ReturnType<typeof buildPortraitSprites> {
  const base = buildPortraitSprites();
  return {
    hermit: resolveFrame("portrait.hermit", () => base.hermit),
    ghost: resolveFrame("portrait.ghost", () => base.ghost),
    demon: resolveFrame("portrait.demon", () => base.demon),
    dracula: resolveFrame("portrait.dracula", () => base.dracula),
    hero: resolveFrame("portrait.hero", () => base.hero),
  };
}

/** Scenery props — each id is an independent overridable sheet. */
export function resolvePropSprites(): Record<PropId, Frame[]> {
  const base = buildPropSprites();
  return {
    throne: resolveFrames("prop.throne", () => base.throne),
    banner: resolveFrames("prop.banner", () => base.banner),
    chandelier: resolveFrames("prop.chandelier", () => base.chandelier),
    column: resolveFrames("prop.column", () => base.column),
  };
}
