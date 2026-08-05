/**
 * Shared helpers for compositing room backdrops from generated wall modules
 * plus flat procedural fills, at authored (not measured) positions. Used by
 * tools/compose-*-backdrop.mjs — see docs/ART_PIPELINE.md §9.5 for why
 * compositing beats asking one generation to hit a whole room's layout.
 */
import { readPalette } from "./palette.mjs";
import { makeImage } from "./png.mjs";

const PAL = readPalette();

export function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** A working canvas at `scale`× the room's native pixel size. */
export function makeCanvas(roomW, roomH, scale) {
  const W = roomW * scale;
  const H = roomH * scale;
  const img = makeImage(W, H);
  return { img, W, H, scale };
}

/**
 * alpha < 255 blends over whatever is already there and stays fully opaque —
 * these are final flat backdrop images (align: "none"), not cutouts, so a
 * soft shadow has to be baked into the RGB rather than left as real alpha
 * (the pipeline would otherwise binarize it at the alpha threshold).
 */
export function fill(canvas, x, y, w, h, rgb, a = 255) {
  const { img, W, H } = canvas;
  const [r, g, b] = rgb;
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w));
  const y1 = Math.min(H, Math.round(y + h));
  const t = a / 255;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * W + px) * 4;
      img.data[i] = Math.round(r * t + img.data[i] * (1 - t));
      img.data[i + 1] = Math.round(g * t + img.data[i + 1] * (1 - t));
      img.data[i + 2] = Math.round(b * t + img.data[i + 2] * (1 - t));
      img.data[i + 3] = 255;
    }
  }
}

/** Nearest-neighbour scaled blit of a source crop into a destination rect. */
export function stampScaled(canvas, src, crop, dst) {
  const { img, W, H } = canvas;
  for (let y = 0; y < dst.h; y++) {
    const sy = crop.y + Math.floor((y / dst.h) * crop.h);
    for (let x = 0; x < dst.w; x++) {
      const sx = crop.x + Math.floor((x / dst.w) * crop.w);
      const si = (sy * src.width + sx) * 4;
      const a = src.data[si + 3];
      if (a === 0) continue;
      const dxp = Math.round(dst.x + x);
      const dyp = Math.round(dst.y + y);
      if (dxp < 0 || dxp >= W || dyp < 0 || dyp >= H) continue;
      const di = (dyp * W + dxp) * 4;
      img.data[di] = src.data[si];
      img.data[di + 1] = src.data[si + 1];
      img.data[di + 2] = src.data[si + 2];
      img.data[di + 3] = 255;
    }
  }
}

/**
 * Tile a raw generated wall texture across the canvas up to `bottomY`,
 * repeating both axes. Use this instead of fillMasonry() when a texture was
 * generated anchored (style_asset_ids) to the same window/curtain modules
 * the bays are built from — same source material, no seam between the two
 * (see docs/ART_PIPELINE.md §9.10).
 */
export function fillWallTexture(canvas, img, bottomY) {
  const { img: dst, W } = canvas;
  for (let y = 0; y < bottomY; y += img.height) {
    for (let x = 0; x < W; x += img.width) {
      const w = Math.min(img.width, W - x);
      const h = Math.min(img.height, bottomY - y);
      for (let sy = 0; sy < h; sy++) {
        const si0 = sy * img.width * 4;
        const di0 = ((y + sy) * W + x) * 4;
        dst.data.set(img.data.subarray(si0, si0 + w * 4), di0);
      }
    }
  }
}

/** Coursed masonry wall wash, in a given stone ramp, from y=0 to `bottomY`. */
export function fillMasonry(canvas, bottomY, ramp) {
  const { W, scale } = canvas;
  fill(canvas, 0, 0, W, bottomY, hex(ramp.mid));
  const blockH = 12 * scale;
  const blockW = 22 * scale;
  for (let y = 6 * scale; y < bottomY; y += blockH) {
    const row = Math.floor(y / blockH);
    const off = row % 2 === 0 ? 0 : Math.floor(blockW / 2);
    for (let x = -blockW + off; x < W; x += blockW) {
      fill(canvas, x, y, blockW - scale, blockH - scale, hex(ramp.mid));
      fill(canvas, x, y + blockH - 2 * scale, blockW - scale, scale, hex(ramp.dark));
      fill(canvas, x + blockW - 2 * scale, y, scale, blockH - scale, hex(ramp.dark));
      fill(canvas, x + scale, y + scale, blockW - 4 * scale, scale, hex(ramp.light));
    }
  }
}

export const CASTLE_RAMP = { dark: PAL.stoneDark, mid: PAL.stoneMid, light: PAL.stoneLight, hi: PAL.stoneHi };
export const TOWER_RAMP = {
  dark: PAL.towerStoneDark,
  mid: PAL.towerStoneMid,
  light: PAL.towerStoneLight,
  hi: PAL.towerStoneHi,
};

/**
 * The window/curtain modules share the same portrait framing (content
 * centered, flanking pier reliefs on both sides) but NOT the same content
 * width, so each needs its own measured crop — measured by sampling a
 * horizontal band and finding where saturation (blue glass / red cloth)
 * exceeds a threshold, not eyeballed. Re-measure with the same method if
 * either module is regenerated.
 */
export const WINDOW_CONTENT_CROP = { x: 252, w: 648 }; // measured: glass spans 252-900 of 1152
export const CURTAIN_CONTENT_CROP = { x: 212, w: 728 }; // measured: cloth spans 212-940 of 1152

/** Cut a rectangular hole (alpha=0) — for openings where parallax/sky should show through. */
export function cutoutRect(canvas, x, y, w, h) {
  const { img, W, H } = canvas;
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w));
  const y1 = Math.min(H, Math.round(y + h));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * W + px) * 4;
      img.data[i + 3] = 0;
    }
  }
}

/** Cut a pointed-arch-shaped hole: rectangular body + triangular arch cap. */
export function cutoutArch(canvas, x, y, w, h, capH) {
  cutoutRect(canvas, x, y + capH, w, h - capH);
  const { img, W, H } = canvas;
  const cx = x + w / 2;
  const y0 = Math.max(0, Math.round(y));
  const y1 = Math.min(H, Math.round(y + capH));
  for (let py = y0; py < y1; py++) {
    const t = (py - y) / capH; // 0 at apex, 1 at base
    const halfW = (w / 2) * t;
    const x0 = Math.max(0, Math.round(cx - halfW));
    const x1 = Math.min(W, Math.round(cx + halfW));
    for (let px = x0; px < x1; px++) {
      const i = (py * W + px) * 4;
      img.data[i + 3] = 0;
    }
  }
}

export function ceilingShadow(canvas, ramp, heightPx) {
  const { W, scale } = canvas;
  for (let y = 0; y < heightPx * scale; y++) {
    const t = y / (heightPx * scale);
    const a = Math.round(255 * (1 - t));
    fill(canvas, 0, y, W, 1, hex(ramp.dark), a);
  }
}
