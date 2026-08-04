/**
 * The game palette, read straight from `src/gfx/palette.ts` so there is
 * exactly one source of truth, plus OKLab colour matching.
 *
 * Nearest-colour in OKLab (not RGB) matters here: RGB distance happily maps a
 * desaturated shadow onto a saturated hue, which is what makes naive
 * quantisation look muddy. OKLab is perceptually uniform, so a shadow stays a
 * shadow.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PALETTE_TS = fileURLToPath(new URL("../../src/gfx/palette.ts", import.meta.url));

/** @returns {Record<string,string>} PAL key -> "#rrggbb" (8-digit entries skipped). */
export function readPalette() {
  const source = readFileSync(PALETTE_TS, "utf8");
  const out = {};
  for (const match of source.matchAll(/^\s*(\w+):\s*"(#[0-9a-fA-F]{6})",/gm)) {
    out[match[1]] = match[2].toLowerCase();
  }
  if (Object.keys(out).length === 0) throw new Error("could not parse src/gfx/palette.ts");
  return out;
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function rgbToHex(r, g, b) {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function oklab(r, g, b) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Build a matcher over a list of "#rrggbb" targets. */
export function makeQuantizer(hexes) {
  const targets = hexes.map((hex) => {
    const [r, g, b] = hexToRgb(hex);
    return { hex, rgb: [r, g, b], lab: oklab(r, g, b) };
  });
  if (targets.length === 0) throw new Error("quantizer needs at least one target colour");
  const cache = new Map();
  return (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    const hit = cache.get(key);
    if (hit) return hit;
    const lab = oklab(r, g, b);
    let best = targets[0];
    let bestDist = Infinity;
    for (const target of targets) {
      const dl = lab[0] - target.lab[0];
      const da = lab[1] - target.lab[1];
      const db = lab[2] - target.lab[2];
      const dist = dl * dl + da * da + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        best = target;
      }
    }
    cache.set(key, best.rgb);
    return best.rgb;
  };
}
