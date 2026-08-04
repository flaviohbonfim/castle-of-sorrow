/**
 * Resolve a SpriteSet from optional asset overrides, else procedural builder.
 * Call from entity constructors (after loadAssets has finished at boot).
 */
import { getSheet, sheetToFacingSet } from "./assets";
import type { SpriteSet } from "./sprites";

export function resolveSpriteSet(key: string, fallback: () => SpriteSet): SpriteSet {
  const frames = getSheet(key);
  if (frames && frames.length > 0) return sheetToFacingSet(frames);
  return fallback();
}
