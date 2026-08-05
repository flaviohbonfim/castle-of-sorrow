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
import { decodePng, encodePng, makeImage } from "./lib/png.mjs";
import { readPalette } from "./lib/palette.mjs";

const PAL = readPalette();
const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
};

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
const W = ROOM_W * SCALE;
const H = ROOM_H * SCALE;

const out = makeImage(W, H);

// alpha < 255 blends over whatever is already there and stays fully opaque —
// this is a final flat backdrop image (align: "none"), not a cutout, so a
// soft shadow has to be baked into the RGB rather than left as real alpha
// (the pipeline would otherwise binarize it at the alpha threshold).
function fill(x, y, w, h, [r, g, b], a = 255) {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w));
  const y1 = Math.min(H, Math.round(y + h));
  const t = a / 255;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * W + px) * 4;
      out.data[i] = Math.round(r * t + out.data[i] * (1 - t));
      out.data[i + 1] = Math.round(g * t + out.data[i + 1] * (1 - t));
      out.data[i + 2] = Math.round(b * t + out.data[i + 2] * (1 - t));
      out.data[i + 3] = 255;
    }
  }
}

/** Nearest-neighbour scaled blit of a source crop into a destination rect. */
function stampScaled(src, crop, dst) {
  const sx0 = crop.x;
  const sy0 = crop.y;
  for (let y = 0; y < dst.h; y++) {
    const sy = sy0 + Math.floor((y / dst.h) * crop.h);
    for (let x = 0; x < dst.w; x++) {
      const sx = sx0 + Math.floor((x / dst.w) * crop.w);
      const si = (sy * src.width + sx) * 4;
      const a = src.data[si + 3];
      if (a === 0) continue;
      const dxp = Math.round(dst.x + x);
      const dyp = Math.round(dst.y + y);
      if (dxp < 0 || dxp >= W || dyp < 0 || dyp >= H) continue;
      const di = (dyp * W + dxp) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
}

const windowImg = decodePng(readFileSync("assets-src/raw/throne-window-module.png"));
const curtainImg = decodePng(readFileSync("assets-src/raw/throne-curtain-module.png"));

// Both modules were generated at the same portrait framing (stone pier on
// each side flanking the central content); crop those flanking piers off so
// every pier in the composite comes from our own uniform fill instead of two
// mismatched generated reliefs sitting side by side.
const CONTENT_CROP = { x: 210, w: 522 }; // 1152-wide source, symmetric margins

// --- base wall wash + masonry courses (mirrors the procedural fallback) ---
fill(0, 0, ROOM_W * SCALE, ROOM_H * SCALE, hex(PAL.towerStoneMid));
{
  const blockH = 12 * SCALE;
  const blockW = 22 * SCALE;
  for (let y = 6 * SCALE; y < FLOOR_Y * SCALE; y += blockH) {
    const row = Math.floor(y / blockH);
    const off = row % 2 === 0 ? 0 : Math.floor(blockW / 2);
    for (let x = -blockW + off; x < W; x += blockW) {
      fill(x, y, blockW - SCALE, blockH - SCALE, hex(PAL.towerStoneMid));
      fill(x, y + blockH - 2 * SCALE, blockW - SCALE, SCALE, hex(PAL.towerStoneDark));
      fill(x + blockW - 2 * SCALE, y, SCALE, blockH - SCALE, hex(PAL.towerStoneDark));
      fill(x + SCALE, y + SCALE, blockW - 4 * SCALE, SCALE, hex(PAL.towerStoneLight));
    }
  }
}

// --- bays ---
for (let bay = 0; bay < BAY_EDGES.length - 1; bay++) {
  const x0 = BAY_EDGES[bay] * SCALE;
  const x1 = BAY_EDGES[bay + 1] * SCALE;
  const cx = (x0 + x1) / 2;
  const floorY = FLOOR_Y * SCALE;

  if (bay === 0 || bay === 2) {
    // Stained-glass window, scaled to fit the bay height, centered.
    const top = 24 * SCALE;
    const contentH = floorY - top;
    const scale = contentH / windowImg.height;
    const contentW = CONTENT_CROP.w * scale;
    stampScaled(
      windowImg,
      { x: CONTENT_CROP.x, y: 0, w: CONTENT_CROP.w, h: windowImg.height },
      { x: cx - contentW / 2, y: top, w: contentW, h: contentH },
    );
  } else if (bay === 1 || bay === 3) {
    // Floor-length curtain, same treatment.
    const top = 16 * SCALE;
    const contentH = floorY - top;
    const scale = contentH / curtainImg.height;
    const contentW = CONTENT_CROP.w * scale;
    stampScaled(
      curtainImg,
      { x: CONTENT_CROP.x, y: 0, w: CONTENT_CROP.w, h: curtainImg.height },
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
    const contentW = CONTENT_CROP.w * scale;
    stampScaled(
      curtainImg,
      { x: CONTENT_CROP.x, y: 0, w: CONTENT_CROP.w, h: sliceH },
      { x: cx - contentW / 2, y: canopyTop, w: contentW, h: canopyH },
    );
    // Raised dais platform surface.
    fill(daisX, daisY, ROOM_W * SCALE - daisX, floorY - daisY, hex(PAL.towerStoneLight));
    fill(daisX, daisY, ROOM_W * SCALE - daisX, 2 * SCALE, hex(PAL.towerStoneHi));
  }
}

// --- piers: uniform flat stone shafts on the authored centers ---
for (const px of PIER_XS) {
  const x = px * SCALE - (PIER_W * SCALE) / 2;
  fill(x, 16 * SCALE, PIER_W * SCALE, FLOOR_Y * SCALE - 16 * SCALE, hex(PAL.towerStoneLight));
  fill(x, 16 * SCALE, PIER_W * SCALE, 4 * SCALE, hex(PAL.towerStoneHi));
  fill(x - 2 * SCALE, FLOOR_Y * SCALE - 6 * SCALE, PIER_W * SCALE + 4 * SCALE, 6 * SCALE, hex(PAL.towerStoneDark));
}

// --- ceiling shadow ---
for (let y = 0; y < 20 * SCALE; y++) {
  const t = y / (20 * SCALE);
  const a = Math.round(255 * (1 - t));
  fill(0, y, ROOM_W * SCALE, 1, hex(PAL.towerStoneDark), a);
}

// --- below the floor line: flat dark, covered by opaque floor tiles in game ---
fill(0, FLOOR_Y * SCALE, ROOM_W * SCALE, (ROOM_H - FLOOR_Y) * SCALE, [10, 9, 12]);

const outPath = "assets-src/raw/backdrop-throne-composed.png";
writeFileSync(outPath, encodePng(W, H, out.data));
console.log(`wrote ${outPath} (${W}x${H})`);
