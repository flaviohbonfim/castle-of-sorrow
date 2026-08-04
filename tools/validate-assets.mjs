#!/usr/bin/env node
/**
 * QA gate for everything in `public/assets/manifest.json`.
 *
 *   node tools/validate-assets.mjs
 *
 * Fails the build on the defects that are invisible in a file browser but
 * obvious in motion:
 *   - colours outside the game palette          → the sprite doesn't belong
 *   - partial alpha                             → halo fringe at integer scale
 *   - frames that don't fit / empty frames       → holes in the animation
 *   - inconsistent feet line across frames       → foot-slide
 *   - content clipped by the declared anchor      → silently cropped art
 *
 * Exit code 1 on any error, so it can guard `npm run build`.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, makeImage, blit, opaqueBounds } from "./lib/png.mjs";
import { readPalette, rgbToHex } from "./lib/palette.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const outFlag = args.indexOf("--out");
const OUT_DIR = resolve(ROOT, outFlag >= 0 ? args[outFlag + 1] : join("public", "assets"));
const MANIFEST = join(OUT_DIR, "manifest.json");
const CONFIG = join(ROOT, "assets-src", "sprites.config.json");

const errors = [];
const warnings = [];
const err = (key, message) => errors.push(`${key}: ${message}`);
const warn = (key, message) => warnings.push(`${key}: ${message}`);

const PAL = readPalette();

function loadConfig() {
  if (!existsSync(CONFIG)) return new Map();
  const config = JSON.parse(readFileSync(CONFIG, "utf8"));
  return new Map((config.sheets ?? []).map((sheet) => [sheet.key, sheet]));
}

function checkSheet(key, entry, managed) {
  const errorsBefore = errors.length;
  const path = join(OUT_DIR, entry.file);
  if (!existsSync(path)) {
    err(key, `file not found: ${entry.file}`);
    return;
  }

  let img;
  try {
    img = decodePng(readFileSync(path));
  } catch (error) {
    err(key, `cannot decode ${entry.file}: ${error.message}`);
    return;
  }

  const { frameW, frameH, frames } = entry;
  const row = entry.row ?? 0;
  const needW = frames * frameW;
  const needH = (row + 1) * frameH;
  if (img.width < needW || img.height < needH) {
    err(
      key,
      `${entry.file} is ${img.width}x${img.height}, needs at least ${needW}x${needH} ` +
        `for ${frames} frames of ${frameW}x${frameH} at row ${row}`,
    );
    return;
  }
  if (img.width > needW && !entry.row) {
    warn(key, `${entry.file} has ${img.width - needW}px of unused width`);
  }

  // Palette: PAL, plus whatever the sheet explicitly declared in the config.
  const allowed = new Set(Object.values(PAL));
  for (const hex of managed?.extraColors ?? []) allowed.add(hex.toLowerCase());
  const offPalette = new Map();
  let partialAlpha = 0;

  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3];
    if (a !== 0 && a !== 255) {
      partialAlpha++;
      continue;
    }
    if (a === 0) continue;
    const hex = rgbToHex(img.data[i], img.data[i + 1], img.data[i + 2]);
    if (!allowed.has(hex)) offPalette.set(hex, (offPalette.get(hex) ?? 0) + 1);
  }

  if (partialAlpha > 0) {
    err(key, `${partialAlpha} pixels with partial alpha — run tools/process-sprites.mjs`);
  }
  if (offPalette.size > 0) {
    const worst = [...offPalette.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([hex, n]) => `${hex} (${n}px)`)
      .join(", ");
    err(
      key,
      `${offPalette.size} colour(s) outside the palette: ${worst}` +
        `${offPalette.size > 4 ? ", …" : ""}`,
    );
  }

  // Per-frame geometry.
  const align = managed?.align ?? "feet";
  const anchorX = entry.anchorX ?? frameW / 2;
  const anchorY = entry.anchorY ?? frameH;
  const dx = Math.round(frameW / 2 - anchorX);
  const dy = Math.round(frameH - anchorY);
  const lines = [];

  for (let i = 0; i < frames; i++) {
    const box = makeImage(frameW, frameH);
    blit(img, box, {
      sx: i * frameW,
      sy: row * frameH,
      sw: frameW,
      sh: frameH,
      dx: 0,
      dy: 0,
    });
    const bounds = opaqueBounds(box);
    if (!bounds) {
      err(key, `frame ${i} is empty`);
      continue;
    }
    if (
      bounds.x + dx < 0 ||
      bounds.x + bounds.w + dx > frameW ||
      bounds.y + dy < 0 ||
      bounds.y + bounds.h + dy > frameH
    ) {
      err(key, `frame ${i}: anchor (${anchorX},${anchorY}) clips content out of the frame box`);
    }
    lines.push(align === "center" ? bounds.y + bounds.h / 2 : bounds.y + bounds.h);
  }

  // Foot-slide. What counts as a defect depends on how the sheet was packed:
  // with per-frame registration every frame sits exactly on the anchor, so any
  // deviation is a bug; with shared registration the line is allowed to move
  // (that IS the animation), but it must still touch the anchor somewhere.
  const label = align === "center" ? "centre line" : "feet line";
  const registration = managed?.registration ?? (managed?.source ? "shared" : "per-frame");
  const anchorLine = align === "center" ? frameH / 2 : frameH;
  const spread = Math.max(...lines) - Math.min(...lines);

  if (lines.length > 0 && !lines.some((line) => Math.abs(line - anchorLine) < 0.001)) {
    const message = `no frame sits on the ${label} (${anchorLine}) — the whole sheet is offset`;
    if (managed) err(key, message);
    else warn(key, message);
  } else if (spread > 0) {
    const drift = managed?.maxFeetDrift ?? (registration === "shared" ? 4 : 0);
    const message = `${label} moves up to ${spread}px between frames — sprite may slide`;
    if (managed && spread > drift) err(key, message);
    else if (spread > 0) warn(key, message);
  }

  const clean = errors.length === errorsBefore;
  console.log(
    `  ${key.padEnd(24)} ${String(frames).padStart(2)} frames  ${frameW}x${frameH}  ` +
      (clean ? "\x1b[32mok\x1b[0m" : "\x1b[31mfail\x1b[0m"),
  );
}

function main() {
  if (!existsSync(MANIFEST)) {
    console.log("no public/assets/manifest.json — game is fully procedural, nothing to validate");
    return;
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const managed = loadConfig();
  const sheets = Object.entries(manifest.sheets ?? {});

  console.log(`validating ${sheets.length} sheet(s) against ${Object.keys(PAL).length} palette colours\n`);
  for (const [key, entry] of sheets) checkSheet(key, entry, managed.get(key));

  for (const music of Object.values(manifest.music ?? {})) {
    const path = music.startsWith("/") ? join(ROOT, "public", music) : join(OUT_DIR, music);
    if (!existsSync(path)) warn("music", `declared but missing: ${music}`);
  }

  if (warnings.length > 0) {
    console.log(`\n\x1b[33m${warnings.length} warning(s)\x1b[0m`);
    for (const message of warnings) console.log(`  ${message}`);
  }
  if (errors.length > 0) {
    console.log(`\n\x1b[31m${errors.length} error(s)\x1b[0m`);
    for (const message of errors) console.log(`  ${message}`);
    console.log("\nFix the source art or drop the key from the manifest to fall back to procedural.");
    process.exit(1);
  }
  console.log("\n\x1b[32mall assets valid\x1b[0m");
}

main();
