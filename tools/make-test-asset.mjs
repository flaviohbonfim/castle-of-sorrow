#!/usr/bin/env node
/**
 * Generate the pipeline's self-test input: a hand-authored 2-frame skeleton
 * walk, deliberately shipped with the three defects raw art always has —
 *
 *   1. colours a few points off the game palette (as any generator returns)
 *   2. a semi-transparent anti-aliased outline (halo fringe)
 *   3. the two frames sitting at different offsets in oversized canvases
 *
 * `tools/process-sprites.mjs` must fix all three. If it ever stops doing so,
 * `tools/validate-assets.mjs` fails on this asset before any real art is at
 * stake. Run via `npm run assets:selftest`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, makeImage } from "./lib/png.mjs";
import { hexToRgb, readPalette } from "./lib/palette.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const RAW_DIR = join(ROOT, "assets-src", "raw");

const PAL = readPalette();

// Same figure the procedural builder draws (src/gfx/sprites.ts), 12x32.
const WALK_A = [
  "    bbbb    ",
  "   bbbbbb   ",
  "   bsbrbb   ",
  "   bbbbbb   ",
  "    bssb    ",
  "     bb     ",
  "   bbbbbb   ",
  "  sbbbbbbs  ",
  "  s bbbb s  ",
  "  s bssb s  ",
  "  d bbbb d  ",
  "    bssb    ",
  "    bbbb    ",
  "    bssb    ",
  "    bbbb    ",
  "    bssb    ",
  "     ss     ",
  "    b  b    ",
  "    b  b    ",
  "    b  b    ",
  "    b  b    ",
  "   sb  bs   ",
  "   b    b   ",
  "   b    b   ",
  "   b    b   ",
  "  db    bd  ",
  "  b      b  ",
  " bb      bb ",
  "bb        bb",
  " b        b ",
  "bb        bb",
  "bb        bb",
];

const WALK_B = [
  ...WALK_A.slice(0, 17),
  "    b b     ",
  "    b b     ",
  "    b  b    ",
  "    b  b    ",
  "    b  s    ",
  "   sb   b   ",
  "   b    b   ",
  "  bb    b   ",
  "  b     bb  ",
  " bb      b  ",
  "bb       bb ",
  "b         b ",
  "bb       bb ",
  " b       bb ",
  "bb        b ",
];

/** Nudge a palette colour off-palette, the way a generator would. */
function drift(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  return [clamp(r + amount), clamp(g - amount), clamp(b + Math.round(amount / 2))];
}

const LEGEND = {
  b: drift(PAL.bone, 3),
  s: drift(PAL.boneShade, -4),
  d: drift(PAL.boneDark, 5),
  r: drift(PAL.eyeRed, 4),
};

function render(rows, canvasW, canvasH, offsetX, offsetY, file) {
  const img = makeImage(canvasW, canvasH);
  const put = (x, y, rgb, alpha) => {
    if (x < 0 || y < 0 || x >= canvasW || y >= canvasH) return;
    const i = (y * canvasW + x) * 4;
    if (img.data[i + 3] >= alpha) return; // never dim an already-solid pixel
    img.data[i] = rgb[0];
    img.data[i + 1] = rgb[1];
    img.data[i + 2] = rgb[2];
    img.data[i + 3] = alpha;
  };

  // Solid body first.
  rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      const rgb = LEGEND[char];
      if (rgb) put(offsetX + x, offsetY + y, rgb, 255);
    });
  });
  // Then a 1px anti-aliased halo around it — the fringe the pipeline must kill.
  rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      if (!LEGEND[char]) return;
      for (const [ox, oy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        put(offsetX + x + ox, offsetY + y + oy, LEGEND.s, 96);
      }
    });
  });

  mkdirSync(RAW_DIR, { recursive: true });
  const path = join(RAW_DIR, file);
  writeFileSync(path, encodePng(canvasW, canvasH, img.data));
  console.log(`  wrote assets-src/raw/${file} (${canvasW}x${canvasH}, content at ${offsetX},${offsetY})`);
}

console.log("generating self-test input with deliberate defects\n");
// Both frames share a canvas and an origin, the way an authored walk cycle
// does — the packer must preserve that registration while trimming the 24x40
// canvas down to the 16x32 frame box and dropping the feet onto the last row.
render(WALK_A, 24, 40, 5, 3, "selftest-skeleton-a.png");
render(WALK_B, 24, 40, 5, 3, "selftest-skeleton-b.png");
console.log("\nnext: node tools/process-sprites.mjs --preview");
