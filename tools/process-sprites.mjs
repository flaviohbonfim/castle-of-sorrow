#!/usr/bin/env node
/**
 * Turn raw art (AI-generated or hand-drawn) into engine-ready spritesheets.
 *
 *   node tools/process-sprites.mjs [--preview] [--only <key>]
 *
 * Reads `assets-src/sprites.config.json`, and for every frame:
 *   1. hard-thresholds alpha    — no anti-aliased halo, ever
 *   2. quantises to the palette — OKLab nearest, so the art belongs to the game
 *   3. trims to content         — the generator's framing is not our framing
 *   4. re-aligns on the anchor  — feet on the same row in every frame
 *   5. packs a horizontal strip — the layout `src/gfx/assets.ts` expects
 *
 * Then it writes `public/assets/<out>.png` and merges the entries into
 * `public/assets/manifest.json`, preserving music and hand-written entries.
 *
 * Nothing here is destructive to sources: `assets-src/` is read-only input.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { blit, decodePng, encodePng, makeImage, opaqueBounds } from "./lib/png.mjs";
import { makeQuantizer, readPalette, rgbToHex } from "./lib/palette.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SRC_DIR = join(ROOT, "assets-src");
const CONFIG = join(SRC_DIR, "sprites.config.json");

const args = process.argv.slice(2);
const preview = args.includes("--preview");
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const only = flag("--only");
// `--out` keeps the self-test out of the shipped build.
const OUT_DIR = resolve(ROOT, flag("--out") ?? join("public", "assets"));
const MANIFEST = join(OUT_DIR, "manifest.json");

const PAL = readPalette();

function fail(message) {
  console.error(`\x1b[31merror\x1b[0m ${message}`);
  process.exitCode = 1;
}

/** Palette targets for a sheet: the whole PAL unless it names a subset. */
function paletteFor(sheet) {
  const named = (sheet.palette ?? []).map((key) => {
    const hex = PAL[key];
    if (!hex) throw new Error(`sheet "${sheet.key}": unknown palette name "${key}"`);
    return hex;
  });
  const extra = (sheet.extraColors ?? []).map((hex) => hex.toLowerCase());
  const base = named.length > 0 ? named : Object.values(PAL);
  return [...new Set([...base, ...extra])];
}

/** Decode one source frame and return it as an RGBA image. */
function loadFrame(relPath) {
  const path = join(SRC_DIR, relPath);
  if (!existsSync(path)) throw new Error(`missing source file: ${relPath}`);
  return decodePng(readFileSync(path));
}

/** Cut frame `index` out of a grid sheet. */
function cutFromGrid(img, source, index) {
  const cols = source.cols ?? 1;
  const rows = source.rows ?? 1;
  const cw = Math.floor(img.width / cols);
  const ch = Math.floor(img.height / rows);
  const cell = makeImage(cw, ch);
  blit(
    img,
    cell,
    { sx: (index % cols) * cw, sy: Math.floor(index / cols) * ch, sw: cw, sh: ch, dx: 0, dy: 0 },
  );
  return cell;
}

/** Step 1: binary alpha. Colour is left alone — quantisation comes after any resize. */
function thresholdAlpha(img, threshold) {
  const out = makeImage(img.width, img.height);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < threshold) continue; // stays fully transparent, RGB zeroed
    out.data[i] = img.data[i];
    out.data[i + 1] = img.data[i + 1];
    out.data[i + 2] = img.data[i + 2];
    out.data[i + 3] = 255;
  }
  return out;
}

/** Step 2: palette lock. */
function quantizeImage(img, quantize) {
  const out = makeImage(img.width, img.height);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    const [r, g, b] = quantize(img.data[i], img.data[i + 1], img.data[i + 2]);
    out.data[i] = r;
    out.data[i + 1] = g;
    out.data[i + 2] = b;
    out.data[i + 3] = 255;
  }
  return out;
}

function crop(img, box) {
  const out = makeImage(box.w, box.h);
  blit(img, out, { sx: box.x, sy: box.y, sw: box.w, sh: box.h, dx: 0, dy: 0 });
  return out;
}

/**
 * Box-filter downscale — the step that turns generated art into real pixel art.
 *
 * Generators return figures 2-4x taller than a 16-bit sprite, so something has
 * to reduce them. Nearest-neighbour drops every other row and shreds thin
 * features (a sword becomes dashes); averaging keeps them as intermediate
 * tones, which the palette quantiser then snaps onto the ramp. RGB is averaged
 * weighted by alpha so transparent black never bleeds into the edges.
 */
function resizeImage(img, dw, dh) {
  const out = makeImage(dw, dh);
  const fx = img.width / dw;
  const fy = img.height / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.max(y0 + 1, Math.ceil((y + 1) * fy));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.max(x0 + 1, Math.ceil((x + 1) * fx));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < Math.min(y1, img.height); sy++) {
        for (let sx = x0; sx < Math.min(x1, img.width); sx++) {
          const i = (sy * img.width + sx) * 4;
          const alpha = img.data[i + 3];
          r += img.data[i] * alpha;
          g += img.data[i + 1] * alpha;
          b += img.data[i + 2] * alpha;
          a += alpha;
          n++;
        }
      }
      const d = (y * dw + x) * 4;
      if (a === 0 || n === 0) continue;
      out.data[d] = Math.round(r / a);
      out.data[d + 1] = Math.round(g / a);
      out.data[d + 2] = Math.round(b / a);
      out.data[d + 3] = a / n >= 128 ? 255 : 0; // re-threshold: still no partial alpha
    }
  }
  return out;
}

/**
 * Steps 3 and 4: trim and place on the anchor.
 *
 * `registration` decides whether the frames already agree on a common origin:
 *
 * - "shared"    — one offset for the whole set, computed from the union of
 *                 every frame. Keeps the relative motion the artist drew: a
 *                 lifted foot stays lifted instead of being shoved onto the
 *                 ground, and a narrower frame doesn't drift sideways.
 *                 Requires all frames on identically sized canvases, which is
 *                 what a grid sheet gives you. Default for `source`.
 * - "per-frame" — each frame trimmed and re-anchored on its own. The only
 *                 option when frames come from separate generations, where the
 *                 crop of each canvas is noise rather than intent. Costs up to
 *                 a pixel of jitter on frames with different silhouettes.
 *                 Default for `frames`.
 */
function placeAll(images, sheet, labels) {
  const { frameW, frameH } = sheet;
  const align = sheet.align ?? "feet";
  const registration = sheet.registration ?? (sheet.source ? "shared" : "per-frame");

  if (align === "none") {
    return images.map((img, i) => {
      if (img.width !== frameW || img.height !== frameH) {
        throw new Error(
          `${labels[i]}: align "none" needs a ${frameW}x${frameH} source, got ${img.width}x${img.height}`,
        );
      }
      return img;
    });
  }

  const bounds = images.map((img, i) => {
    const box = opaqueBounds(img);
    if (!box) throw new Error(`${labels[i]}: frame is empty after alpha threshold`);
    return box;
  });

  const fit = (w, h, what) => {
    if (w > frameW || h > frameH) {
      throw new Error(`${what} is ${w}x${h}, does not fit the ${frameW}x${frameH} box`);
    }
  };
  const offsetFor = (b) => ({
    dx: Math.round((frameW - b.w) / 2) - b.x,
    dy: (align === "center" ? Math.round((frameH - b.h) / 2) : frameH - b.h) - b.y,
  });

  let offsets;
  if (registration === "shared") {
    const odd = images.findIndex(
      (img) => img.width !== images[0].width || img.height !== images[0].height,
    );
    if (odd > 0) {
      throw new Error(
        `${labels[odd]}: registration "shared" needs every frame on the same canvas ` +
          `(${images[0].width}x${images[0].height}), got ${images[odd].width}x${images[odd].height}`,
      );
    }
    const union = {
      x: Math.min(...bounds.map((b) => b.x)),
      y: Math.min(...bounds.map((b) => b.y)),
    };
    union.w = Math.max(...bounds.map((b) => b.x + b.w)) - union.x;
    union.h = Math.max(...bounds.map((b) => b.y + b.h)) - union.y;
    fit(union.w, union.h, `${sheet.key}: the animation spans`);
    const shared = offsetFor(union);
    offsets = bounds.map(() => shared);
  } else {
    bounds.forEach((b, i) => fit(b.w, b.h, `${labels[i]}: content`));
    offsets = bounds.map(offsetFor);
  }

  return images.map((img, i) => {
    const box = makeImage(frameW, frameH);
    blit(img, box, {
      sx: 0,
      sy: 0,
      sw: img.width,
      sh: img.height,
      dx: offsets[i].dx,
      dy: offsets[i].dy,
    });
    return box;
  });
}

/**
 * Majority downscale — quantise first, then let each destination pixel take
 * the most common palette colour under it.
 *
 * Averaging (the `box` default) is right when the source is smooth, but it
 * softens every edge and then the quantiser has to guess. Voting keeps hard
 * edges hard, which is what pixel art is made of. It costs thin features that
 * never win a vote, so it suits chunky subjects and box suits detailed ones —
 * hence the per-sheet choice.
 */
function resizeMajority(img, dw, dh) {
  const out = makeImage(dw, dh);
  const fx = img.width / dw;
  const fy = img.height / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.max(y0 + 1, Math.ceil((y + 1) * fy));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.max(x0 + 1, Math.ceil((x + 1) * fx));
      const votes = new Map();
      let opaque = 0;
      let total = 0;
      for (let sy = y0; sy < Math.min(y1, img.height); sy++) {
        for (let sx = x0; sx < Math.min(x1, img.width); sx++) {
          const i = (sy * img.width + sx) * 4;
          total++;
          if (img.data[i + 3] === 0) continue;
          opaque++;
          const key = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
          votes.set(key, (votes.get(key) ?? 0) + 1);
        }
      }
      const d = (y * dw + x) * 4;
      if (opaque * 2 < total || votes.size === 0) continue; // mostly empty -> transparent
      let bestKey = 0;
      let bestVotes = -1;
      for (const [key, n] of votes) {
        if (n > bestVotes) {
          bestVotes = n;
          bestKey = key;
        }
      }
      out.data[d] = (bestKey >> 16) & 0xff;
      out.data[d + 1] = (bestKey >> 8) & 0xff;
      out.data[d + 2] = bestKey & 0xff;
      out.data[d + 3] = 255;
    }
  }
  return out;
}

/** Scale factor for a `resize` spec: an explicit `scale`, or a target height/width. */
function targetScale(resize, bounds) {
  if (resize.scale) return resize.scale;
  if (resize.height) return resize.height / bounds.h;
  if (resize.width) return resize.width / bounds.w;
  throw new Error('resize needs one of "height", "width" or "scale"');
}

/** Terminal preview — the cheapest way to catch a mangled sprite. */
function printPreview(strip, sheet) {
  const shade = " .:-=+*#%@";
  console.log(`\n  ${sheet.key}`);
  for (let y = 0; y < strip.height; y++) {
    let line = "  ";
    for (let x = 0; x < strip.width; x++) {
      const i = (y * strip.width + x) * 4;
      if (strip.data[i + 3] === 0) {
        line += " ";
      } else {
        const lum = (strip.data[i] * 0.3 + strip.data[i + 1] * 0.59 + strip.data[i + 2] * 0.11) / 255;
        line += shade[Math.min(shade.length - 1, Math.round(lum * (shade.length - 1)) + 1)];
      }
    }
    console.log(line.replace(/\s+$/, ""));
  }
}

function processSheet(sheet) {
  const { key, frameW, frameH } = sheet;
  for (const field of ["key", "out", "frameW", "frameH"]) {
    if (sheet[field] === undefined) throw new Error(`sheet "${key ?? "?"}": missing "${field}"`);
  }

  const quantize = makeQuantizer(paletteFor(sheet));
  const threshold = sheet.alphaThreshold ?? 128;

  // Frames come either as one file each, or as cells of a single grid sheet.
  let sources;
  if (sheet.frames) {
    sources = sheet.frames.map((file, i) => ({ label: `${key}[${i}] ${file}`, img: loadFrame(file) }));
  } else if (sheet.source) {
    let grid = loadFrame(sheet.source.file);
    // Generators emit fixed canvas sizes; `crop` cuts the useful band out
    // before the grid is sliced.
    if (sheet.source.crop) grid = crop(grid, sheet.source.crop);
    const count = (sheet.source.cols ?? 1) * (sheet.source.rows ?? 1);
    const picks = sheet.source.keyframes ?? [...Array(count).keys()];
    sources = picks.map((index) => ({
      label: `${key}[${index}] ${sheet.source.file}`,
      img: cutFromGrid(grid, sheet.source, index),
    }));
  } else {
    throw new Error(`sheet "${key}": needs either "frames" or "source"`);
  }

  const labels = sources.map((source) => source.label);
  const majority = sheet.resize?.mode === "majority";
  let frames = sources.map((source) => thresholdAlpha(source.img, threshold));
  // Majority voting needs palette colours to vote on, so it quantises first.
  if (majority) frames = frames.map((img) => quantizeImage(img, quantize));

  // Reduce to native pixel size before quantising, so the palette snap happens
  // on final pixels rather than on detail that is about to be thrown away.
  if (sheet.resize?.width && sheet.resize?.height) {
    // Both dimensions given: exact output size, whole frame, no content crop.
    // For full-bleed art (backdrops, parallax strips) where the canvas IS the
    // subject and `align: "none"` needs the frame box hit exactly.
    const reduce = majority ? resizeMajority : resizeImage;
    frames = frames.map((img) => reduce(img, sheet.resize.width, sheet.resize.height));
  } else if (sheet.resize) {
    const registration = sheet.registration ?? (sheet.source ? "shared" : "per-frame");
    const each = frames.map((img, i) => {
      const bounds = opaqueBounds(img);
      if (!bounds) throw new Error(`${labels[i]}: frame is empty after alpha threshold`);
      return bounds;
    });
    // Shared registration must crop and scale every frame identically, or the
    // relative motion it exists to preserve is lost.
    if (registration === "shared") {
      const union = {
        x: Math.min(...each.map((b) => b.x)),
        y: Math.min(...each.map((b) => b.y)),
      };
      union.w = Math.max(...each.map((b) => b.x + b.w)) - union.x;
      union.h = Math.max(...each.map((b) => b.y + b.h)) - union.y;
      const scale = targetScale(sheet.resize, union);
      const reduce = majority ? resizeMajority : resizeImage;
      frames = frames.map((img) =>
        reduce(crop(img, union), Math.max(1, Math.round(union.w * scale)), Math.max(1, Math.round(union.h * scale))),
      );
    } else {
      frames = frames.map((img, i) => {
        const scale = targetScale(sheet.resize, each[i]);
        const reduce = majority ? resizeMajority : resizeImage;
        return reduce(
          crop(img, each[i]),
          Math.max(1, Math.round(each[i].w * scale)),
          Math.max(1, Math.round(each[i].h * scale)),
        );
      });
    }
  }

  const cleaned = majority ? frames : frames.map((img) => quantizeImage(img, quantize));
  const boxes = placeAll(cleaned, sheet, labels);

  const strip = makeImage(frameW * boxes.length, frameH);
  boxes.forEach((box, i) => {
    blit(box, strip, { sx: 0, sy: 0, sw: frameW, sh: frameH, dx: i * frameW, dy: 0 });
  });

  const outPath = join(OUT_DIR, sheet.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, encodePng(strip.width, strip.height, strip.data));

  const colors = new Set();
  for (let i = 0; i < strip.data.length; i += 4) {
    if (strip.data[i + 3] !== 0) {
      colors.add(rgbToHex(strip.data[i], strip.data[i + 1], strip.data[i + 2]));
    }
  }

  if (preview) printPreview(strip, sheet);
  console.log(
    `  ${key.padEnd(24)} ${sheet.out.padEnd(22)} ${sources.length} frames  ` +
      `${frameW}x${frameH}  ${colors.size} colours`,
  );

  return { file: sheet.out, frameW, frameH, frames: sources.length };
}

function main() {
  if (!existsSync(CONFIG)) {
    fail(`no ${CONFIG}. See docs/ART_PIPELINE.md §4.`);
    return;
  }
  const config = JSON.parse(readFileSync(CONFIG, "utf8"));
  const sheets = config.sheets.filter((s) => !only || s.key === only);
  if (sheets.length === 0) {
    fail(only ? `no sheet with key "${only}"` : "config has no sheets");
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
  manifest.version = 2;
  manifest.sheets ??= {};

  console.log(`processing ${sheets.length} sheet(s)\n`);
  let failed = 0;
  for (const sheet of sheets) {
    // `enabled: false` keeps a recipe around without shipping it — for art
    // that was generated but not approved. The config owns its keys, so the
    // manifest entry goes away and the game falls back to procedural.
    if (sheet.enabled === false) {
      delete manifest.sheets[sheet.key];
      console.log(`  ${sheet.key.padEnd(24)} disabled — falling back to procedural`);
      continue;
    }
    try {
      manifest.sheets[sheet.key] = processSheet(sheet);
    } catch (error) {
      failed++;
      fail(error.message);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} sheet(s) failed — manifest left untouched.`);
    return;
  }

  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nwrote ${MANIFEST}`);
  console.log("next: npm run assets:validate");
}

main();
