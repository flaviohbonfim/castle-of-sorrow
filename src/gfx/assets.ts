/**
 * Optional hand-made asset override layer.
 *
 * At boot, tries `fetch('/assets/manifest.json')`. If missing or invalid,
 * the game stays 100% procedural — nothing else breaks.
 *
 * Manifest contract (see `public/assets/README.md`):
 * ```json
 * {
 *   "sheets": {
 *     "skeleton.walk": { "file": "skeleton.png", "frameW": 16, "frameH": 32, "frames": 2 },
 *     "bat.fly":       { "file": "bat.png", "frameW": 14, "frameH": 8, "frames": 2 }
 *   },
 *   "music": {
 *     "title":  "music/title.ogg",
 *     "castle": "music/castle.ogg",
 *     "boss":   "music/boss.ogg"
 *   }
 * }
 * ```
 * Horizontal spritesheets: frame i is at x = i * frameW, y = row * frameH.
 *
 * Manifest v2 adds `row`, `anchorX` and `anchorY`. They are all optional and
 * their defaults reproduce v1 behaviour exactly, so old manifests keep
 * working untouched — there is no version branching.
 */

import { makeSurface } from "../engine/renderer";

export interface SheetEntry {
  file: string;
  frameW: number;
  frameH: number;
  frames: number;
  /** v2: row of the frame box inside the PNG (several animations per file). Default 0. */
  row?: number;
  /**
   * v2: column of the anchor inside the frame box. Default `frameW / 2`.
   *
   * Entities blit sprites centred on the hitbox, so content is shifted
   * horizontally by `frameW / 2 - anchorX` at load time. Pixels pushed out of
   * the box are clipped — `tools/validate-assets.mjs` fails on that.
   */
  anchorX?: number;
  /**
   * v2: row of the anchor (the feet line) inside the frame box. Default `frameH`.
   *
   * Entities bottom-align sprites on the hitbox, so content is shifted down by
   * `frameH - anchorY`. Use it when the art has breathing room under the feet;
   * anything drawn below the anchor is clipped.
   */
  anchorY?: number;
}

export interface AssetManifest {
  /** Informational only — defaults keep v1 manifests valid. */
  version?: number;
  sheets?: Record<string, SheetEntry>;
  music?: Partial<Record<"title" | "castle" | "boss", string>>;
}

const sheets = new Map<string, HTMLCanvasElement[]>();
let musicPaths: AssetManifest["music"] = {};
let ready = false;

/** True after `loadAssets()` finishes (success or graceful miss). */
export function assetsReady(): boolean {
  return ready;
}

/** Procedural builders call this — returns null when no override is loaded. */
export function getSheet(name: string): HTMLCanvasElement[] | null {
  return sheets.get(name) ?? null;
}

/** Optional music file URL for a track name. */
export function getMusicUrl(track: "title" | "castle" | "boss"): string | null {
  const rel = musicPaths?.[track];
  if (!rel) return null;
  return rel.startsWith("/") ? rel : `/assets/${rel}`;
}

/**
 * Boot-time load. Safe to call once. Never throws to the game loop —
 * missing assets simply leave the override maps empty.
 */
export async function loadAssets(): Promise<void> {
  if (ready) return;
  try {
    const res = await fetch("/assets/manifest.json", { cache: "no-cache" });
    if (!res.ok) {
      ready = true;
      return;
    }
    const manifest = (await res.json()) as AssetManifest;
    musicPaths = manifest.music ?? {};

    const entries = Object.entries(manifest.sheets ?? {});
    await Promise.all(
      entries.map(async ([name, entry]) => {
        try {
          if (!validEntry(entry)) return;
          const frames = await loadSheet(entry);
          if (frames.length > 0) sheets.set(name, frames);
        } catch {
          // Keep procedural for this sheet.
        }
      }),
    );
  } catch {
    // No manifest / offline — full procedural path.
  }
  ready = true;
}

/** A malformed entry must never take a sprite down with it. */
function validEntry(entry: SheetEntry): boolean {
  const pos = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0;
  const inBox = (n: unknown, max: number) =>
    n === undefined || (typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max);
  return (
    typeof entry.file === "string" &&
    entry.file.length > 0 &&
    pos(entry.frameW) &&
    pos(entry.frameH) &&
    pos(entry.frames) &&
    inBox(entry.row, 4096) &&
    inBox(entry.anchorX, entry.frameW) &&
    inBox(entry.anchorY, entry.frameH)
  );
}

async function loadSheet(entry: SheetEntry): Promise<HTMLCanvasElement[]> {
  const url = entry.file.startsWith("/") ? entry.file : `/assets/${entry.file}`;
  const img = await loadImage(url);
  const { frameW, frameH } = entry;
  const sy = (entry.row ?? 0) * frameH;
  // Bake the anchor into the frame: entities blit centre-x / bottom-aligned,
  // so shifting content here is what makes an off-centre anchor land right.
  const dx = Math.round(frameW / 2 - (entry.anchorX ?? frameW / 2));
  const dy = Math.round(frameH - (entry.anchorY ?? frameH));
  const out: HTMLCanvasElement[] = [];
  for (let i = 0; i < entry.frames; i++) {
    const [c, ctx] = makeSurface(frameW, frameH);
    ctx.drawImage(img, i * frameW, sy, frameW, frameH, dx, dy, frameW, frameH);
    out.push(c);
  }
  return out;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

/** Build a SpriteSet-like {right,left} from a horizontal sheet of right-facing frames. */
export function sheetToFacingSet(
  frames: HTMLCanvasElement[],
): { right: HTMLCanvasElement[]; left: HTMLCanvasElement[] } {
  return {
    right: frames,
    left: frames.map(flipH),
  };
}

function flipH(f: HTMLCanvasElement): HTMLCanvasElement {
  const [c, ctx] = makeSurface(f.width, f.height);
  ctx.translate(f.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(f, 0, 0);
  return c;
}
