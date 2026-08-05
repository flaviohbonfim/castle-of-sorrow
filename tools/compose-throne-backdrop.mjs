#!/usr/bin/env node
/**
 * Composite the throne-room backdrop from generated wall modules + flat
 * procedural fills, at exact authored bay/pier positions (src/gfx/throneLayout.ts
 * mirrored below — this script cannot import TS).
 *
 * Why composite instead of one big generation: a single wide image asked to
 * hit five specific bay positions drifts (see docs/ART_PIPELINE.md history).
 * Compositing narrow, high-detail modules into bays we place ourselves makes
 * alignment exact by construction, no measurement needed.
 *
 *   node tools/compose-throne-backdrop.mjs
 *
 * Reads assets-src/raw/throne-{window,curtain}-module.png (SpriteCook output).
 * Writes assets-src/raw/backdrop-throne-composed.png at 4x working
 * resolution (3072x1024); the sprites.config.json recipe downsamples it to
 * the room's native 768x256 with a majority-vote resize.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  CURTAIN_CONTENT_CROP,
  TOWER_RAMP,
  WINDOW_CONTENT_CROP,
  ceilingShadow,
  fill,
  fillMasonry,
  hex,
  makeCanvas,
  stampScaled,
} from "./lib/backdrop-compose.mjs";
import { decodePng, encodePng } from "./lib/png.mjs";

// --- mirrored from src/gfx/throneLayout.ts (world px) ---
const ROOM_W = 768;
const ROOM_H = 256;
const FLOOR_Y = 208;
const DAIS_Y = 192;
const DAIS_X = 608;
const PIER_XS = [160, 304, 448, 592];
const PIER_W = 24;
const BAY_EDGES = [16, 160, 304, 448, 592, 752];

const SCALE = 4;
const canvas = makeCanvas(ROOM_W, ROOM_H, SCALE);

const windowImg = decodePng(readFileSync("assets-src/raw/throne-window-module.png"));
const curtainImg = decodePng(readFileSync("assets-src/raw/throne-curtain-module.png"));

fillMasonry(canvas, FLOOR_Y * SCALE, TOWER_RAMP);

for (let bay = 0; bay < BAY_EDGES.length - 1; bay++) {
  const x0 = BAY_EDGES[bay] * SCALE;
  const x1 = BAY_EDGES[bay + 1] * SCALE;
  const cx = (x0 + x1) / 2;
  const floorY = FLOOR_Y * SCALE;

  if (bay === 0 || bay === 2) {
    const top = 24 * SCALE;
    const contentH = floorY - top;
    const scale = contentH / windowImg.height;
    const contentW = WINDOW_CONTENT_CROP.w * scale;
    stampScaled(
      canvas,
      windowImg,
      { x: WINDOW_CONTENT_CROP.x, y: 0, w: WINDOW_CONTENT_CROP.w, h: windowImg.height },
      { x: cx - contentW / 2, y: top, w: contentW, h: contentH },
    );
  } else if (bay === 1 || bay === 3) {
    const top = 16 * SCALE;
    const contentH = floorY - top;
    const scale = contentH / curtainImg.height;
    const contentW = CURTAIN_CONTENT_CROP.w * scale;
    stampScaled(
      canvas,
      curtainImg,
      { x: CURTAIN_CONTENT_CROP.x, y: 0, w: CURTAIN_CONTENT_CROP.w, h: curtainImg.height },
      { x: cx - contentW / 2, y: top, w: contentW, h: contentH },
    );
  } else {
    // Dais bay: canopy valance (top slice of the curtain module) over the
    // raised platform; the platform surface itself is a flat fill below.
    const daisY = DAIS_Y * SCALE;
    const daisX = DAIS_X * SCALE;
    const canopyTop = 16 * SCALE;
    const canopyH = daisY - canopyTop;
    const sliceH = curtainImg.height * 0.4;
    const scale = canopyH / sliceH;
    const contentW = CURTAIN_CONTENT_CROP.w * scale;
    stampScaled(
      canvas,
      curtainImg,
      { x: CURTAIN_CONTENT_CROP.x, y: 0, w: CURTAIN_CONTENT_CROP.w, h: sliceH },
      { x: cx - contentW / 2, y: canopyTop, w: contentW, h: canopyH },
    );
    fill(canvas, daisX, daisY, ROOM_W * SCALE - daisX, floorY - daisY, hex(TOWER_RAMP.light));
    fill(canvas, daisX, daisY, ROOM_W * SCALE - daisX, 2 * SCALE, hex(TOWER_RAMP.hi));
  }
}

for (const px of PIER_XS) {
  const x = px * SCALE - (PIER_W * SCALE) / 2;
  fill(canvas, x, 16 * SCALE, PIER_W * SCALE, FLOOR_Y * SCALE - 16 * SCALE, hex(TOWER_RAMP.light));
  fill(canvas, x, 16 * SCALE, PIER_W * SCALE, 4 * SCALE, hex(TOWER_RAMP.hi));
  fill(canvas, x - 2 * SCALE, FLOOR_Y * SCALE - 6 * SCALE, PIER_W * SCALE + 4 * SCALE, 6 * SCALE, hex(TOWER_RAMP.dark));
}

ceilingShadow(canvas, TOWER_RAMP, 20);

// Below the floor line: flat dark, covered by opaque floor tiles in game.
fill(canvas, 0, FLOOR_Y * SCALE, ROOM_W * SCALE, (ROOM_H - FLOOR_Y) * SCALE, [10, 9, 12]);

const outPath = "assets-src/raw/backdrop-throne-composed.png";
writeFileSync(outPath, encodePng(canvas.W, canvas.H, canvas.img.data));
console.log(`wrote ${outPath} (${canvas.W}x${canvas.H})`);
