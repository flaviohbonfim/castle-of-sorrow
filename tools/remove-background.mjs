#!/usr/bin/env node
/**
 * Chroma-key an opaque image down to a transparent sprite.
 *
 *   node tools/remove-background.mjs <input.png> <output.png> [options]
 *
 * For sources with no alpha channel at all — a Grok Imagine download, a
 * screenshot, a photo, anything generated on a solid backdrop. SpriteCook
 * already returns alpha, so this step is only needed for other sources.
 *
 * Options:
 *   --color RRGGBB   Backdrop colour. Default: auto-sampled from the border
 *                     (most common exact colour along the image edge).
 *   --t1 N            Flood-fill threshold, OKLab distance. Default 0.06.
 *   --t2 N            Erosion threshold (looser). Default 0.12.
 *   --erode N         Erosion rounds. Default 2.
 *   --preview         Print an ASCII preview of the result.
 *
 * Output feeds straight into assets-src/raw/ as a `frames` source for
 * tools/process-sprites.mjs — its own alpha threshold (step 1) drops
 * anything below alpha 128, so the binary matte this produces is exactly
 * what the rest of the pipeline expects.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodePng, encodePng } from "./lib/png.mjs";
import { chromaKey, sampleBorderColor } from "./lib/chroma.mjs";
import { hexToRgb, oklab, readPalette } from "./lib/palette.mjs";

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const [inputPath, outputPath] = positional;
if (!inputPath || !outputPath) {
  console.error("usage: node tools/remove-background.mjs <input.png> <output.png> [--color RRGGBB] [--t1 N] [--t2 N] [--erode N] [--preview]");
  process.exit(1);
}

const img = decodePng(readFileSync(resolve(inputPath)));

const colorFlag = flag("color");
const bgRgb = colorFlag ? hexToRgb(`#${colorFlag.replace(/^#/, "")}`) : sampleBorderColor(img);
const bgHex = `#${bgRgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
console.log(`backdrop: ${bgHex}${colorFlag ? "" : " (auto-sampled)"}`);

// Warn if the chosen backdrop sits close to a colour the sprite itself will
// use — flood-fill can't tell "part of the subject" from "part of the
// backdrop" by colour alone, so a near-match risks eating real pixels.
const PAL = readPalette();
const bgLab = oklab(...bgRgb);
let closest = null;
let closestDist = Infinity;
for (const [key, hex] of Object.entries(PAL)) {
  const [l, a, b] = oklab(...hexToRgb(hex));
  const dist = Math.hypot(l - bgLab[0], a - bgLab[1], b - bgLab[2]);
  if (dist < closestDist) {
    closestDist = dist;
    closest = key;
  }
}
if (closestDist < 0.12) {
  console.warn(
    `\x1b[33mwarning\x1b[0m backdrop ${bgHex} is close to PAL.${closest} (OKLab dist ${closestDist.toFixed(3)}) — ` +
      `if the subject uses that colour, edges may get eaten. Prefer a saturated colour outside the palette (pure magenta, cyan).`,
  );
}

const t1 = Number(flag("t1", 0.06));
const t2 = Number(flag("t2", 0.12));
const erode = Number(flag("erode", 2));
const { image, bgFraction } = chromaKey(img, bgRgb, { t1, t2, erode });

if (bgFraction > 0.98) {
  console.error(
    `error: ${(bgFraction * 100).toFixed(1)}% of the image was classified as background — ` +
      `either the source is blank or --color/--t1 is wrong. Nothing written.`,
  );
  process.exit(1);
}
if (bgFraction < 0.02) {
  console.warn(
    `\x1b[33mwarning\x1b[0m only ${(bgFraction * 100).toFixed(1)}% classified as background — ` +
      `the backdrop may not have been removed. Check --color.`,
  );
}

writeFileSync(resolve(outputPath), encodePng(image.width, image.height, image.data));
console.log(`wrote ${outputPath} (${image.width}x${image.height}, ${(bgFraction * 100).toFixed(1)}% transparent)`);

if (has("preview")) {
  const shade = " .:-=+*#%@";
  for (let y = 0; y < image.height; y++) {
    let line = "  ";
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      if (image.data[i + 3] === 0) {
        line += " ";
      } else {
        const lum = (image.data[i] * 0.3 + image.data[i + 1] * 0.59 + image.data[i + 2] * 0.11) / 255;
        line += shade[Math.min(shade.length - 1, Math.round(lum * (shade.length - 1)) + 1)];
      }
    }
    console.log(line.replace(/\s+$/, ""));
  }
}
