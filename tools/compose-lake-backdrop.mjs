#!/usr/bin/env node
/**
 * Composite the Sunken Gallery backdrop. Most of the room is flooded —
 * opaque Water/WaterTop tiles draw solid (see src/gfx/tiles.ts), so nothing
 * painted below the waterline in the flooded span is ever visible. Paint a
 * normal castle wall down to the room's floor line (it stays visible in the
 * two dry pedestal alcoves that reach that low) plus a mineral waterline
 * stain at the surface height for when it peeks above the water.
 *
 *   node tools/compose-lake-backdrop.mjs
 */
import { writeFileSync } from "node:fs";
import { CASTLE_RAMP, ceilingShadow, fill, fillMasonry, hex, makeCanvas } from "./lib/backdrop-compose.mjs";
import { readPalette } from "./lib/palette.mjs";
import { encodePng } from "./lib/png.mjs";

const PAL = readPalette();

function noise(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// Room is 48x18 tiles (rooms.ts buildLake), TILE=16.
const ROOM_W = 768;
const ROOM_H = 288;
const WATER_Y = 144; // row 9 — WaterTop surface; opaque Water/WaterTop hides anything below in the flooded span
const FLOOR_Y = 208; // row 13 — floor in the two dry pedestal alcoves

const SCALE = 4;
const canvas = makeCanvas(ROOM_W, ROOM_H, SCALE);

fillMasonry(canvas, FLOOR_Y * SCALE, CASTLE_RAMP);

// Mineral/algae stain at the waterline, full width — visible as the tideline
// on the two dry pedestals, and (mostly hidden) just above the water surface
// everywhere else.
const waterlineHex = hex(PAL.waterMid);
fill(canvas, 0, WATER_Y * SCALE - 3 * SCALE, ROOM_W * SCALE, 3 * SCALE, waterlineHex, 200);
fill(canvas, 0, WATER_Y * SCALE, ROOM_W * SCALE, 2 * SCALE, waterlineHex, 140);

// Drip stains hanging below the waterline down to the floor — only ever
// visible inside the two dry alcoves, harmless elsewhere.
for (let i = 0; i < 26; i++) {
  const x0 = 20 + i * 29;
  const len = 20 + Math.floor(noise(i, 1) * (FLOOR_Y - WATER_Y - 20));
  let cx = x0 * SCALE;
  let step = 0;
  for (let y = WATER_Y * SCALE; y < (WATER_Y + len) * SCALE; y += 3 * SCALE, step++) {
    cx += (noise(i, step) - 0.5) * 2 * SCALE;
    fill(canvas, cx, y, SCALE, 3 * SCALE, waterlineHex, 90);
  }
}

ceilingShadow(canvas, CASTLE_RAMP, 20);

// Below the floor line: flat dark (hidden by floor tiles / deep water alike).
fill(canvas, 0, FLOOR_Y * SCALE, ROOM_W * SCALE, (ROOM_H - FLOOR_Y) * SCALE, [10, 9, 12]);

const outPath = "assets-src/raw/backdrop-lake-composed.png";
writeFileSync(outPath, encodePng(canvas.W, canvas.H, canvas.img.data));
console.log(`wrote ${outPath} (${canvas.W}x${canvas.H})`);
