#!/usr/bin/env node
/**
 * Composite the Hall of the Colossus backdrop — a windowless stone arena
 * (the room has no windows() call; the Colossus fight needs an imposing,
 * uncluttered wall, not a wall of glass). Masonry + weathering cracks only,
 * no new SpriteCook generation.
 *
 *   node tools/compose-bossroom-backdrop.mjs
 */
import { writeFileSync } from "node:fs";
import { CASTLE_RAMP, ceilingShadow, fill, fillMasonry, hex, makeCanvas } from "./lib/backdrop-compose.mjs";
import { encodePng } from "./lib/png.mjs";

// Same deterministic noise as src/gfx/tiles.ts — no Math.random, reruns match.
function noise(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// Room is 40x14 tiles (rooms.ts buildBossRoom), TILE=16.
const ROOM_W = 640;
const ROOM_H = 224;
const FLOOR_Y = 176; // top of FloorTop row 11

const SCALE = 4;
const canvas = makeCanvas(ROOM_W, ROOM_H, SCALE);

fillMasonry(canvas, FLOOR_Y * SCALE, CASTLE_RAMP);

// Weathering cracks — thin jagged dark lines breaking the masonry rhythm so
// the arena doesn't read as a plain tiled corridor blown up large.
const cracks = [
  { x: 90, top: 20, bottom: 150 },
  { x: 260, top: 40, bottom: 176 },
  { x: 430, top: 15, bottom: 120 },
  { x: 560, top: 30, bottom: 176 },
];
for (const { x, top, bottom } of cracks) {
  let cx = x * SCALE;
  let step = 0;
  for (let y = top * SCALE; y < bottom * SCALE; y += 3 * SCALE, step++) {
    cx += (noise(x, step) - 0.5) * 3 * SCALE;
    fill(canvas, cx, y, SCALE, 3 * SCALE, hex(CASTLE_RAMP.dark));
  }
}

ceilingShadow(canvas, CASTLE_RAMP, 24);

// Below the floor line: flat dark, covered by opaque floor tiles in game.
fill(canvas, 0, FLOOR_Y * SCALE, ROOM_W * SCALE, (ROOM_H - FLOOR_Y) * SCALE, [10, 9, 12]);

const outPath = "assets-src/raw/backdrop-bossroom-composed.png";
writeFileSync(outPath, encodePng(canvas.W, canvas.H, canvas.img.data));
console.log(`wrote ${outPath} (${canvas.W}x${canvas.H})`);
