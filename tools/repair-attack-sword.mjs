#!/usr/bin/env node
/**
 * Repair clipped sword tips on the hero attack strip.
 *
 * SpriteCook generates attack cells at 162×162. On the wide swing frames the
 * long blade hits the left/right cell edge and gets cropped. This tool:
 *   1. pads every cell horizontally so there is room for a tip
 *   2. detects blade-coloured pixels that sit on the old edge
 *   3. extrapolates a short pointed tip along the blade's local direction
 *   4. writes a new wider strip (cells keep the padded size)
 *
 * Usage:
 *   node tools/repair-attack-sword.mjs \
 *     --in assets-src/raw/hero-attack-base.png \
 *     --out assets-src/raw/hero-attack-repaired.png
 *
 * Non-destructive to the input. Re-run process-sprites afterwards with a
 * frameW large enough for the wider content (see sprites.config.json).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { blit, decodePng, encodePng, makeImage } from "./lib/png.mjs";
import { readPalette, rgbToHex } from "./lib/palette.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const inPath = resolve(ROOT, flag("--in") ?? "assets-src/raw/hero-attack-base.png");
const outPath = resolve(ROOT, flag("--out") ?? "assets-src/raw/hero-attack-repaired.png");
const pad = Number(flag("--pad") ?? 28); // pixels added on each side
const tipLen = Number(flag("--tip") ?? 22); // max tip extension in source pixels

const PAL = readPalette();
const BLADE_HEX = new Set(
  ["blade", "bladeHi", "bladeEdge"]
    .map((k) => PAL[k]?.toLowerCase())
    .filter(Boolean),
);

function isBlade(r, g, b, a) {
  if (a === 0) return false;
  if (BLADE_HEX.has(rgbToHex(r, g, b))) return true;
  // Tolerate near-blade silvers that survived quantisation noise in the raw
  // SpriteCook sheet (pre-palette).
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lum = (r + g + b) / 3;
  return lum > 130 && max - min < 50 && b >= g - 15 && r >= 120;
}

function sample(img, x, y) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null;
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

function setPx(img, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  img.data[i] = r;
  img.data[i + 1] = g;
  img.data[i + 2] = b;
  img.data[i + 3] = a;
}

/** Collect blade pixels and fit a local direction near a vertical edge. */
function bladeDirection(cell, side) {
  const pts = [];
  const band = 36;
  for (let y = 0; y < cell.height; y++) {
    for (let dx = 0; dx < band; dx++) {
      const x = side === "left" ? dx : cell.width - 1 - dx;
      const p = sample(cell, x, y);
      if (!p || !isBlade(p[0], p[1], p[2], p[3])) continue;
      pts.push({ x, y, r: p[0], g: p[1], b: p[2] });
    }
  }
  if (pts.length < 4) return null;

  // Least-squares line: y = m*x + c  (or x = m*y + c when vertical-ish)
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (const p of pts) {
    sumX += p.x;
    sumY += p.y;
    sumXX += p.x * p.x;
    sumXY += p.x * p.y;
  }
  const n = pts.length;
  const denom = n * sumXX - sumX * sumX;
  let m;
  let c;
  let axis = "x"; // y = m*x + c
  if (Math.abs(denom) < 1e-6) {
    // Nearly vertical: x = m*y + c
    let sumYY = 0;
    let sumYX = 0;
    for (const p of pts) {
      sumYY += p.y * p.y;
      sumYX += p.y * p.x;
    }
    const d2 = n * sumYY - sumY * sumY;
    if (Math.abs(d2) < 1e-6) return null;
    m = (n * sumYX - sumY * sumX) / d2;
    c = (sumX - m * sumY) / n;
    axis = "y";
  } else {
    m = (n * sumXY - sumX * sumY) / denom;
    c = (sumY - m * sumX) / n;
  }

  // Edge contact span + average colour near the edge
  const edgeXs = side === "left" ? [0, 1, 2] : [cell.width - 1, cell.width - 2, cell.width - 3];
  const edgePts = pts.filter((p) => edgeXs.includes(p.x));
  if (edgePts.length === 0) return null;
  const yMin = Math.min(...edgePts.map((p) => p.y));
  const yMax = Math.max(...edgePts.map((p) => p.y));
  const yMid = (yMin + yMax) / 2;
  const avg = edgePts.reduce(
    (a, p) => ({ r: a.r + p.r, g: a.g + p.g, b: a.b + p.b, n: a.n + 1 }),
    { r: 0, g: 0, b: 0, n: 0 },
  );
  const color = {
    r: Math.round(avg.r / avg.n),
    g: Math.round(avg.g / avg.n),
    b: Math.round(avg.b / avg.n),
  };
  // Thickness at the edge ≈ vertical span of edge blade pixels
  const thickness = Math.max(2, Math.min(10, yMax - yMin + 1));

  // Unit direction pointing outward from the body along the blade
  let dx;
  let dy;
  if (axis === "x") {
    // y = m*x + c  → direction (1, m)
    const len = Math.hypot(1, m) || 1;
    dx = 1 / len;
    dy = m / len;
    // Outward: left side wants negative x
    if (side === "left" && dx > 0) {
      dx = -dx;
      dy = -dy;
    }
    if (side === "right" && dx < 0) {
      dx = -dx;
      dy = -dy;
    }
  } else {
    // x = m*y + c → direction (m, 1)
    const len = Math.hypot(m, 1) || 1;
    dx = m / len;
    dy = 1 / len;
    if (side === "left" && dx > 0) {
      dx = -dx;
      dy = -dy;
    }
    if (side === "right" && dx < 0) {
      dx = -dx;
      dy = -dy;
    }
  }

  // Seed at the edge, mid of contact span
  const seedX = side === "left" ? 0 : cell.width - 1;
  const seedY = yMid;

  return { dx, dy, seedX, seedY, thickness, color, yMin, yMax, count: pts.length };
}

/**
 * Paint a tapering tip extending from the edge into the pad region.
 * Operates on the padded cell; `originX` is the x of the original cell's left
 * edge inside the padded canvas.
 */
function paintTip(padded, originX, cellW, dir, side) {
  if (!dir) return 0;
  const { dx, dy, thickness, color } = dir;
  // Seed in padded coordinates (edge of original content)
  const seedX = originX + dir.seedX;
  const seedY = dir.seedY;

  // Prefer pure palette tip colours when close
  const tipCore = hexToRgb(PAL.bladeHi) ?? color;
  const tipMid = hexToRgb(PAL.blade) ?? color;
  const tipEdge = hexToRgb(PAL.bladeEdge) ?? color;

  let painted = 0;
  for (let t = 0; t < tipLen; t++) {
    const cx = seedX + dx * (t + 0.5);
    const cy = seedY + dy * (t + 0.5);
    // Taper: full thickness at base → 1px at tip
    const half = Math.max(0.5, (thickness / 2) * (1 - t / tipLen));
    // Perpendicular
    const px = -dy;
    const py = dx;
    const steps = Math.ceil(half) + 1;
    for (let s = -steps; s <= steps; s++) {
      const dist = Math.abs(s);
      if (dist > half + 0.6) continue;
      const x = Math.round(cx + px * s);
      const y = Math.round(cy + py * s);
      // Only paint into empty pixels (don't overwrite body/coat)
      const existing = sample(padded, x, y);
      if (existing && existing[3] > 0) continue;
      // Colour by distance from spine + progress toward tip
      let col;
      if (dist < 0.6 && t > tipLen * 0.55) col = tipCore;
      else if (dist < half * 0.55) col = tipMid;
      else col = tipEdge;
      setPx(padded, x, y, col.r, col.g, col.b, 255);
      painted++;
    }
  }

  // Soften the join: recolour 1px of the old stump edge with mid blade so the
  // tip doesn't look glued on.
  const stumpX = side === "left" ? originX : originX + cellW - 1;
  for (let y = Math.floor(dir.yMin) - 1; y <= Math.ceil(dir.yMax) + 1; y++) {
    const p = sample(padded, stumpX, y);
    if (!p || p[3] === 0) continue;
    if (!isBlade(p[0], p[1], p[2], p[3])) continue;
    setPx(padded, stumpX, y, tipMid.r, tipMid.g, tipMid.b, 255);
  }
  return painted;
}

function hexToRgb(hex) {
  if (!hex || !hex.startsWith("#") || hex.length < 7) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/**
 * Frame 3 style defect: a tiny detached blob near the tip of the main blade
 * (not edge-clip). Only remove components that are both small and clearly
 * separated from the main blade mass — never touch hilt/guard fragments.
 */
function fixInternalTipBlob(padded, originX, cellW) {
  const x0 = originX;
  const x1 = originX + cellW;
  const w = padded.width;
  const h = padded.height;
  const visited = new Uint8Array(w * h);
  const components = [];
  const idx = (x, y) => y * w + x;

  for (let y = 0; y < h; y++) {
    for (let x = x0; x < x1; x++) {
      const i = idx(x, y);
      if (visited[i]) continue;
      const p = sample(padded, x, y);
      if (!p || !isBlade(p[0], p[1], p[2], p[3])) {
        visited[i] = 1;
        continue;
      }
      const q = [[x, y]];
      visited[i] = 1;
      const pts = [];
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      while (q.length) {
        const [cx, cy] = q.pop();
        pts.push([cx, cy]);
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (const [nx, ny] of [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ]) {
          if (nx < x0 || nx >= x1 || ny < 0 || ny >= h) continue;
          const ni = idx(nx, ny);
          if (visited[ni]) continue;
          visited[ni] = 1;
          const np = sample(padded, nx, ny);
          if (!np || !isBlade(np[0], np[1], np[2], np[3])) continue;
          q.push([nx, ny]);
        }
      }
      components.push({ pts, minX, maxX, minY, maxY, area: pts.length });
    }
  }
  if (components.length < 2) return 0;
  components.sort((a, b) => b.area - a.area);
  const main = components[0];
  let removed = 0;
  for (let i = 1; i < components.length; i++) {
    const c = components[i];
    // Strict: only true tip debris (tiny island, gap from main blade)
    if (c.area > 18) continue;
    const gapX = c.minX > main.maxX ? c.minX - main.maxX : main.minX > c.maxX ? main.minX - c.maxX : 0;
    const gapY = c.minY > main.maxY ? c.minY - main.maxY : main.minY > c.maxY ? main.minY - c.maxY : 0;
    const gap = Math.max(gapX, gapY);
    if (gap < 2 || gap > 14) continue;
    // Must sit near the tip extremity of the main blade (not near hilt/guard)
    const mainCx = (main.minX + main.maxX) / 2;
    const mainCy = (main.minY + main.maxY) / 2;
    const cCx = (c.minX + c.maxX) / 2;
    const cCy = (c.minY + c.maxY) / 2;
    // Tip debris is farther from the body center than the main blade mid
    // Approximate body as right half of cell for a right-facing swing.
    const bodyX = originX + cellW * 0.55;
    const mainDist = Math.hypot(mainCx - bodyX, mainCy - h * 0.45);
    const cDist = Math.hypot(cCx - bodyX, cCy - h * 0.45);
    if (cDist < mainDist - 4) continue;
    for (const [x, y] of c.pts) {
      setPx(padded, x, y, 0, 0, 0, 0);
      removed++;
    }
  }
  return removed;
}

function main() {
  if (!existsSync(inPath)) {
    console.error(`missing input: ${inPath}`);
    process.exit(1);
  }
  const src = decodePng(readFileSync(inPath));
  // Assume horizontal strip of square-ish cells.
  const cellH = src.height;
  const cellW = cellH; // 162x162 cells in our attack sheet
  const frames = Math.round(src.width / cellW);
  if (frames * cellW !== src.width) {
    console.error(`expected width multiple of height (${cellH}), got ${src.width}x${src.height}`);
    process.exit(1);
  }

  const outW = cellW + pad * 2;
  const outH = cellH;
  const strip = makeImage(outW * frames, outH);
  console.log(
    `repairing ${frames} frames  cell ${cellW}x${cellH} → ${outW}x${outH}  pad=${pad} tip=${tipLen}`,
  );

  for (let f = 0; f < frames; f++) {
    const cell = makeImage(cellW, cellH);
    blit(src, cell, { sx: f * cellW, sy: 0, sw: cellW, sh: cellH, dx: 0, dy: 0 });

    const padded = makeImage(outW, outH);
    blit(cell, padded, { sx: 0, sy: 0, sw: cellW, sh: cellH, dx: pad, dy: 0 });

    // Internal tip blob cleanup (frame 3 style defects)
    const removed = fixInternalTipBlob(padded, pad, cellW);

    // Work on the original cell coords for direction estimation
    const leftDir = bladeDirection(cell, "left");
    const rightDir = bladeDirection(cell, "right");

    // Only extend when the edge actually has blade contact (true clip)
    let leftPaint = 0;
    let rightPaint = 0;
    if (leftDir && leftDir.count >= 4) {
      // Confirm edge contact
      let edgeHit = 0;
      for (let y = 0; y < cellH; y++) {
        const p = sample(cell, 0, y);
        if (p && isBlade(p[0], p[1], p[2], p[3])) edgeHit++;
      }
      if (edgeHit >= 2) leftPaint = paintTip(padded, pad, cellW, leftDir, "left");
    }
    if (rightDir && rightDir.count >= 4) {
      let edgeHit = 0;
      for (let y = 0; y < cellH; y++) {
        const p = sample(cell, cellW - 1, y);
        if (p && isBlade(p[0], p[1], p[2], p[3])) edgeHit++;
      }
      if (edgeHit >= 2) rightPaint = paintTip(padded, pad, cellW, rightDir, "right");
    }

    blit(padded, strip, {
      sx: 0,
      sy: 0,
      sw: outW,
      sh: outH,
      dx: f * outW,
      dy: 0,
    });
    console.log(
      `  frame ${f + 1}: leftTip=${leftPaint} rightTip=${rightPaint} blobRemoved=${removed}`,
    );
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, encodePng(strip.width, strip.height, strip.data));
  console.log(`wrote ${outPath}  (${strip.width}x${strip.height})`);
  console.log("next: point sprites.config.json player.attack at the repaired file,");
  console.log("      raise frameW if needed, then npm run assets:build && assets:validate");
}

main();
