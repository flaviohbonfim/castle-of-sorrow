import { makeSurface } from "../engine/renderer";
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
      ctx.fillStyle = ramp.light;
      ctx.fillRect(0, 0, TILE, 3);
      ctx.fillStyle = ramp.hi;
      ctx.fillRect(0, 0, TILE, 1);
      ctx.fillStyle = ramp.dark;
      ctx.fillRect(0, 3, TILE, 2);
      ctx.fillStyle = ramp.mid;
      ctx.fillRect(2, 5, 2, 2);
      ctx.fillRect(12, 5, 2, 2);
    }),
  );

  tiles.set(
    TileId.PillarTop,
    variants(1, (ctx) => {
      ctx.fillStyle = ramp.light;
      ctx.fillRect(0, 4, TILE, 4);
      ctx.fillStyle = ramp.hi;
      ctx.fillRect(0, 4, TILE, 1);
      ctx.fillStyle = ramp.mid;
      ctx.fillRect(2, 8, 12, 8);
      ctx.fillStyle = ramp.dark;
      ctx.fillRect(2, 8, 1, 8);
      ctx.fillRect(13, 8, 1, 8);
    }),
  );

  tiles.set(
    TileId.Pillar,
    variants(2, (ctx, s) => {
      ctx.fillStyle = ramp.mid;
      ctx.fillRect(2, 0, 12, TILE);
      ctx.fillStyle = ramp.dark;
      ctx.fillRect(2, 0, 1, TILE);
      ctx.fillRect(13, 0, 1, TILE);
      ctx.fillStyle = ramp.light;
      ctx.fillRect(4, 0, 1, TILE);
      ctx.fillStyle = ramp.dark;
      ctx.fillRect(3, s === 0 ? 5 : 11, 10, 1);
    }),
  );

  tiles.set(
    TileId.PillarBase,
    variants(1, (ctx) => {
      ctx.fillStyle = ramp.mid;
      ctx.fillRect(2, 0, 12, 8);
      ctx.fillStyle = ramp.light;
      ctx.fillRect(0, 8, TILE, 8);
      ctx.fillStyle = ramp.hi;
      ctx.fillRect(0, 8, TILE, 1);
      ctx.fillStyle = ramp.dark;
      ctx.fillRect(2, 0, 1, 8);
      ctx.fillRect(13, 0, 1, 8);
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
    variants(1, (ctx) => {
      ctx.fillStyle = ramp.dark;
      ctx.fillRect(0, 0, TILE, TILE);
      // Arched moonlit window
      ctx.fillStyle = PAL.skyBottom;
      ctx.fillRect(4, 4, 8, 12);
      ctx.fillRect(5, 2, 6, 2);
      ctx.fillStyle = "#4a3d70";
      ctx.fillRect(5, 3, 6, 1);
      ctx.fillRect(5, 5, 6, 1);
      ctx.fillStyle = ramp.mid;
      ctx.fillRect(7, 2, 1, 14); // mullion
      ctx.fillStyle = ramp.light;
      ctx.fillRect(3, 4, 1, 12);
      ctx.fillRect(12, 4, 1, 12);
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
