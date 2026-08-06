import { makeSurface } from "../engine/renderer";
import { getSheet } from "./assets";
import { PAL } from "./palette";

export const TILE = 16;

export const enum TileId {
  Empty = 0,
  Brick = 1,
  FloorTop = 2,
  Platform = 3,
  PillarTop = 4,
  Pillar = 5,
  PillarBase = 6,
  BgWall = 7,
  BgWindow = 8,
  Cracked = 9,
  Gate = 10,
  Water = 11,
  WaterTop = 12,
  /** Dark archway passage — non-solid exit that does NOT show the sky. */
  Door = 13,
}

export type ZoneId = "castle" | "tower";

interface StoneRamp {
  dark: string;
  mid: string;
  light: string;
  hi: string;
  bgMortar: string;
  bgSpeckle: string;
}

const CASTLE_RAMP: StoneRamp = {
  dark: PAL.stoneDark,
  mid: PAL.stoneMid,
  light: PAL.stoneLight,
  hi: PAL.stoneHi,
  bgMortar: "#241e33",
  bgSpeckle: "#100c1c",
};

const TOWER_RAMP: StoneRamp = {
  dark: PAL.towerStoneDark,
  mid: PAL.towerStoneMid,
  light: PAL.towerStoneLight,
  hi: PAL.towerStoneHi,
  bgMortar: "#243028",
  bgSpeckle: "#101814",
};

/** Deterministic per-tile noise so bricks look weathered but stable. */
function noise(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function brickBase(ctx: CanvasRenderingContext2D, seed: number, ramp: StoneRamp): void {
  ctx.fillStyle = ramp.mid;
  ctx.fillRect(0, 0, TILE, TILE);
  // Mortar lines: two brick rows offset per course.
  ctx.fillStyle = ramp.dark;
  ctx.fillRect(0, 7, TILE, 1);
  ctx.fillRect(0, 15, TILE, 1);
  const off = seed % 2 === 0 ? 4 : 10;
  ctx.fillRect(off, 0, 1, 7);
  ctx.fillRect((off + 8) % 16, 8, 1, 7);
  // Highlights on brick tops
  ctx.fillStyle = ramp.light;
  ctx.fillRect(0, 0, TILE, 1);
  ctx.fillRect(0, 8, TILE, 1);
  // Weathering speckle
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(noise(seed, i) * 16);
    const y = Math.floor(noise(i, seed) * 16);
    ctx.fillStyle = noise(seed + i, y) > 0.5 ? ramp.dark : ramp.light;
    ctx.fillRect(x, y, 1, 1);
  }
}

export function buildTileset(zone: ZoneId = "castle"): Map<TileId, HTMLCanvasElement[]> {
  const ramp = zone === "tower" ? TOWER_RAMP : CASTLE_RAMP;
  const tiles = new Map<TileId, HTMLCanvasElement[]>();
  const variants = (n: number, draw: (ctx: CanvasRenderingContext2D, seed: number) => void) => {
    const out: HTMLCanvasElement[] = [];
    for (let s = 0; s < n; s++) {
      const [c, ctx] = makeSurface(TILE, TILE);
      draw(ctx, s);
      out.push(c);
    }
    return out;
  };

  tiles.set(TileId.Brick, variants(4, (ctx, s) => brickBase(ctx, s, ramp)));

  tiles.set(
    TileId.FloorTop,
    variants(4, (ctx, s) => {
      brickBase(ctx, s + 7, ramp);
      // Worn stone lip along the walkable edge.
      ctx.fillStyle = ramp.hi;
      ctx.fillRect(0, 0, TILE, 2);
      ctx.fillStyle = ramp.light;
      ctx.fillRect(0, 2, TILE, 1);
    }),
  );

  tiles.set(
    TileId.Platform,
    variants(1, (ctx) => {
      // Clean carved gothic stone ledge
      ctx.fillStyle = ramp.mid;
      ctx.fillRect(0, 0, TILE, 3);
      ctx.fillStyle = ramp.light;
      ctx.fillRect(0, 0, TILE, 1);
      ctx.fillStyle = ramp.dark;
      ctx.fillRect(0, 3, TILE, 2);
    }),
  );

  // Pillars: 3D carved gothic stone columns with fluting and detailed capitals/bases
  tiles.set(
    TileId.PillarTop,
    variants(1, (ctx) => {
      // Abacus top plate
      ctx.fillStyle = ramp.hi;
      ctx.fillRect(0, 2, TILE, 2);
      ctx.fillStyle = ramp.light;
      ctx.fillRect(0, 4, TILE, 2);
      ctx.fillStyle = ramp.dark;
      ctx.fillRect(0, 6, TILE, 1);
      // Carved bell capital with leaf relief
      ctx.fillStyle = ramp.mid;
      ctx.fillRect(2, 7, 12, 5);
      ctx.fillStyle = ramp.light;
      ctx.fillRect(4, 7, 3, 4);
      ctx.fillRect(9, 7, 3, 4);
      ctx.fillStyle = ramp.hi;
      ctx.fillRect(5, 7, 1, 3);
      ctx.fillRect(10, 7, 1, 3);
      // Necking ring
      ctx.fillStyle = ramp.dark;
      ctx.fillRect(2, 12, 12, 1);
      // Shaft top start
      ctx.fillStyle = ramp.mid;
      ctx.fillRect(2, 13, 12, 3);
      ctx.fillStyle = ramp.dark;
      ctx.fillRect(2, 13, 1, 3);
      ctx.fillRect(13, 13, 1, 3);
      ctx.fillStyle = ramp.hi;
      ctx.fillRect(4, 13, 1, 3);
    }),
  );

  tiles.set(
    TileId.Pillar,
    variants(2, (ctx, s) => {
      // Fluted 3D column shaft
      ctx.fillStyle = ramp.mid;
      ctx.fillRect(2, 0, 12, TILE);
      // Shadow & specular cylinder curve
      ctx.fillStyle = ramp.dark;
      ctx.fillRect(2, 0, 1, TILE);
      ctx.fillRect(13, 0, 1, TILE);
      ctx.fillStyle = ramp.hi;
      ctx.fillRect(4, 0, 1, TILE);
      ctx.fillStyle = ramp.light;
      ctx.fillRect(5, 0, 1, TILE);
      // Fluting grooves (estrias verticais)
      ctx.fillStyle = ramp.dark;
      ctx.fillRect(6, 0, 1, TILE);
      ctx.fillRect(9, 0, 1, TILE);
      // Horizontal stone ring joint seam
      const seamY = s === 0 ? 6 : 12;
      ctx.fillStyle = ramp.dark;
      ctx.fillRect(2, seamY, 12, 1);
      ctx.fillStyle = ramp.hi;
      ctx.fillRect(3, seamY + 1, 10, 1);
    }),
  );

  tiles.set(
    TileId.PillarBase,
    variants(1, (ctx) => {
      // Shaft bottom
      ctx.fillStyle = ramp.mid;
      ctx.fillRect(2, 0, 12, 6);
      ctx.fillStyle = ramp.dark;
      ctx.fillRect(2, 0, 1, 6);
      ctx.fillRect(13, 0, 1, 6);
      ctx.fillStyle = ramp.hi;
      ctx.fillRect(4, 0, 1, 6);
      // Torus moulding
      ctx.fillStyle = ramp.light;
      ctx.fillRect(1, 6, 14, 4);
      ctx.fillStyle = ramp.hi;
      ctx.fillRect(1, 6, 14, 1);
      ctx.fillStyle = ramp.dark;
      ctx.fillRect(1, 9, 14, 1);
      // Plinth base
      ctx.fillStyle = ramp.mid;
      ctx.fillRect(0, 10, TILE, 6);
      ctx.fillStyle = ramp.light;
      ctx.fillRect(0, 10, TILE, 1);
      ctx.fillStyle = ramp.dark;
      ctx.fillRect(0, 15, TILE, 1);
    }),
  );

  tiles.set(
    TileId.Cracked,
    variants(2, (ctx, s) => {
      brickBase(ctx, s + 11, ramp);
      // Jagged crack down the middle — the tell for breakable walls.
      ctx.fillStyle = "#0e0a16";
      let x = 7 + (s % 2);
      for (let y = 0; y < TILE; y++) {
        ctx.fillRect(x, y, 1, 1);
        if (y % 3 === 2) x += noise(s, y) > 0.5 ? 1 : -1;
      }
      ctx.fillRect(4, 5, 2, 1);
      ctx.fillRect(10, 10, 2, 1);
    }),
  );

  tiles.set(
    TileId.Gate,
    variants(1, (ctx) => {
      // Iron portcullis bars over the doorway background.
      ctx.fillStyle = ramp.dark;
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = zone === "tower" ? "#6a7a5e" : "#5a5a6e";
      for (let x = 2; x < TILE; x += 5) ctx.fillRect(x, 0, 2, TILE);
      ctx.fillStyle = zone === "tower" ? "#8a9a78" : "#83839a";
      for (let x = 2; x < TILE; x += 5) ctx.fillRect(x, 0, 1, TILE);
      ctx.fillStyle = zone === "tower" ? "#3a4a3c" : "#3a3a4c";
      ctx.fillRect(0, 3, TILE, 2);
      ctx.fillRect(0, 11, TILE, 2);
    }),
  );

  tiles.set(
    TileId.BgWall,
    variants(4, (ctx, s) => {
      ctx.fillStyle = ramp.dark;
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = ramp.bgMortar;
      ctx.fillRect(0, 7, TILE, 1);
      ctx.fillRect(0, 15, TILE, 1);
      const off = s % 2 === 0 ? 5 : 11;
      ctx.fillRect(off, 0, 1, 7);
      for (let i = 0; i < 3; i++) {
        const x = Math.floor(noise(s + 20, i) * 16);
        const y = Math.floor(noise(i, s + 20) * 16);
        ctx.fillStyle = ramp.bgSpeckle;
        ctx.fillRect(x, y, 1, 1);
      }
    }),
  );

  tiles.set(
    TileId.BgWindow,
    variants(10, (ctx, s) => {
      ctx.fillStyle = ramp.dark;
      ctx.fillRect(0, 0, TILE, TILE);

      if (s === 0) {
        // --- 2x3 Grand Window: Top-Left Arch ---
        // Stained glass background (matches mid panel #1c142c)
        ctx.fillStyle = "#1c142c";
        ctx.fillRect(2, 2, 14, 14);
        // Glass color patches
        ctx.fillStyle = "#781828"; // ruby
        ctx.fillRect(4, 5, 4, 11);
        ctx.fillStyle = "#283878"; // sapphire
        ctx.fillRect(9, 4, 4, 12);
        ctx.fillStyle = "#482868"; // violet
        ctx.fillRect(4, 9, 4, 7);
        // Central stone mullion (right edge, matches mid-left #14..15)
        ctx.fillStyle = ramp.light;
        ctx.fillRect(14, 2, 2, 14);
        ctx.fillStyle = ramp.hi;
        ctx.fillRect(14, 2, 1, 14);
        // Ogival stone arch curve (left-to-top)
        ctx.fillStyle = ramp.mid;
        ctx.fillRect(0, 0, 2, TILE); // left jamb
        ctx.fillRect(2, 2, 4, 3);
        ctx.fillRect(4, 1, 5, 2);
        ctx.fillRect(7, 0, 9, 2);
        ctx.fillStyle = ramp.hi;
        ctx.fillRect(8, 0, 8, 1);
        ctx.fillStyle = ramp.dark;
        ctx.fillRect(2, 4, 1, 12);
      } else if (s === 1) {
        // --- 2x3 Grand Window: Top-Right Arch ---
        // Stained glass background (matches mid panel #1c142c)
        ctx.fillStyle = "#1c142c";
        ctx.fillRect(0, 2, 14, 14);
        // Glass color patches
        ctx.fillStyle = "#283878"; // sapphire
        ctx.fillRect(3, 4, 4, 12);
        ctx.fillStyle = "#781828"; // ruby
        ctx.fillRect(8, 5, 4, 11);
        ctx.fillStyle = "#482868"; // violet
        ctx.fillRect(8, 9, 4, 7);
        // Central stone mullion (left edge, matches mid-right #0..1)
        ctx.fillStyle = ramp.light;
        ctx.fillRect(0, 2, 2, 14);
        ctx.fillStyle = ramp.hi;
        ctx.fillRect(0, 2, 1, 14);
        // Ogival stone arch curve (right-to-top)
        ctx.fillStyle = ramp.mid;
        ctx.fillRect(14, 0, 2, TILE); // right jamb
        ctx.fillRect(10, 2, 4, 3);
        ctx.fillRect(7, 1, 5, 2);
        ctx.fillRect(0, 0, 9, 2);
        ctx.fillStyle = ramp.hi;
        ctx.fillRect(0, 0, 8, 1);
        // Keystone accent
        ctx.fillRect(0, 0, 2, 3);
        ctx.fillStyle = ramp.dark;
        ctx.fillRect(13, 4, 1, 12);
      } else if (s === 2) {
        // --- 2x3 Grand Window: Mid-Left Glass ---
        ctx.fillStyle = ramp.mid;
        ctx.fillRect(0, 0, 2, TILE); // left stone jamb
        ctx.fillStyle = ramp.dark;
        ctx.fillRect(2, 0, 1, TILE);
        ctx.fillStyle = "#1c142c";
        ctx.fillRect(3, 0, 13, TILE); // glass pane
        // Stained glass patterns (ruby, violet, sapphire)
        ctx.fillStyle = "#781828";
        ctx.fillRect(4, 1, 4, 6);
        ctx.fillStyle = "#482868";
        ctx.fillRect(4, 8, 4, 7);
        ctx.fillStyle = "#283878";
        ctx.fillRect(9, 2, 4, 12);
        // Lead came grid
        ctx.fillStyle = "#100a1a";
        ctx.fillRect(3, 7, 13, 1);
        // Stone mullion edge right
        ctx.fillStyle = ramp.light;
        ctx.fillRect(14, 0, 2, TILE);
      } else if (s === 3) {
        // --- 2x3 Grand Window: Mid-Right Glass ---
        ctx.fillStyle = ramp.light;
        ctx.fillRect(0, 0, 2, TILE); // stone mullion edge left
        ctx.fillStyle = "#1c142c";
        ctx.fillRect(2, 0, 11, TILE); // glass pane
        // Stained glass patterns (ruby, sapphire, violet)
        ctx.fillStyle = "#283878";
        ctx.fillRect(3, 2, 4, 12);
        ctx.fillStyle = "#781828";
        ctx.fillRect(8, 1, 4, 6);
        ctx.fillStyle = "#482868";
        ctx.fillRect(8, 8, 4, 7);
        // Lead came grid
        ctx.fillStyle = "#100a1a";
        ctx.fillRect(2, 7, 11, 1);
        // Right stone jamb
        ctx.fillStyle = ramp.dark;
        ctx.fillRect(13, 0, 1, TILE);
        ctx.fillStyle = ramp.mid;
        ctx.fillRect(14, 0, 2, TILE);
      } else if (s === 4) {
        // --- 2x3 Grand Window: Sill-Left ---
        ctx.fillStyle = ramp.mid;
        ctx.fillRect(0, 0, 2, 8); // left jamb
        ctx.fillStyle = "#1c142c";
        ctx.fillRect(2, 0, 12, 8);
        ctx.fillStyle = "#482868";
        ctx.fillRect(4, 1, 4, 6);
        ctx.fillStyle = "#283878";
        ctx.fillRect(9, 1, 4, 6);
        ctx.fillStyle = ramp.light;
        ctx.fillRect(14, 0, 2, 8);
        // Carved stone sill base
        ctx.fillStyle = ramp.mid;
        ctx.fillRect(0, 8, TILE, 5);
        ctx.fillStyle = ramp.hi;
        ctx.fillRect(0, 8, TILE, 1);
        ctx.fillStyle = ramp.light;
        ctx.fillRect(0, 9, TILE, 1);
        ctx.fillStyle = ramp.dark;
        ctx.fillRect(0, 13, TILE, 3);
      } else if (s === 5) {
        // --- 2x3 Grand Window: Sill-Right ---
        ctx.fillStyle = ramp.light;
        ctx.fillRect(0, 0, 2, 8);
        ctx.fillStyle = "#1c142c";
        ctx.fillRect(2, 0, 12, 8);
        ctx.fillStyle = "#283878";
        ctx.fillRect(3, 1, 4, 6);
        ctx.fillStyle = "#482868";
        ctx.fillRect(8, 1, 4, 6);
        ctx.fillStyle = ramp.mid;
        ctx.fillRect(14, 0, 2, 8);
        // Carved stone sill base
        ctx.fillStyle = ramp.mid;
        ctx.fillRect(0, 8, TILE, 5);
        ctx.fillStyle = ramp.hi;
        ctx.fillRect(0, 8, TILE, 1);
        ctx.fillStyle = ramp.light;
        ctx.fillRect(0, 9, TILE, 1);
        ctx.fillStyle = ramp.dark;
        ctx.fillRect(0, 13, TILE, 3);
      } else if (s === 6) {
        // --- 1x3 Window: Top Arch ---
        ctx.fillStyle = PAL.skyBottom;
        ctx.fillRect(3, 4, 10, 12);
        ctx.fillStyle = "#362858";
        ctx.fillRect(4, 6, 8, 10);
        ctx.fillStyle = ramp.mid;
        ctx.fillRect(2, 4, 12, 2);
        ctx.fillRect(3, 2, 10, 2);
        ctx.fillRect(5, 1, 6, 1);
        ctx.fillStyle = ramp.hi;
        ctx.fillRect(6, 0, 4, 1);
        ctx.fillStyle = ramp.dark;
        ctx.fillRect(2, 4, 1, 12);
        ctx.fillRect(13, 4, 1, 12);
        ctx.fillStyle = ramp.light;
        ctx.fillRect(7, 4, 2, 12);
      } else if (s === 7) {
        // --- 1x3 Window: Mid Glass ---
        ctx.fillStyle = ramp.mid;
        ctx.fillRect(0, 0, 2, TILE);
        ctx.fillRect(14, 0, 2, TILE);
        ctx.fillStyle = ramp.dark;
        ctx.fillRect(2, 0, 1, TILE);
        ctx.fillRect(13, 0, 1, TILE);
        ctx.fillStyle = "#201838";
        ctx.fillRect(3, 0, 10, TILE);
        ctx.fillStyle = "#362858";
        ctx.fillRect(4, 1, 3, 5);
        ctx.fillStyle = "#4a3c74";
        ctx.fillRect(9, 1, 3, 5);
        ctx.fillStyle = "#2a1e48";
        ctx.fillRect(4, 8, 3, 6);
        ctx.fillStyle = "#384878";
        ctx.fillRect(9, 8, 3, 6);
        ctx.fillStyle = "#120c20";
        ctx.fillRect(3, 6, 10, 2);
        ctx.fillRect(3, 14, 10, 2);
        ctx.fillStyle = ramp.light;
        ctx.fillRect(7, 0, 2, TILE);
      } else if (s === 8) {
        // --- 1x3 Window: Sill ---
        ctx.fillStyle = "#201838";
        ctx.fillRect(3, 0, 10, 8);
        ctx.fillStyle = "#362858";
        ctx.fillRect(4, 1, 3, 6);
        ctx.fillStyle = "#4a3c74";
        ctx.fillRect(9, 1, 3, 6);
        ctx.fillStyle = ramp.light;
        ctx.fillRect(7, 0, 2, 8);
        ctx.fillStyle = ramp.mid;
        ctx.fillRect(1, 8, 14, 4);
        ctx.fillStyle = ramp.hi;
        ctx.fillRect(0, 8, TILE, 1);
        ctx.fillStyle = ramp.light;
        ctx.fillRect(0, 9, TILE, 1);
        ctx.fillStyle = ramp.dark;
        ctx.fillRect(0, 12, TILE, 4);
      } else {
        // --- Standalone 1x1 Mini Window ---
        ctx.fillStyle = PAL.skyBottom;
        ctx.fillRect(4, 4, 8, 10);
        ctx.fillStyle = "#362858";
        ctx.fillRect(5, 5, 6, 8);
        ctx.fillStyle = ramp.mid;
        ctx.fillRect(3, 3, 10, 2);
        ctx.fillRect(2, 4, 2, 10);
        ctx.fillRect(12, 4, 2, 10);
        ctx.fillStyle = ramp.hi;
        ctx.fillRect(5, 2, 6, 1);
        ctx.fillStyle = ramp.light;
        ctx.fillRect(7, 3, 2, 11);
      }
    }),
  );

  /**
   * Gothic side-door stack (3 variants used by Tilemap.draw):
   *  0 = arch crown   1 = mid passage   2 = threshold sill
   * Stone jambs match the brick ramp so the exit reads as carved stone,
   * not a black hole or outdoor sky cutout.
   */
  tiles.set(
    TileId.Door,
    variants(3, (ctx, s) => {
      // Outer stone frame (matches wall)
      ctx.fillStyle = ramp.mid;
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = ramp.dark;
      ctx.fillRect(0, 0, 1, TILE);
      ctx.fillRect(TILE - 1, 0, 1, TILE);

      // Deep passage interior
      const voidCol = "#0c0a14";
      const voidHi = "#1a1428";
      if (s === 0) {
        // --- arch crown ---
        ctx.fillStyle = voidCol;
        ctx.fillRect(3, 6, 10, 10);
        ctx.fillStyle = voidHi;
        ctx.fillRect(4, 8, 8, 8);
        // Stone arch
        ctx.fillStyle = ramp.light;
        ctx.fillRect(2, 4, 12, 3);
        ctx.fillRect(3, 2, 10, 2);
        ctx.fillRect(5, 1, 6, 1);
        ctx.fillStyle = ramp.hi;
        ctx.fillRect(6, 1, 4, 1);
        ctx.fillStyle = ramp.dark;
        ctx.fillRect(2, 4, 1, 3);
        ctx.fillRect(13, 4, 1, 3);
        // Warm glow from the next room
        ctx.fillStyle = "rgba(220, 160, 70, 0.22)";
        ctx.fillRect(6, 10, 4, 5);
      } else if (s === 1) {
        // --- mid passage ---
        ctx.fillStyle = voidCol;
        ctx.fillRect(3, 0, 10, TILE);
        ctx.fillStyle = voidHi;
        ctx.fillRect(4, 0, 8, TILE);
        // Inner jambs
        ctx.fillStyle = ramp.dark;
        ctx.fillRect(3, 0, 1, TILE);
        ctx.fillRect(12, 0, 1, TILE);
        ctx.fillStyle = ramp.light;
        ctx.fillRect(2, 0, 1, TILE);
        ctx.fillRect(13, 0, 1, TILE);
        // Candlelight from beyond
        ctx.fillStyle = "rgba(230, 170, 80, 0.28)";
        ctx.fillRect(6, 4, 4, 8);
        ctx.fillStyle = "rgba(255, 210, 120, 0.18)";
        ctx.fillRect(7, 6, 2, 4);
      } else {
        // --- threshold sill ---
        ctx.fillStyle = voidCol;
        ctx.fillRect(3, 0, 10, 10);
        ctx.fillStyle = voidHi;
        ctx.fillRect(4, 0, 8, 9);
        ctx.fillStyle = ramp.dark;
        ctx.fillRect(3, 0, 1, 10);
        ctx.fillRect(12, 0, 1, 10);
        ctx.fillStyle = ramp.light;
        ctx.fillRect(2, 0, 1, 10);
        ctx.fillRect(13, 0, 1, 10);
        // Stone sill you step over
        ctx.fillStyle = ramp.hi;
        ctx.fillRect(1, 10, 14, 3);
        ctx.fillStyle = ramp.light;
        ctx.fillRect(1, 10, 14, 1);
        ctx.fillStyle = ramp.mid;
        ctx.fillRect(0, 13, TILE, 3);
        ctx.fillStyle = ramp.dark;
        ctx.fillRect(0, 15, TILE, 1);
        // Glow just above the sill
        ctx.fillStyle = "rgba(220, 160, 70, 0.2)";
        ctx.fillRect(6, 4, 4, 5);
      }
    }),
  );

  tiles.set(
    TileId.Water,
    variants(2, (ctx, s) => {
      ctx.fillStyle = PAL.waterDeep;
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = PAL.waterMid;
      for (let i = 0; i < 6; i++) {
        const x = Math.floor(noise(s + 3, i) * 16);
        const y = Math.floor(noise(i, s + 9) * 16);
        ctx.fillRect(x, y, 2, 1);
      }
    }),
  );

  // Two surface variants; rooms pick by column for a static ripple pattern.
  tiles.set(
    TileId.WaterTop,
    variants(2, (ctx, s) => {
      ctx.fillStyle = PAL.waterDeep;
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = PAL.waterMid;
      ctx.fillRect(0, 4, TILE, TILE - 4);
      ctx.fillStyle = PAL.waterHi;
      ctx.fillRect(0, 0, TILE, 2);
      // Alternating crest for the two seeds.
      const phase = s % 2 === 0 ? 0 : 4;
      for (let x = phase; x < TILE; x += 8) {
        ctx.fillRect(x, 2, 3, 1);
        ctx.fillRect(x + 1, 3, 1, 1);
      }
      ctx.fillStyle = "rgba(160, 220, 240, 0.35)";
      ctx.fillRect(2 + (s % 2) * 3, 1, 2, 1);
    }),
  );

  return tiles;
}

/**
 * Override key slug per tile role. The tileset is semantic, not autotile —
 * a sheet named `tile.castle.floorTop` is a horizontal strip of TILE×TILE
 * variants, one frame per variant.
 */
const TILE_SLUG: Record<TileId, string> = {
  [TileId.Empty]: "empty",
  [TileId.Brick]: "brick",
  [TileId.FloorTop]: "floorTop",
  [TileId.Platform]: "platform",
  [TileId.PillarTop]: "pillarTop",
  [TileId.Pillar]: "pillar",
  [TileId.PillarBase]: "pillarBase",
  [TileId.BgWall]: "bgWall",
  [TileId.BgWindow]: "bgWindow",
  [TileId.Cracked]: "cracked",
  [TileId.Gate]: "gate",
  [TileId.Water]: "water",
  [TileId.WaterTop]: "waterTop",
  [TileId.Door]: "door",
};

/**
 * Procedural tileset with per-tile overrides from the asset manifest.
 * A missing or empty sheet keeps the generated tile.
 */
export function resolveTileset(zone: ZoneId = "castle"): Map<TileId, HTMLCanvasElement[]> {
  const tiles = buildTileset(zone);
  for (const id of tiles.keys()) {
    const sheet = getSheet(`tile.${zone}.${TILE_SLUG[id]}`);
    if (sheet && sheet.length > 0) tiles.set(id, sheet);
  }
  return tiles;
}
