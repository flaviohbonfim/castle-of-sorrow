import { TILE, TileId, type ZoneId } from "../gfx/tiles";
import {
  THRONE_FLOOR_Y,
  THRONE_GLASS_CENTERS,
  THRONE_PIER_XS,
} from "../gfx/throneLayout";
import {
  CAVERN,
  FLOODED,
  GALLERY,
  GRAND,
  HALL,
  SHAFT,
  leftEntry,
  rightEntry,
  sideDoorBand,
} from "./castlePlan";
import { Tilemap } from "./tilemap";

export interface Spawn {
  kind:
    | "player"
    | "skeleton"
    | "bat"
    | "fishman"
    | "axeKnight"
    | "zombie"
    | "spearGuard"
    | "fleaMan"
    | "medusaSpawner"
    | "candle"
    | "relic"
    | "item"
    | "warp"
    | "save"
    | "shopkeeper"
    | "npc"
    | "boss"
    | "prop";
  x: number; // world px
  y: number; // feet/bottom for grounded, center for flyers
  id?: string; // relic id, item id, boss id, prop id, or item flag key
  n?: number; // item pickup index within the room (for flags)
  dir?: 1 | -1; // medusa spawner flight direction / prop facing
}

export interface RoomExit {
  side: "left" | "right" | "top" | "bottom";
  /** px range on the perpendicular axis (y for left/right, x for top/bottom) */
  min: number;
  max: number;
  target: string;
  tx: number; // entry position in target room (feet)
  ty: number;
}

export interface BuiltRoom {
  map: Tilemap;
  spawns: Spawn[];
}

export interface BossRoomConfig {
  id: string;
  gateCells: [number, number][];
  rewards: { relic: string; x: number; y: number }[];
}

export interface RoomDef {
  id: string;
  name: string;
  exits: RoomExit[];
  /** Minimap footprint in map-grid cells (may use negative gy for upper wings). */
  mapRect: { gx: number; gy: number; gw: number; gh: number };
  zone?: ZoneId;
  boss?: BossRoomConfig;
  build(): BuiltRoom;
}

/** Ordered warp pad cycle — each pad sends you to the next room in the list. */
export const WARP_CYCLE: string[] = ["corridor", "cavern", "towerHall"];

/** Pad feet positions per room that participates in WARP_CYCLE. */
export const WARP_PADS: Record<string, { x: number; y: number }> = {
  corridor: { x: 88, y: GALLERY.floorY }, // at("warp", 5, 10)
  cavern: { x: 360, y: CAVERN.floorY }, // at("warp", 22, 15)
  towerHall: { x: 168, y: GALLERY.floorY }, // at("warp", 10, 10)
};

/** Next warp destination from the pad in `fromRoom`. */
export function nextWarp(fromRoom: string): { room: string; x: number; y: number } | null {
  const i = WARP_CYCLE.indexOf(fromRoom);
  if (i < 0) return null;
  for (let step = 1; step <= WARP_CYCLE.length; step++) {
    const room = WARP_CYCLE[(i + step) % WARP_CYCLE.length];
    const pad = WARP_PADS[room];
    if (pad) return { room, x: pad.x, y: pad.y };
  }
  return null;
}

/* ------------------------------ builder ------------------------------ */

class RoomBuilder {
  readonly tiles: Uint8Array;
  readonly spawns: Spawn[] = [];

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly zone: ZoneId = "castle",
  ) {
    this.tiles = new Uint8Array(cols * rows);
  }

  set(c: number, r: number, id: TileId): void {
    if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) this.tiles[r * this.cols + c] = id;
  }

  hline(r: number, c0: number, c1: number, id: TileId): void {
    for (let c = c0; c <= c1; c++) this.set(c, r, id);
  }

  fill(c0: number, r0: number, c1: number, r1: number, id: TileId): void {
    for (let r = r0; r <= r1; r++) this.hline(r, c0, c1, id);
  }

  /** Border walls + interior background. */
  frame(): void {
    this.fill(1, 1, this.cols - 2, this.rows - 2, TileId.BgWall);
    this.hline(0, 0, this.cols - 1, TileId.Brick);
    this.hline(this.rows - 1, 0, this.cols - 1, TileId.Brick);
    for (let r = 0; r < this.rows; r++) {
      this.set(0, r, TileId.Brick);
      this.set(this.cols - 1, r, TileId.Brick);
    }
  }

  windows(row: number, from: number, to: number, step: number): void {
    for (let c = from; c <= to; c += step) this.set(c, row, TileId.BgWindow);
  }

  /** Place a 2-tile wide x 3-tile tall (32x48px) grand gothic stained-glass window. */
  window2x3(c0: number, r0: number): void {
    for (let r = r0; r < r0 + 3; r++) {
      for (let c = c0; c < c0 + 2; c++) {
        this.set(c, r, TileId.BgWindow);
      }
    }
  }

  /** Place a row of grand 2x3 (32x48px) gothic windows across a room. */
  grandWindows(r0: number, from: number, to: number, step: number): void {
    for (let c = from; c <= to; c += step) {
      this.window2x3(c, r0);
    }
  }

  /** Solid decorative pillar: top at `rTop`, base sits at `rTop + 2`. */
  pillar(c: number, rTop: number): void {
    this.set(c, rTop, TileId.PillarTop);
    this.set(c, rTop + 1, TileId.Pillar);
    this.set(c, rTop + 2, TileId.PillarBase);
  }

  /** Punch a true hole (ceiling/floor shafts) — shows through to parallax. */
  punch(c: number, r0: number, r1: number): void {
    for (let r = r0; r <= r1; r++) this.set(c, r, TileId.Empty);
  }

  /** Horizontal hole across a ceiling/floor row (shaft mouth). */
  hpunch(r: number, c0: number, c1: number): void {
    for (let c = c0; c <= c1; c++) this.set(c, r, TileId.Empty);
  }

  /**
   * Side-wall doorway (gothic arch stack). Tilemap picks arch/mid/sill art
   * from vertical neighbors so a 3-cell door reads as one passage.
   */
  door(c: number, r0: number, r1: number): void {
    for (let r = r0; r <= r1; r++) this.set(c, r, TileId.Door);
    // Stone cap above the arch so it doesn't sit under flat brick only.
    if (r0 > 0 && this.tiles[(r0 - 1) * this.cols + c] === TileId.Brick) {
      this.set(c, r0 - 1, TileId.FloorTop);
    }
  }

  /** Spawn marker: cell coords, y resolves to the surface below the cell. */
  at(kind: Spawn["kind"], c: number, r: number, id?: string): void {
    this.spawns.push({ kind, x: c * TILE + TILE / 2, y: (r + 1) * TILE, id });
  }

  build(): BuiltRoom {
    return {
      map: new Tilemap(this.cols, this.rows, this.tiles, this.zone),
      spawns: this.spawns,
    };
  }
}

/* ------------------------------- rooms ------------------------------- */

function buildEntrance(): BuiltRoom {
  const b = new RoomBuilder(64, GRAND.rows);
  b.frame();
  b.grandWindows(3, 7, 55, 10);

  // Main floor + solid underlay (GRAND datum).
  b.hline(GRAND.floorRow, 1, 62, TileId.FloorTop);
  b.fill(1, GRAND.floorRow + 1, 62, 22, TileId.Brick);
  // Right raised step — solid brick column under it (no floating FloorTop strip).
  // East door sits on this step (floorY 288); drops into corridor GALLERY (176).
  b.hline(18, 55, 62, TileId.FloorTop);
  b.fill(55, 19, 62, 22, TileId.Brick);

  // One-way platform climb.
  b.hline(17, 18, 24, TileId.Platform);
  b.hline(17, 40, 46, TileId.Platform);
  b.hline(14, 26, 33, TileId.Platform);
  b.hline(14, 48, 54, TileId.Platform);
  b.hline(11, 18, 24, TileId.Platform);
  b.hline(11, 36, 42, TileId.Platform);

  b.pillar(12, 17);
  // Pillar kept clear of cols 49–51 so the cavern shaft has a real landing
  // ledge left of the pit (the old col-50 pillar swallowed the return spawn).
  b.pillar(48, 17);

  // Doorway to the Marble Gallery (above the right step).
  b.door(63, 15, 17);
  // West door → Forsaken Chapel
  b.door(0, 17, 19);

  // Pit to Underground Cavern (RIGHT side). Walls lined with BgWall so the
  // shaft doesn't read as broken floor / outdoor sky under the right step.
  for (let c = 52; c <= 54; c++) {
    b.set(c, 20, TileId.Empty);
    for (let r = 21; r <= 23; r++) b.set(c, r, TileId.Empty);
  }
  // Pit side walls (inner faces of the lips)
  for (let r = 20; r <= 22; r++) {
    b.set(51, r, TileId.Brick);
    b.set(55, r, TileId.Brick);
  }
  // Keep a solid lip left of the pit to stand on after a return jump.
  b.set(51, 20, TileId.FloorTop);
  b.set(55, 20, TileId.Brick);

  b.at("player", 3, 19);
  b.at("zombie", 22, 19);
  b.at("skeleton", 28, 19);
  b.at("zombie", 38, 19);
  b.at("skeleton", 43, 19);
  b.at("skeleton", 60, 17);
  b.at("fleaMan", 30, 13);
  b.spawns.push({ kind: "bat", x: 16 * TILE, y: 8 * TILE });
  b.spawns.push({ kind: "bat", x: 34 * TILE, y: 7 * TILE });
  // Wall/pillar-mounted — none standing on the floor or a platform.
  b.at("candle", 12, 18); // pillar mid-shaft
  b.at("candle", 48, 18); // pillar mid-shaft
  b.at("candle", 7, 5);
  b.at("candle", 15, 9);
  b.at("candle", 23, 5);
  b.at("candle", 31, 9);
  b.at("candle", 39, 5);
  b.at("candle", 47, 9);
  b.at("candle", 55, 5);
  b.at("candle", 21, 13);
  b.at("candle", 43, 13);
  return b.build();
}

function buildCorridor(): BuiltRoom {
  const b = new RoomBuilder(48, GALLERY.rows);
  b.frame();
  b.grandWindows(3, 7, 37, 10);
  b.hline(GALLERY.floorRow, 1, 46, TileId.FloorTop);
  b.fill(1, GALLERY.floorRow + 1, 46, GALLERY.floorRow + 1, TileId.Brick);
  b.pillar(13, 8);
  b.pillar(27, 8);
  b.pillar(41, 8);

  b.door(0, GALLERY.doorRow0, GALLERY.doorRow1); // to Entrance
  b.door(47, GALLERY.doorRow0, GALLERY.doorRow1); // to library

  // Double-jump shaft up to the Clock Tower (ceiling hole + climb platforms).
  b.hline(7, 22, 27, TileId.Platform);
  b.hline(4, 22, 27, TileId.Platform);
  for (let c = 23; c <= 26; c++) {
    b.set(c, 0, TileId.Empty);
  }

  b.at("warp", 5, 10);
  b.at("npc", 38, 10, "ghost"); // Pale Knight — double-jump hint
  b.at("candle", 13, 9); // pillar mid-shaft
  b.at("candle", 27, 9); // pillar mid-shaft
  b.at("candle", 41, 9); // pillar mid-shaft
  b.at("candle", 31, 5);
  b.at("spearGuard", 20, 10);
  b.at("skeleton", 32, 10);
  b.at("fleaMan", 25, 6);
  return b.build();
}

function buildChapel(): BuiltRoom {
  const b = new RoomBuilder(28, HALL.rows);
  b.frame();
  b.grandWindows(3, 5, 21, 8);
  b.hline(HALL.floorRow, 1, 26, TileId.FloorTop);
  b.fill(1, HALL.floorRow + 1, 26, HALL.floorRow + 1, TileId.Brick);
  b.pillar(6, 10);
  b.pillar(21, 10);
  // Raised altar ledge
  b.hline(11, 10, 17, TileId.Platform);
  b.door(27, HALL.doorRow0, HALL.doorRow1); // back to entrance
  b.at("spearGuard", 14, HALL.floorRow - 1);
  b.at("zombie", 8, HALL.floorRow - 1);
  b.at("zombie", 20, HALL.floorRow - 1);
  b.at("candle", 6, 11); // pillar mid-shaft
  b.at("candle", 21, 11); // pillar mid-shaft
  b.at("candle", 11, 6);
  b.at("candle", 17, 6);
  return b.build();
}

function buildLibrary(): BuiltRoom {
  const b = new RoomBuilder(32, GALLERY.rows);
  b.frame();
  b.grandWindows(3, 5, 23, 9);
  b.hline(GALLERY.floorRow, 1, 30, TileId.FloorTop);
  b.fill(1, GALLERY.floorRow + 1, 30, GALLERY.floorRow + 1, TileId.Brick);
  b.hline(8, 8, 14, TileId.Platform);
  b.hline(8, 18, 24, TileId.Platform);
  b.pillar(10, 8);
  b.pillar(22, 8);
  b.door(0, GALLERY.doorRow0, GALLERY.doorRow1); // from corridor
  b.door(31, GALLERY.doorRow0, GALLERY.doorRow1); // to sanctuary
  b.at("axeKnight", 16, GALLERY.floorRow - 1);
  b.at("skeleton", 8, GALLERY.floorRow - 1);
  b.at("fleaMan", 20, 7);
  b.at("candle", 10, 9); // pillar mid-shaft
  b.at("candle", 22, 9); // pillar mid-shaft
  b.at("candle", 6, 6);
  b.at("candle", 26, 6);
  return b.build();
}

function buildApproach(): BuiltRoom {
  const b = new RoomBuilder(36, GALLERY.rows, "tower");
  b.frame();
  b.grandWindows(3, 5, 29, 8);
  b.hline(GALLERY.floorRow, 1, 34, TileId.FloorTop);
  b.fill(1, GALLERY.floorRow + 1, 34, GALLERY.floorRow + 1, TileId.Brick);
  b.hline(8, 10, 16, TileId.Platform);
  b.hline(8, 20, 26, TileId.Platform);
  b.pillar(8, 8);
  b.pillar(27, 8);
  b.door(0, GALLERY.doorRow0, GALLERY.doorRow1); // from towerTop
  b.door(35, GALLERY.doorRow0, GALLERY.doorRow1); // to sovereign hall
  b.at("spearGuard", 14, GALLERY.floorRow - 1);
  b.at("spearGuard", 24, GALLERY.floorRow - 1);
  b.at("axeKnight", 18, GALLERY.floorRow - 1);
  // Form skill relics (separate from the transformation unlocks)
  b.at("relic", 12, 7, "batFire");
  b.at("relic", 22, 7, "wolfDash");
  b.at("candle", 8, 9); // pillar mid-shaft
  b.at("candle", 27, 9); // pillar mid-shaft
  b.at("candle", 14, 5);
  b.at("candle", 24, 5);
  return b.build();
}

function buildCatacombs(): BuiltRoom {
  const b = new RoomBuilder(40, HALL.rows);
  b.frame();
  b.hline(HALL.floorRow, 1, 38, TileId.FloorTop);
  b.fill(1, HALL.floorRow + 1, 38, HALL.floorRow + 1, TileId.Brick);
  b.hline(10, 6, 12, TileId.Platform);
  b.hline(10, 18, 24, TileId.Platform);
  b.hline(7, 28, 34, TileId.Platform);
  b.pillar(10, 10);
  b.pillar(22, 10);
  b.pillar(32, 10);
  b.door(0, HALL.doorRow0, HALL.doorRow1); // from lakeDepths
  b.at("zombie", 8, HALL.floorRow - 1);
  b.at("zombie", 14, HALL.floorRow - 1);
  b.at("zombie", 20, HALL.floorRow - 1);
  b.at("skeleton", 28, HALL.floorRow - 1);
  b.at("fleaMan", 20, 9);
  b.at("fleaMan", 30, 6);
  b.at("candle", 10, 11); // pillar mid-shaft
  b.at("candle", 22, 11); // pillar mid-shaft
  b.at("candle", 32, 11); // pillar mid-shaft
  b.at("candle", 5, 6);
  return b.build();
}

/**
 * Tall vertical shaft — staggered one-way platforms + medusa pressure.
 * Bottom hole returns to the Marble Gallery; open center shaft + wide
 * ceiling hole exits to Gear Gallery. Platforms are one-way so ↓+Jump
 * drops through on the way back down.
 */
function buildTowerShaft(): BuiltRoom {
  const b = new RoomBuilder(16, SHAFT.rows, "tower");
  b.frame();

  // --- bottom landing with a real hole through the floor (cols 6–9) ---
  b.hline(SHAFT.floorRow, 1, 14, TileId.FloorTop);
  b.fill(1, SHAFT.floorRow + 1, 14, SHAFT.floorRow + 1, TileId.Brick);
  for (let c = 6; c <= 9; c++) {
    b.set(c, SHAFT.floorRow, TileId.Empty);
    b.set(c, SHAFT.floorRow + 1, TileId.Empty);
    b.set(c, SHAFT.floorRow + 2, TileId.Empty);
  }

  // --- staggered one-way ladder (~3 tiles / 48px — single-jump friendly) ---
  b.hline(34, 2, 6, TileId.Platform);
  b.hline(31, 9, 13, TileId.Platform);
  b.hline(28, 2, 6, TileId.Platform);
  b.hline(25, 9, 13, TileId.Platform);
  b.hline(22, 2, 6, TileId.Platform);
  b.hline(19, 9, 13, TileId.Platform);
  b.hline(16, 2, 6, TileId.Platform);
  b.hline(13, 9, 13, TileId.Platform);
  b.hline(10, 2, 6, TileId.Platform);
  b.hline(7, 9, 13, TileId.Platform);

  // --- top: side ledges + open center under a wide ceiling hatch ---
  // Clear the upper cells so the jump path is unobstructed.
  b.fill(1, 1, 14, 4, TileId.Empty);
  // Side ledges to stand on (center cols 5–10 stay open for the exit jump).
  b.hline(4, 1, 4, TileId.FloorTop);
  b.hline(4, 11, 14, TileId.FloorTop);
  // Intermediate platform under the hatch (one-way: drop back if you miss).
  b.hline(5, 5, 10, TileId.Platform);
  // Wide ceiling hole → towerHall
  for (let c = 4; c <= 11; c++) {
    b.set(c, 0, TileId.Empty);
  }

  // Medusa spawners at mid height, both sides.
  b.spawns.push({ kind: "medusaSpawner", x: 8, y: 20 * TILE, dir: 1 });
  b.spawns.push({ kind: "medusaSpawner", x: 16 * TILE - 8, y: 14 * TILE, dir: -1 });
  b.spawns.push({ kind: "medusaSpawner", x: 8, y: 28 * TILE, dir: 1 });

  b.at("candle", 3, 30); // was resting on the bottom floor — wall-mounted now
  b.at("candle", 12, 33);
  b.at("candle", 4, 21);
  b.at("candle", 11, 12);
  return b.build();
}

/** Mid tower hall with gears, axe knights, warp pad. GALLERY datum (176). */
function buildTowerHall(): BuiltRoom {
  const b = new RoomBuilder(40, GALLERY.rows, "tower");
  b.frame();
  b.grandWindows(3, 14, 34, 10);
  b.hline(GALLERY.floorRow, 1, 38, TileId.FloorTop);
  b.fill(1, GALLERY.floorRow + 1, 38, GALLERY.floorRow + 1, TileId.Brick);
  b.pillar(8, 8);
  b.pillar(20, 8);
  b.pillar(32, 8);
  // Decorative "gear" platforms
  b.hline(8, 12, 16, TileId.Platform);
  b.hline(7, 24, 28, TileId.Platform);
  b.hline(5, 18, 22, TileId.Platform);

  // Floor hole down to shaft (must cut through FloorTop + subfloor).
  for (let c = 4; c <= 7; c++) {
    b.set(c, GALLERY.floorRow, TileId.Empty);
    b.set(c, GALLERY.floorRow + 1, TileId.Empty);
    b.set(c, GALLERY.floorRow + 2, TileId.Empty);
  }
  b.door(39, GALLERY.doorRow0, GALLERY.doorRow1); // to towerTop boss

  // Warp sits on solid floor to the right of the hole.
  b.at("warp", 10, GALLERY.floorRow - 1);
  b.at("npc", 22, GALLERY.floorRow - 1, "demon"); // Caged Imp — wraith / high-jump hint
  b.at("axeKnight", 14, GALLERY.floorRow - 1);
  b.at("axeKnight", 30, GALLERY.floorRow - 1);
  b.at("candle", 8, 9); // pillar mid-shaft
  b.at("candle", 20, 9); // pillar mid-shaft
  b.at("candle", 32, 9); // pillar mid-shaft
  b.at("candle", 14, 3);
  return b.build();
}

/** Clock Tower summit — Wraith boss arena. */
function buildTowerTop(): BuiltRoom {
  const b = new RoomBuilder(32, GALLERY.rows, "tower");
  b.frame();
  b.grandWindows(3, 10, 22, 12);
  b.hline(GALLERY.floorRow, 1, 30, TileId.FloorTop);
  b.fill(1, GALLERY.floorRow + 1, 30, GALLERY.floorRow + 1, TileId.Brick);
  b.pillar(5, 8);
  b.pillar(26, 8);
  b.door(0, GALLERY.doorRow0, GALLERY.doorRow1); // from towerHall
  // Right wall sealed as Gate by default; Game opens it when throne is unlocked.
  for (let r = GALLERY.doorRow0; r <= GALLERY.doorRow1; r++) b.set(31, r, TileId.Gate);
  b.at("boss", 20, GALLERY.floorRow - 1, "wraith");
  b.at("candle", 5, 9); // pillar mid-shaft
  b.at("candle", 26, 9); // pillar mid-shaft
  return b.build();
}

/**
 * Throne of Night — final boss arena.
 *
 * Layout goals:
 *  - wide flat combat floor + short dais
 *  - Strategy C backdrop owns wall art (arches, curtains, windows)
 *  - tilemap = solids only (floor / brick / door) — no stubby tile pillars
 *    (they fought the painted architecture)
 *  - props aligned to the hall rhythm: chandeliers under ceilings between
 *    bays; banners only on plain stone piers (not over glass/curtains)
 */
function buildThrone(): BuiltRoom {
  const b = new RoomBuilder(48, HALL.rows, "tower");
  b.frame();

  // Main fight floor — almost the whole hall is flat (HALL datum / throneLayout).
  b.hline(HALL.floorRow, 1, 46, TileId.FloorTop);
  b.fill(1, HALL.floorRow + 1, 46, HALL.floorRow + 1, TileId.Brick);

  // Single-step dais at the far right (throne feel, not a climb puzzle).
  b.hline(12, 38, 46, TileId.FloorTop);
  b.fill(38, 13, 46, 13, TileId.Brick);

  // No BgWindow / pillar tiles: backdrop paints openings; open floor for the
  // final fight. Door still needed for exit geometry.
  b.door(0, HALL.doorRow0, HALL.doorRow1);
  // Boss on the main floor, mid-right — clear of the dais lip.
  b.at("boss", 34, HALL.floorRow - 1, "dracula");

  // --- Scenery props (draw-only) ---
  // All positions come from the authored layout in gfx/throneLayout.ts —
  // the backdrop art is generated to match those constants (design-first),
  // so props and painted architecture agree by construction.
  //
  // Pier 4 (x 592) stands on the main floor before the dais step (x 608),
  // not on the raised surface.
  //
  // Throne on the dais, facing the entrance.
  b.spawns.push({
    kind: "prop",
    x: 43 * TILE + TILE / 2,
    y: 12 * TILE,
    id: "throne",
    dir: -1,
  });

  // Full-height column props on the stone piers (not tile stubs). All four
  // stand on the main floor — see pier 4 note above.
  const floorY = THRONE_FLOOR_Y; // feet on FloorTop row 13
  const pierXs = THRONE_PIER_XS;
  for (const x of pierXs) {
    b.spawns.push({ kind: "prop", x, y: floorY, id: "column" });
  }

  // Banners: hang on the pier face, HIGH so cloth sits on stone under the
  // arch spring — not mid-glass / mid-curtain.
  // Banner sprite ~48px tall; feet y ≈ 7.5*TILE puts top near arch line.
  const bannerY = 7 * TILE + 8;
  // Small inset from the pier center so cloth reads as draped in front of
  // the shaft rather than pasted dead-center on it.
  b.spawns.push({ kind: "prop", x: pierXs[0] + 4, y: bannerY, id: "banner" });
  b.spawns.push({ kind: "prop", x: pierXs[1] - 4, y: bannerY, id: "banner" });
  b.spawns.push({ kind: "prop", x: pierXs[2] + 4, y: bannerY, id: "banner", dir: -1 });
  // No banner on the dais pier — throne + curtain bay already fill that side.

  // Chandeliers: high, centered in the stained-glass bays (not curtain bays).
  const chY = 3 * TILE + 4;
  for (const x of THRONE_GLASS_CENTERS) {
    b.spawns.push({ kind: "prop", x, y: chY, id: "chandelier" });
  }

  // Candles mounted mid-shaft on each column, not on the floor — floor-level
  // candles read as generic corridor clutter next to hand-drawn scenery.
  // Same breakable Candle (still drops a heart), just relocated onto the
  // pier; candles draw after props so they render in front of the shaft.
  // One per column (4, down from 6 on the floor) — same landmarks the
  // banners/chandeliers use, so the room reads as one composition.
  // NOTE: at this height the up-attack's starting dagger (reach 26) may not
  // reach it — measured the swing topping out ~38px above the floor. Left
  // here per direct request; if the weakest weapon can't hit these in
  // practice, the fix is lowering candleY, not the art.
  const candleY = floorY - 50;
  for (const x of pierXs) {
    b.spawns.push({ kind: "candle", x, y: candleY });
  }
  return b.build();
}

/** Sovereign rematch arena — between Approach and Throne (boss kept, not removed). */
function buildSovereignHall(): BuiltRoom {
  const b = new RoomBuilder(40, GALLERY.rows, "tower");
  b.frame();
  b.hline(GALLERY.floorRow, 1, 38, TileId.FloorTop);
  b.fill(1, GALLERY.floorRow + 1, 38, GALLERY.floorRow + 1, TileId.Brick);
  b.pillar(8, 8);
  b.pillar(31, 8);
  b.door(0, GALLERY.doorRow0, GALLERY.doorRow1); // from approach
  b.door(39, GALLERY.doorRow0, GALLERY.doorRow1); // to throne (sealed as Gate while boss lives)
  b.at("boss", 22, GALLERY.floorRow - 1, "sovereign");
  b.at("candle", 8, 9); // pillar mid-shaft
  b.at("candle", 31, 9); // pillar mid-shaft
  b.at("candle", 14, 6);
  b.at("candle", 26, 6);
  return b.build();
}

/** Sanctuary — GALLERY datum so the library door is continuous. */
function buildSaveRoom(): BuiltRoom {
  const b = new RoomBuilder(20, GALLERY.rows);
  b.frame();
  b.window2x3(5, 3);
  b.hline(GALLERY.floorRow, 1, 18, TileId.FloorTop);
  b.fill(1, GALLERY.floorRow + 1, 18, GALLERY.floorRow + 1, TileId.Brick);

  b.door(0, GALLERY.doorRow0, GALLERY.doorRow1); // to library

  // Secret alcove behind a breakable wall, hiding the double-jump relic.
  for (let r = GALLERY.doorRow0; r <= GALLERY.doorRow1; r++) b.set(12, r, TileId.Cracked);

  b.at("save", 6, GALLERY.floorRow - 1);
  b.at("candle", 9, 5); // no pillars in this room — wall-mounted
  b.at("relic", 15, GALLERY.floorRow - 1, "doubleJump");
  return b.build();
}

/**
 * Underground Cavern — under Entrance (vertical shaft) and right of Lake.
 *
 * Exactly THREE neighbors (one link each — no duplicate doors/holes):
 *  - UP    ceiling shaft ↔ Entrance floor pit
 *  - LEFT  door ↔ Lake right door
 *  - RIGHT door ↔ Hermit's Den
 */
function buildCavern(): BuiltRoom {
  const b = new RoomBuilder(48, CAVERN.rows);
  b.frame();
  b.hline(CAVERN.floorRow, 1, 46, TileId.FloorTop);
  b.fill(1, CAVERN.floorRow + 1, 46, 18, TileId.Brick);
  b.pillar(12, 13);
  b.pillar(28, 13);
  b.door(47, CAVERN.doorRow0, CAVERN.doorRow1); // right → shop
  b.door(0, CAVERN.doorRow0, CAVERN.doorRow1); // left → lake (ONLY link to lake)

  // Ceiling shaft ↔ Entrance (right side of room, under entrance pit).
  for (let c = 40; c <= 43; c++) {
    b.set(c, 0, TileId.Empty);
    b.set(c, 1, TileId.Empty);
    b.set(c, 2, TileId.Empty);
  }
  b.hline(3, 40, 43, TileId.Platform);
  b.hline(5, 36, 39, TileId.Platform);
  b.hline(5, 44, 46, TileId.Platform);
  b.hline(8, 38, 45, TileId.Platform);
  b.hline(11, 36, 42, TileId.Platform);
  b.hline(13, 40, 46, TileId.Platform);

  // Mid platforms for combat / traversal across the hall.
  b.hline(13, 18, 26, TileId.Platform);
  b.hline(10, 10, 16, TileId.Platform);

  // Solid floor everywhere — no pit to lake (that was a second link).
  b.at("warp", 22, 15);
  b.at("skeleton", 18, 15);
  b.at("skeleton", 34, 15);
  b.spawns.push({ kind: "bat", x: 20 * TILE, y: 10 * TILE });
  b.spawns.push({ kind: "bat", x: 32 * TILE, y: 8 * TILE });
  b.at("candle", 12, 14); // pillar mid-shaft
  b.at("candle", 28, 14); // pillar mid-shaft
  b.at("candle", 18, 6);
  b.at("candle", 34, 4);
  return b.build();
}

/**
 * Sunken Gallery — flooded wing LEFT of the cavern (same map band).
 *
 * Exactly TWO neighbors:
 *  - RIGHT  door       ↔ cavern left door
 *  - BOTTOM water pit  ↔ lakeDepths ceiling (the depths sit BELOW on the map)
 */
function buildLake(): BuiltRoom {
  const b = new RoomBuilder(48, FLOODED.rows);
  b.frame();

  const surface = 9;
  b.hline(surface, 1, 46, TileId.WaterTop);
  b.fill(1, surface + 1, 46, 15, TileId.Water);
  b.hline(FLOODED.floorRow, 1, 46, TileId.FloorTop);

  // Upper dry ledges
  b.hline(4, 6, 16, TileId.Platform);
  b.hline(4, 24, 36, TileId.Platform);
  b.hline(6, 16, 28, TileId.Platform);

  // Left dry pedestal for Mermaid Statue.
  b.fill(2, surface, 7, 12, TileId.Empty);
  b.hline(13, 2, 7, TileId.FloorTop);
  b.fill(2, 14, 7, 15, TileId.Brick);
  for (let r = 10; r <= 13; r++) b.set(8, r, TileId.Cracked);

  // Submerged shelves
  b.hline(13, 18, 24, TileId.Platform);
  b.hline(12, 30, 36, TileId.Platform);

  // Right dry landing for the door into cavern (no ceiling hole).
  b.fill(40, surface, 46, 12, TileId.Empty);
  b.hline(13, 40, 46, TileId.FloorTop);
  b.fill(40, 14, 46, 15, TileId.Brick);
  b.hline(11, 38, 42, TileId.Platform);

  b.door(47, HALL.doorRow0, HALL.doorRow1); // right → cavern (dry landing = HALL)

  // Dive shaft down to the Sunken Depths — flooded so it reads as deep water
  // continuing below, not a hole onto the sky. Clear of both stone shelves.
  for (let c = 26; c <= 29; c++) {
    b.set(c, FLOODED.floorRow, TileId.Water);
    b.set(c, FLOODED.floorRow + 1, TileId.Water);
  }

  b.at("relic", 4, 12, "waterWalk");
  b.at("fishman", 16, 15);
  b.at("fishman", 28, 15);
  b.at("fishman", 36, 15);
  // No pillars in this room — wall-mounted, high on the back wall or in the
  // dry pockets (not standing on the upper ledges or the submerged shelves).
  b.at("candle", 10, 1);
  b.at("candle", 30, 1);
  b.at("candle", 43, 9);
  b.at("candle", 4, 9);
  return b.build();
}

/** Fully flooded lower depths with denser fishmen + Coral Ring chest. */
function buildLakeDepths(): BuiltRoom {
  const b = new RoomBuilder(40, HALL.rows);
  b.frame();

  // Entire interior flooded; thin surface band near the ceiling.
  b.hline(3, 1, 38, TileId.WaterTop);
  b.fill(1, 4, 38, 13, TileId.Water);
  b.hline(14, 1, 38, TileId.FloorTop);

  // Air-pocket treasure ledge (right) with Coral Ring.
  b.fill(30, 8, 34, 10, TileId.Empty);
  b.hline(11, 30, 34, TileId.FloorTop);
  b.fill(30, 12, 34, 13, TileId.Brick);

  // Dry east ledge + door → catacombs (HALL datum)
  b.fill(36, 10, 38, 12, TileId.Empty);
  b.hline(HALL.floorRow, 36, 38, TileId.FloorTop);
  b.door(39, HALL.doorRow0, HALL.doorRow1);

  // Ceiling shaft back up to the Sunken Gallery. Rows 1–2 are already open
  // air above the surface; only the stone ceiling needs punching through.
  b.hpunch(0, 18, 21);
  // Launch platform under the shaft so the swim-up exit is always reachable.
  b.hline(4, 18, 21, TileId.Platform);

  b.at("fishman", 10, 13);
  b.at("fishman", 18, 13);
  b.at("fishman", 26, 13);
  b.spawns.push({ kind: "item", x: 32 * TILE + 8, y: 11 * TILE, id: "coralRing", n: 0 });
  // No pillars in this flooded room — wall-mounted in the water column or
  // the air-pocket ledge, clear of the seabed and the ledge floor.
  b.at("candle", 6, 8);
  b.at("candle", 22, 6);
  b.at("candle", 32, 9);
  return b.build();
}

/** Hermit's Den — GALLERY datum so the bossRoom door is continuous. */
function buildShop(): BuiltRoom {
  const b = new RoomBuilder(20, GALLERY.rows);
  b.frame();
  b.hline(GALLERY.floorRow, 1, 18, TileId.FloorTop);
  b.fill(1, GALLERY.floorRow + 1, 18, GALLERY.floorRow + 1, TileId.Brick);
  b.door(0, GALLERY.doorRow0, GALLERY.doorRow1); // from Cavern
  b.door(19, GALLERY.doorRow0, GALLERY.doorRow1); // to the Boss hall
  b.at("shopkeeper", 9, GALLERY.floorRow - 1);
  b.at("candle", 4, 5); // no pillars in this room — wall-mounted
  b.at("candle", 14, 5);
  return b.build();
}

function buildBossRoom(): BuiltRoom {
  const b = new RoomBuilder(40, GALLERY.rows);
  b.frame();
  b.hline(GALLERY.floorRow, 1, 38, TileId.FloorTop);
  b.fill(1, GALLERY.floorRow + 1, 38, GALLERY.floorRow + 1, TileId.Brick);
  b.pillar(4, 8);
  b.pillar(35, 8);
  // Doorway (left wall). While the Colossus lives, Game fills these
  // exact cells with Gate so the portcullis sits ON the exit.
  b.door(0, GALLERY.doorRow0, GALLERY.doorRow1); // from the shop
  b.at("boss", 28, GALLERY.floorRow - 1, "colossus");
  b.at("candle", 4, 9); // pillar mid-shaft
  b.at("candle", 35, 9); // pillar mid-shaft
  return b.build();
}

/**
 * Castle topology (minimap grid — gx right, gy down). ONE link per edge.
 * Architectural datums: see `castlePlan.ts` and docs/CASTLE_PLAN.md.
 *
 * ```
 *                  [towerHall]——[towerTop]——[approach]——[sovereign]——[throne]
 *                       |
 *                  [towerShaft]
 *                       |
 *   [chapel]——[entrance]——[corridor]——[library]——[saveRoom]
 *                  |           ^ hatch
 *                  v pit
 *   [lake]——[cavern]——[shop]——[bossRoom]
 *     |
 *     v dive
 *   [lakeDepths]——[catacombs]
 * ```
 *
 * Floor datums (feet Y): GALLERY=176 · HALL=208 · CAVERN=256 · GRAND=320
 * Continuous side-door runs share a datum; documented steps elsewhere.
 *
 * Exit spawn convention (feet = bottom-center):
 *  - Door floors: y = profile.floorY
 *  - Left entry x ≈ 40; right entry x ≈ widthPx - 40
 *  - Shaft landings: solid ledge beside the hole, never into the void
 *
 * Minimap scale: ONE grid cell ≈ 16 columns × 12 rows of room, rounded.
 */
export const ROOMS: Record<string, RoomDef> = {
  entrance: {
    id: "entrance",
    name: "Entrance Hall",
    build: buildEntrance,
    mapRect: { gx: 0, gy: 0, gw: 4, gh: 2 }, // 64x24
    exits: [
      // West door on main floor → chapel (HALL 208)
      { side: "left", min: GRAND.doorBand.min, max: GRAND.doorBand.max, target: "chapel", tx: 400, ty: HALL.floorY },
      // East door on raised step (y band ~230–300) → corridor GALLERY
      { side: "right", min: 230, max: 300, target: "corridor", ...leftEntry("corridor") },
      {
        side: "bottom",
        min: 52 * TILE,
        max: 55 * TILE,
        target: "cavern",
        tx: 672,
        ty: 48,
      },
    ],
  },
  chapel: {
    id: "chapel",
    name: "Forsaken Chapel",
    build: buildChapel,
    mapRect: { gx: -2, gy: 0, gw: 2, gh: 1 }, // 28x16
    exits: [
      // Into entrance main floor (GRAND datum)
      { side: "right", ...sideDoorBand("chapel"), target: "entrance", tx: 48, ty: GRAND.floorY },
    ],
  },
  corridor: {
    id: "corridor",
    name: "Marble Gallery",
    build: buildCorridor,
    mapRect: { gx: 4, gy: 0, gw: 3, gh: 1 }, // 48x14
    exits: [
      // West → entrance raised step (288)
      { side: "left", ...sideDoorBand("corridor"), target: "entrance", tx: 960, ty: 18 * TILE },
      { side: "right", ...sideDoorBand("corridor"), target: "library", ...leftEntry("library") },
      {
        side: "top",
        min: 23 * TILE,
        max: 27 * TILE,
        target: "towerShaft",
        tx: 80, // fallback landing
        ty: SHAFT.floorY,
      },
    ],
  },
  library: {
    id: "library",
    name: "Forbidden Library",
    build: buildLibrary,
    mapRect: { gx: 7, gy: 0, gw: 2, gh: 1 }, // 32x14
    exits: [
      { side: "left", ...sideDoorBand("library"), target: "corridor", ...rightEntry("corridor") },
      { side: "right", ...sideDoorBand("library"), target: "saveRoom", ...leftEntry("saveRoom") },
    ],
  },
  towerShaft: {
    id: "towerShaft",
    name: "Clock Tower Shaft",
    zone: "tower",
    build: buildTowerShaft,
    mapRect: { gx: 5, gy: -3, gw: 1, gh: 3 }, // 16x40
    exits: [
      {
        side: "bottom",
        min: 6 * TILE,
        max: 10 * TILE,
        target: "corridor",
        tx: 400,
        ty: 64, // top platform under ceiling hatch (row 4)
      },
      {
        side: "top",
        min: 4 * TILE,
        max: 12 * TILE,
        target: "towerHall",
        // Land on solid floor right of the hole (cols 4–7)
        tx: 168,
        ty: GALLERY.floorY,
      },
    ],
  },
  towerHall: {
    id: "towerHall",
    name: "Gear Gallery",
    zone: "tower",
    build: buildTowerHall,
    mapRect: { gx: 4, gy: -4, gw: 3, gh: 1 }, // 40x14
    exits: [
      {
        side: "bottom",
        min: 4 * TILE,
        max: 8 * TILE,
        target: "towerShaft",
        tx: 40,
        ty: 64,
      },
      { side: "right", ...sideDoorBand("towerHall"), target: "towerTop", ...leftEntry("towerTop") },
    ],
  },
  towerTop: {
    id: "towerTop",
    name: "Clockwork Spire",
    zone: "tower",
    build: buildTowerTop,
    mapRect: { gx: 7, gy: -4, gw: 2, gh: 1 }, // 32x14
    boss: {
      id: "wraith",
      gateCells: [
        [0, GALLERY.doorRow0],
        [0, GALLERY.doorRow0 + 1],
        [0, GALLERY.doorRow1],
      ],
      rewards: [{ relic: "highJump", x: 256, y: GALLERY.floorY }],
    },
    exits: [
      { side: "left", ...sideDoorBand("towerTop"), target: "towerHall", ...rightEntry("towerHall") },
      { side: "right", ...sideDoorBand("towerTop"), target: "approach", ...leftEntry("approach") },
    ],
  },
  approach: {
    id: "approach",
    name: "Royal Approach",
    zone: "tower",
    build: buildApproach,
    mapRect: { gx: 9, gy: -4, gw: 2, gh: 1 }, // 36x14
    exits: [
      { side: "left", ...sideDoorBand("approach"), target: "towerTop", ...rightEntry("towerTop") },
      { side: "right", ...sideDoorBand("approach"), target: "sovereignHall", ...leftEntry("sovereignHall") },
    ],
  },
  sovereignHall: {
    id: "sovereignHall",
    name: "Hall of the Eternal",
    zone: "tower",
    build: buildSovereignHall,
    mapRect: { gx: 11, gy: -4, gw: 2, gh: 1 }, // 40x14
    boss: {
      id: "sovereign",
      gateCells: [
        [39, GALLERY.doorRow0],
        [39, GALLERY.doorRow0 + 1],
        [39, GALLERY.doorRow1],
      ],
      rewards: [],
    },
    exits: [
      { side: "left", ...sideDoorBand("sovereignHall"), target: "approach", ...rightEntry("approach") },
      // Ceremonial step up into throne (HALL 208)
      { side: "right", ...sideDoorBand("sovereignHall"), target: "throne", ...leftEntry("throne", 48) },
    ],
  },
  throne: {
    id: "throne",
    name: "Throne of Night",
    zone: "tower",
    build: buildThrone,
    mapRect: { gx: 13, gy: -4, gw: 3, gh: 1 }, // 48x16
    boss: {
      id: "dracula",
      gateCells: [
        [0, HALL.doorRow0],
        [0, HALL.doorRow0 + 1],
        [0, HALL.doorRow1],
      ],
      rewards: [],
    },
    exits: [
      { side: "left", ...sideDoorBand("throne"), target: "sovereignHall", ...rightEntry("sovereignHall") },
    ],
  },
  saveRoom: {
    id: "saveRoom",
    name: "Sanctuary",
    build: buildSaveRoom,
    mapRect: { gx: 9, gy: 0, gw: 1, gh: 1 }, // 20x14
    exits: [
      { side: "left", ...sideDoorBand("saveRoom"), target: "library", ...rightEntry("library") },
    ],
  },
  cavern: {
    id: "cavern",
    name: "Underground Cavern",
    build: buildCavern,
    mapRect: { gx: 1, gy: 2, gw: 3, gh: 2 }, // 48x20
    exits: [
      {
        side: "top",
        min: 40 * TILE,
        max: 44 * TILE,
        target: "entrance",
        tx: 816,
        ty: GRAND.floorY,
      },
      // Left door → lake dry landing (HALL)
      { side: "left", ...sideDoorBand("cavern"), target: "lake", ...rightEntry("lake") },
      // Right door → shop (GALLERY)
      { side: "right", ...sideDoorBand("cavern"), target: "shop", ...leftEntry("shop") },
    ],
  },
  lake: {
    id: "lake",
    name: "Sunken Gallery",
    build: buildLake,
    mapRect: { gx: -2, gy: 2, gw: 3, gh: 2 }, // 48x18
    exits: [
      { side: "right", ...sideDoorBand("lake"), target: "cavern", ...leftEntry("cavern") },
      {
        side: "bottom",
        min: 26 * TILE,
        max: 30 * TILE,
        target: "lakeDepths",
        tx: 320,
        ty: 48,
      },
    ],
  },
  lakeDepths: {
    id: "lakeDepths",
    name: "Sunken Depths",
    build: buildLakeDepths,
    mapRect: { gx: -2, gy: 4, gw: 3, gh: 1 }, // 40x16
    exits: [
      {
        side: "top",
        min: 18 * TILE,
        max: 22 * TILE,
        target: "lake",
        tx: 376,
        ty: 256, // swim landing near surface platforms
      },
      { side: "right", ...sideDoorBand("lakeDepths"), target: "catacombs", ...leftEntry("catacombs") },
    ],
  },
  catacombs: {
    id: "catacombs",
    name: "Bone Catacombs",
    build: buildCatacombs,
    mapRect: { gx: 1, gy: 4, gw: 3, gh: 1 }, // 40x16
    exits: [
      { side: "left", ...sideDoorBand("catacombs"), target: "lakeDepths", ...rightEntry("lakeDepths") },
    ],
  },
  shop: {
    id: "shop",
    name: "Hermit's Den",
    build: buildShop,
    mapRect: { gx: 4, gy: 3, gw: 1, gh: 1 }, // 20x14
    exits: [
      { side: "left", ...sideDoorBand("shop"), target: "cavern", ...rightEntry("cavern") },
      { side: "right", ...sideDoorBand("shop"), target: "bossRoom", ...leftEntry("bossRoom", 48) },
    ],
  },
  bossRoom: {
    id: "bossRoom",
    name: "Hall of the Colossus",
    build: buildBossRoom,
    mapRect: { gx: 5, gy: 3, gw: 3, gh: 1 }, // 40x14
    boss: {
      id: "colossus",
      gateCells: [
        [0, GALLERY.doorRow0],
        [0, GALLERY.doorRow0 + 1],
        [0, GALLERY.doorRow1],
      ],
      rewards: [
        { relic: "batForm", x: 368, y: GALLERY.floorY },
        { relic: "wolfForm", x: 416, y: GALLERY.floorY },
      ],
    },
    exits: [
      { side: "left", ...sideDoorBand("bossRoom"), target: "shop", ...rightEntry("shop") },
    ],
  },
};

export const START = { room: "entrance", x: 56, y: GRAND.floorY };

/** True when the final throne gate should open. */
export function canEnterThrone(flags: Set<string>): boolean {
  return (
    flags.has("relic:batForm") &&
    flags.has("relic:wolfForm") &&
    flags.has("relic:mistForm") &&
    flags.has("boss:colossus") &&
    flags.has("boss:wraith")
  );
}
