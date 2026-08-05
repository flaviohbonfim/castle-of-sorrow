#!/usr/bin/env node
/**
 * Composite the Clockwork Spire backdrop — two open (glassless) archways cut
 * through the tower-ramp masonry so the sky parallax shows through behind
 * the Wraith fight, plus a stone arch frame around each opening.
 *
 *   node tools/compose-towertop-backdrop.mjs
 */
import { writeFileSync } from "node:fs";
import {
  TOWER_RAMP,
  ceilingShadow,
  cutoutArch,
  fill,
  fillMasonry,
  hex,
  makeCanvas,
} from "./lib/backdrop-compose.mjs";
import { encodePng } from "./lib/png.mjs";

// Room is 32x14 tiles (rooms.ts buildTowerTop), TILE=16.
const ROOM_W = 512;
const ROOM_H = 224;
const FLOOR_Y = 176; // top of FloorTop row 11

const SCALE = 4;
const canvas = makeCanvas(ROOM_W, ROOM_H, SCALE);

fillMasonry(canvas, FLOOR_Y * SCALE, TOWER_RAMP);

// Two open archways to the night sky (parallax shows through the cutout).
const archCenters = [140, 372];
const archW = 70;
const archTop = 24;
const archH = FLOOR_Y - archTop - 8;
const capH = 36;
for (const cx0 of archCenters) {
  const cx = cx0 * SCALE;
  const x = cx - (archW * SCALE) / 2;
  const y = archTop * SCALE;
  // Stone frame, slightly larger than the cutout, drawn first so the cutout
  // punches a clean opening inside it.
  fill(canvas, x - 4 * SCALE, y - 4 * SCALE, (archW + 8) * SCALE, (archH + capH + 8) * SCALE, hex(TOWER_RAMP.hi));
  cutoutArch(canvas, x, y, archW * SCALE, (archH + capH) * SCALE, capH * SCALE);
}

ceilingShadow(canvas, TOWER_RAMP, 20);

// Below the floor line: flat dark, covered by opaque floor tiles in game.
fill(canvas, 0, FLOOR_Y * SCALE, ROOM_W * SCALE, (ROOM_H - FLOOR_Y) * SCALE, [10, 9, 12]);

const outPath = "assets-src/raw/backdrop-towertop-composed.png";
writeFileSync(outPath, encodePng(canvas.W, canvas.H, canvas.img.data));
console.log(`wrote ${outPath} (${canvas.W}x${canvas.H})`);
