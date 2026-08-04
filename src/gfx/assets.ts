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
 * Horizontal spritesheets only: frame i is at x = i * frameW.
 */

import { makeSurface } from "../engine/renderer";

export interface SheetEntry {
  file: string;
  frameW: number;
  frameH: number;
  frames: number;
}

export interface AssetManifest {
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

async function loadSheet(entry: SheetEntry): Promise<HTMLCanvasElement[]> {
  const url = entry.file.startsWith("/") ? entry.file : `/assets/${entry.file}`;
  const img = await loadImage(url);
  const out: HTMLCanvasElement[] = [];
  for (let i = 0; i < entry.frames; i++) {
    const [c, ctx] = makeSurface(entry.frameW, entry.frameH);
    ctx.drawImage(
      img,
      i * entry.frameW,
      0,
      entry.frameW,
      entry.frameH,
      0,
      0,
      entry.frameW,
      entry.frameH,
    );
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
