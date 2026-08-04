/**
 * Chroma-key: turn a fully opaque image (a photo, a screenshot, anything shot
 * on a solid backdrop) into one with real binary alpha.
 *
 * The rest of the pipeline (`process-sprites.mjs`) assumes its raw frames
 * already carry alpha — SpriteCook's output does. A generic image generator
 * doesn't, so this is the adapter that makes any solid-backdrop source usable
 * as a `frames` entry in `assets-src/sprites.config.json`.
 */
import { makeImage } from "./png.mjs";
import { oklab } from "./palette.mjs";

const NEIGHBORS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function distToLab(data, i, targetLab) {
  const [L, a, b] = oklab(data[i], data[i + 1], data[i + 2]);
  const dl = L - targetLab[0];
  const da = a - targetLab[1];
  const db = b - targetLab[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

/** Most common exact colour along the image border — the backdrop, assuming it's a flat fill. */
export function sampleBorderColor(img) {
  const { width: w, height: h, data } = img;
  const counts = new Map();
  const add = (x, y) => {
    const i = (y * w + x) * 4;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (let x = 0; x < w; x++) {
    add(x, 0);
    add(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    add(0, y);
    add(w - 1, y);
  }
  let bestKey = 0;
  let bestCount = -1;
  for (const [key, n] of counts) {
    if (n > bestCount) {
      bestCount = n;
      bestKey = key;
    }
  }
  return [(bestKey >> 16) & 0xff, (bestKey >> 8) & 0xff, bestKey & 0xff];
}

/**
 * Flood-fill the backdrop out to transparency, then erode a couple of rounds
 * to eat the anti-aliased fringe every screenshot has around hard edges.
 *
 * Flood-filling from the border (rather than "any pixel close to the backdrop
 * colour") is the part that matters: it never punches a hole in the middle of
 * the subject even if the subject happens to contain a similar colour, because
 * that patch isn't reachable from the outside without crossing the subject.
 *
 * @param img {{width:number,height:number,data:Uint8Array}}
 * @param bgRgb {[number,number,number]}
 * @param opts {{t1?:number, t2?:number, erode?:number}}
 *   t1 — flood-fill threshold (OKLab distance). How close to the backdrop a
 *        pixel must be to seed/spread as background. Default 0.06.
 *   t2 — erosion threshold, looser than t1. A pixel touching background gets
 *        eaten too if it's within this distance. Default 0.12.
 *   erode — erosion rounds. Default 2.
 */
export function chromaKey(img, bgRgb, opts = {}) {
  const { t1 = 0.06, t2 = 0.12, erode = 2 } = opts;
  const { width: w, height: h, data } = img;
  const bgLab = oklab(bgRgb[0], bgRgb[1], bgRgb[2]);
  const isBg = new Uint8Array(w * h);
  const visited = new Uint8Array(w * h);
  const stack = [];

  const seed = (x, y) => {
    const i = y * w + x;
    if (visited[i]) return;
    visited[i] = 1;
    if (distToLab(data, i * 4, bgLab) <= t1) {
      isBg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x, 0);
    seed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seed(0, y);
    seed(w - 1, y);
  }

  while (stack.length > 0) {
    const i = stack.pop();
    const x = i % w;
    const y = (i / w) | 0;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (visited[ni]) continue;
      visited[ni] = 1;
      if (distToLab(data, ni * 4, bgLab) <= t1) {
        isBg[ni] = 1;
        stack.push(ni);
      }
    }
  }

  for (let round = 0; round < erode; round++) {
    const toMark = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (isBg[i]) continue;
        let adjacent = false;
        for (const [dx, dy] of NEIGHBORS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (isBg[ny * w + nx]) {
            adjacent = true;
            break;
          }
        }
        if (adjacent && distToLab(data, i * 4, bgLab) <= t2) toMark.push(i);
      }
    }
    if (toMark.length === 0) break;
    for (const i of toMark) isBg[i] = 1;
  }

  const out = makeImage(w, h);
  let bgCount = 0;
  for (let i = 0; i < w * h; i++) {
    const off = i * 4;
    if (isBg[i]) {
      bgCount++;
      continue; // stays transparent (makeImage zero-fills)
    }
    out.data[off] = data[off];
    out.data[off + 1] = data[off + 1];
    out.data[off + 2] = data[off + 2];
    out.data[off + 3] = 255;
  }
  return { image: out, bgFraction: bgCount / (w * h) };
}
