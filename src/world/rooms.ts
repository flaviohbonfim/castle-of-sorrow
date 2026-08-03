import { TILE, TileId } from "../gfx/tiles";
import { Tilemap } from "./tilemap";

export interface Spawn {
  kind: "player" | "skeleton" | "bat" | "candle" | "relic" | "warp" | "save" | "shopkeeper" | "boss";
  x: number; // world px
  y: number; // feet/bottom for grounded, center for flyers
  id?: string; // relic id
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

export interface RoomDef {
  id: string;
  name: string;
  exits: RoomExit[];
  /** Minimap footprint in map-grid cells. */
  mapRect: { gx: number; gy: number; gw: number; gh: number };
  build(): BuiltRoom;
}

/** Warp pads: room id -> destination room + pad position. */
export const WARP_LINKS: Record<string, { room: string; x: number; y: number }> = {
  corridor: { room: "cavern", x: 72, y: 256 },
  cavern: { room: "corridor", x: 88, y: 176 },
};

/* ------------------------------ builder ------------------------------ */

class RoomBuilder {
  readonly tiles: Uint8Array;
  readonly spawns: Spawn[] = [];

  constructor(
    readonly cols: number,
    readonly rows: number,
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

  /** Solid decorative pillar: top at `rTop`, base sits at `rTop + 2`. */
  pillar(c: number, rTop: number): void {
    this.set(c, rTop, TileId.PillarTop);
    this.set(c, rTop + 1, TileId.Pillar);
    this.set(c, rTop + 2, TileId.PillarBase);
  }

  /** Punch a doorway (Empty tiles) through a wall. */
  punch(c: number, r0: number, r1: number): void {
    for (let r = r0; r <= r1; r++) this.set(c, r, TileId.Empty);
  }

  /** Spawn marker: cell coords, y resolves to the surface below the cell. */
  at(kind: Spawn["kind"], c: number, r: number, id?: string): void {
    this.spawns.push({ kind, x: c * TILE + TILE / 2, y: (r + 1) * TILE, id });
  }

  build(): BuiltRoom {
    return { map: new Tilemap(this.cols, this.rows, this.tiles), spawns: this.spawns };
  }
}

/* ------------------------------- rooms ------------------------------- */

function buildEntrance(): BuiltRoom {
  const b = new RoomBuilder(64, 24);
  b.frame();
  b.windows(3, 7, 55, 8);

  // Main floor + right step.
  b.hline(20, 1, 62, TileId.FloorTop);
  b.fill(1, 21, 62, 22, TileId.Brick);
  b.hline(18, 55, 62, TileId.FloorTop);
  b.hline(19, 55, 62, TileId.Brick);

  // One-way platform climb.
  b.hline(17, 18, 24, TileId.Platform);
  b.hline(17, 40, 46, TileId.Platform);
  b.hline(14, 26, 33, TileId.Platform);
  b.hline(14, 48, 54, TileId.Platform);
  b.hline(11, 18, 24, TileId.Platform);
  b.hline(11, 36, 42, TileId.Platform);

  b.pillar(12, 17);
  b.pillar(50, 17);

  // Doorway to the Marble Gallery (above the right step).
  b.punch(63, 15, 17);
  // Floor hole down to the Underground Cavern.
  for (let c = 52; c <= 54; c++) {
    b.set(c, 20, TileId.Empty);
    for (let r = 21; r <= 23; r++) b.set(c, r, TileId.Empty);
  }

  b.at("player", 3, 19);
  b.at("skeleton", 28, 19);
  b.at("skeleton", 43, 19);
  b.at("skeleton", 60, 17);
  b.spawns.push({ kind: "bat", x: 16 * TILE, y: 8 * TILE });
  b.spawns.push({ kind: "bat", x: 34 * TILE, y: 7 * TILE });
  b.at("candle", 7, 19);
  b.at("candle", 16, 19);
  b.at("candle", 33, 19);
  b.at("candle", 47, 19);
  b.at("candle", 21, 16);
  b.at("candle", 43, 16);
  b.at("candle", 29, 13);
  b.at("candle", 51, 13);
  b.at("candle", 21, 10);
  b.at("candle", 39, 10);
  b.at("candle", 58, 17);
  return b.build();
}

function buildCorridor(): BuiltRoom {
  const b = new RoomBuilder(48, 14);
  b.frame();
  b.windows(3, 7, 39, 8);
  b.hline(11, 1, 46, TileId.FloorTop);
  b.fill(1, 12, 46, 12, TileId.Brick);
  b.pillar(13, 8);
  b.pillar(27, 8);
  b.pillar(41, 8);

  b.punch(0, 8, 10); // to Entrance
  b.punch(47, 8, 10); // to Sanctuary

  b.at("warp", 5, 10);
  b.at("candle", 10, 10);
  b.at("candle", 18, 10);
  b.at("candle", 26, 10);
  b.at("candle", 34, 10);
  b.at("skeleton", 20, 10);
  b.at("skeleton", 32, 10);
  return b.build();
}

function buildSaveRoom(): BuiltRoom {
  const b = new RoomBuilder(20, 12);
  b.frame();
  b.set(5, 3, TileId.BgWindow);
  b.hline(9, 1, 18, TileId.FloorTop);
  b.fill(1, 10, 18, 10, TileId.Brick);

  b.punch(0, 6, 8); // to Corridor

  // Secret alcove behind a breakable wall, hiding the double-jump relic.
  for (let r = 6; r <= 8; r++) b.set(12, r, TileId.Cracked);

  b.at("save", 6, 8);
  b.at("candle", 9, 8);
  b.at("relic", 15, 8, "doubleJump");
  return b.build();
}

function buildCavern(): BuiltRoom {
  const b = new RoomBuilder(48, 20);
  b.frame();
  b.hline(16, 1, 46, TileId.FloorTop);
  b.fill(1, 17, 46, 18, TileId.Brick);
  b.pillar(8, 13);
  b.pillar(42, 13);
  b.punch(47, 13, 15); // right door to the Hermit's Den

  // Climb back out: floor -> r13 -> (double jump) r9 -> r6 hops -> left door.
  b.hline(13, 34, 39, TileId.Platform);
  b.hline(9, 24, 29, TileId.Platform);
  b.hline(6, 17, 22, TileId.Platform);
  b.hline(6, 9, 13, TileId.Platform);
  b.hline(6, 1, 5, TileId.Platform);

  b.punch(0, 3, 5); // back to Entrance

  b.at("warp", 4, 15);
  b.at("skeleton", 24, 15);
  b.spawns.push({ kind: "bat", x: 20 * TILE, y: 10 * TILE });
  b.spawns.push({ kind: "bat", x: 32 * TILE, y: 8 * TILE });
  b.spawns.push({ kind: "bat", x: 40 * TILE, y: 12 * TILE });
  b.at("candle", 12, 15);
  b.at("candle", 30, 15);
  b.at("candle", 36, 12);
  b.at("candle", 26, 8);
  return b.build();
}

function buildShop(): BuiltRoom {
  const b = new RoomBuilder(20, 12);
  b.frame();
  b.hline(9, 1, 18, TileId.FloorTop);
  b.fill(1, 10, 18, 10, TileId.Brick);
  b.punch(0, 6, 8); // from Cavern
  b.punch(19, 6, 8); // to the Boss hall
  b.at("shopkeeper", 9, 8);
  b.at("candle", 4, 8);
  b.at("candle", 14, 8);
  return b.build();
}

function buildBossRoom(): BuiltRoom {
  const b = new RoomBuilder(40, 14);
  b.frame();
  b.hline(11, 1, 38, TileId.FloorTop);
  b.fill(1, 12, 38, 12, TileId.Brick);
  b.pillar(4, 8);
  b.pillar(35, 8);
  b.punch(0, 8, 10); // from the shop
  b.at("boss", 28, 10);
  b.at("candle", 8, 10);
  b.at("candle", 32, 10);
  return b.build();
}

export const ROOMS: Record<string, RoomDef> = {
  entrance: {
    id: "entrance",
    name: "Entrance Hall",
    build: buildEntrance,
    mapRect: { gx: 0, gy: 0, gw: 4, gh: 2 },
    exits: [
      { side: "right", min: 230, max: 300, target: "corridor", tx: 24, ty: 176 },
      { side: "bottom", min: 52 * TILE, max: 55 * TILE, target: "cavern", tx: 656, ty: 24 },
    ],
  },
  corridor: {
    id: "corridor",
    name: "Marble Gallery",
    build: buildCorridor,
    mapRect: { gx: 4, gy: 0, gw: 3, gh: 1 },
    exits: [
      { side: "left", min: 120, max: 180, target: "entrance", tx: 976, ty: 288 },
      { side: "right", min: 120, max: 180, target: "saveRoom", tx: 24, ty: 144 },
    ],
  },
  saveRoom: {
    id: "saveRoom",
    name: "Sanctuary",
    build: buildSaveRoom,
    mapRect: { gx: 7, gy: 0, gw: 2, gh: 1 },
    exits: [{ side: "left", min: 88, max: 148, target: "corridor", tx: 736, ty: 176 }],
  },
  cavern: {
    id: "cavern",
    name: "Underground Cavern",
    build: buildCavern,
    mapRect: { gx: 3, gy: 2, gw: 3, gh: 2 },
    exits: [
      { side: "left", min: 40, max: 100, target: "entrance", tx: 32, ty: 320 },
      { side: "right", min: 200, max: 260, target: "shop", tx: 24, ty: 144 },
    ],
  },
  shop: {
    id: "shop",
    name: "Hermit's Den",
    build: buildShop,
    mapRect: { gx: 6, gy: 2, gw: 1, gh: 2 },
    exits: [
      { side: "left", min: 88, max: 148, target: "cavern", tx: 728, ty: 256 },
      { side: "right", min: 88, max: 148, target: "bossRoom", tx: 56, ty: 176 },
    ],
  },
  bossRoom: {
    id: "bossRoom",
    name: "Hall of the Colossus",
    build: buildBossRoom,
    mapRect: { gx: 7, gy: 2, gw: 2, gh: 2 },
    exits: [{ side: "left", min: 120, max: 180, target: "shop", tx: 280, ty: 144 }],
  },
};

export const START = { room: "entrance", x: 56, y: 320 };
