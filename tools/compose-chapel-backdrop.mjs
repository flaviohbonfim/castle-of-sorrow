#!/usr/bin/env node
/**
 * Composite the Forsaken Chapel backdrop — reuses the throne's stained-glass
 * module (same gothic-glass language, per docs/ART_PIPELINE.md §9.5) with no
 * new generation: three tall nave windows in castle-ramp stone, plus a warm
 * altar glow behind the raised altar ledge.
 *
 *   node tools/compose-chapel-backdrop.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  CASTLE_RAMP,
  WINDOW_CONTENT_CROP,
  ceilingShadow,
  fill,
  fillMasonry,
  makeCanvas,
  stampScaled,
} from "./lib/backdrop-compose.mjs";
import { decodePng, encodePng } from "./lib/png.mjs";

// Room is 28x16 tiles (rooms.ts buildChapel), TILE=16.
const ROOM_W = 448;
const ROOM_H = 256;
const FLOOR_Y = 208; // top of FloorTop row 13

const SCALE = 4;
const canvas = makeCanvas(ROOM_W, ROOM_H, SCALE);
const windowImg = decodePng(readFileSync("assets-src/raw/throne-window-module.png"));

fillMasonry(canvas, FLOOR_Y * SCALE, CASTLE_RAMP);

// Three evenly-spaced tall windows across the nave. The altar's own warm
// light comes from the room's real candles/lighting pass at runtime — no
// painted glow here, it only fought the middle window for the same space.
const winCenters = [96, 224, 352];
for (const cx0 of winCenters) {
  const cx = cx0 * SCALE;
  const top = 24 * SCALE;
  const contentH = FLOOR_Y * SCALE - top;
  const scale = contentH / windowImg.height;
  const contentW = WINDOW_CONTENT_CROP.w * scale;
  stampScaled(
    canvas,
    windowImg,
    { x: WINDOW_CONTENT_CROP.x, y: 0, w: WINDOW_CONTENT_CROP.w, h: windowImg.height },
    { x: cx - contentW / 2, y: top, w: contentW, h: contentH },
  );
}

ceilingShadow(canvas, CASTLE_RAMP, 20);

// Below the floor line: flat dark, covered by opaque floor tiles in game.
fill(canvas, 0, FLOOR_Y * SCALE, ROOM_W * SCALE, (ROOM_H - FLOOR_Y) * SCALE, [10, 9, 12]);

const outPath = "assets-src/raw/backdrop-chapel-composed.png";
writeFileSync(outPath, encodePng(canvas.W, canvas.H, canvas.img.data));
console.log(`wrote ${outPath} (${canvas.W}x${canvas.H})`);
