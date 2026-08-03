import { TILE, TileId, type ZoneId } from "../gfx/tiles";
import { Tilemap } from "./tilemap";

export interface Spawn {
  kind:
    | "player"
    | "skeleton"
    | "bat"
    | "fishman"
    | "axeKnight"
    | "medusaSpawner"
    | "candle"
    | "relic"
    | "item"
    | "warp"
    | "save"
    | "shopkeeper"
    | "npc"
    | "boss";
  x: number; // world px
  y: number; // feet/bottom for grounded, center for flyers
  id?: string; // relic id, item id, boss id, or item flag key
  n?: number; // item pickup index within the room (for flags)
  dir?: 1 | -1; // medusa spawner flight direction
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
  corridor: { x: 88, y: 176 },
  cavern: { x: 360, y: 256 }, // at("warp", 22, 15) — away from both pits
  towerHall: { x: 168, y: 208 }, // at("warp", 10, 12)
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
    return {
      map: new Tilemap(this.cols, this.rows, this.tiles, this.zone),
      spawns: this.spawns,
    };
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

  // Pit to Underground Cavern (RIGHT side). Ledges on both sides so you can
  // climb back up when returning through the same shaft.
  for (let c = 52; c <= 54; c++) {
    b.set(c, 20, TileId.Empty);
    for (let r = 21; r <= 23; r++) b.set(c, r, TileId.Empty);
  }
  // Keep a solid lip left of the pit to stand on after a return jump.
  b.set(51, 20, TileId.FloorTop);

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

  // Double-jump shaft up to the Clock Tower (ceiling hole + climb platforms).
  b.hline(7, 22, 27, TileId.Platform);
  b.hline(4, 22, 27, TileId.Platform);
  for (let c = 24; c <= 25; c++) {
    b.set(c, 0, TileId.Empty);
  }

  b.at("warp", 5, 10);
  b.at("npc", 38, 10, "ghost"); // Pale Knight — double-jump hint
  b.at("candle", 10, 10);
  b.at("candle", 18, 10);
  b.at("candle", 26, 10);
  b.at("candle", 34, 10);
  b.at("skeleton", 20, 10);
  b.at("skeleton", 32, 10);
  return b.build();
}

/**
 * Tall vertical shaft — staggered one-way platforms + medusa pressure.
 * Bottom hole returns to the Marble Gallery; open center shaft + wide
 * ceiling hole exits to Gear Gallery. Platforms are one-way so ↓+Jump
 * drops through on the way back down.
 */
function buildTowerShaft(): BuiltRoom {
  const b = new RoomBuilder(16, 40, "tower");
  b.frame();

  // --- bottom landing with a real hole through the floor (cols 6–9) ---
  b.hline(37, 1, 14, TileId.FloorTop);
  b.fill(1, 38, 14, 38, TileId.Brick);
  for (let c = 6; c <= 9; c++) {
    b.set(c, 37, TileId.Empty);
    b.set(c, 38, TileId.Empty);
    b.set(c, 39, TileId.Empty);
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

  b.at("candle", 3, 36);
  b.at("candle", 12, 33);
  b.at("candle", 4, 21);
  b.at("candle", 11, 12);
  return b.build();
}

/** Mid tower hall with gears, axe knights, warp pad. */
function buildTowerHall(): BuiltRoom {
  const b = new RoomBuilder(40, 16, "tower");
  b.frame();
  b.hline(13, 1, 38, TileId.FloorTop);
  b.fill(1, 14, 38, 14, TileId.Brick);
  b.pillar(8, 10);
  b.pillar(20, 10);
  b.pillar(32, 10);
  // Decorative "gear" platforms
  b.hline(10, 12, 16, TileId.Platform);
  b.hline(9, 24, 28, TileId.Platform);
  b.hline(7, 18, 22, TileId.Platform);

  // Floor hole down to shaft (must cut through FloorTop + subfloor).
  for (let c = 4; c <= 7; c++) {
    b.set(c, 13, TileId.Empty);
    b.set(c, 14, TileId.Empty);
    b.set(c, 15, TileId.Empty);
  }
  b.punch(39, 10, 12); // to towerTop boss

  // Warp sits on solid floor to the right of the hole.
  b.at("warp", 10, 12);
  b.at("npc", 22, 12, "demon"); // Caged Imp — wraith / high-jump hint
  b.at("axeKnight", 14, 12);
  b.at("axeKnight", 30, 12);
  b.at("candle", 10, 12);
  b.at("candle", 34, 12);
  b.at("candle", 19, 6);
  return b.build();
}

/** Clock Tower summit — Wraith boss arena. */
function buildTowerTop(): BuiltRoom {
  const b = new RoomBuilder(32, 14, "tower");
  b.frame();
  b.hline(11, 1, 30, TileId.FloorTop);
  b.fill(1, 12, 30, 12, TileId.Brick);
  b.pillar(5, 8);
  b.pillar(26, 8);
  b.punch(0, 8, 10); // from towerHall
  // Right wall sealed as Gate by default; Game opens it when throne is unlocked.
  for (let r = 8; r <= 10; r++) b.set(31, r, TileId.Gate);
  b.at("boss", 20, 10, "wraith");
  b.at("candle", 8, 10);
  b.at("candle", 24, 10);
  return b.build();
}

/** Final arena — opens only with all form relics + both wing bosses slain. */
function buildThrone(): BuiltRoom {
  const b = new RoomBuilder(36, 14, "tower");
  b.frame();
  b.hline(11, 1, 34, TileId.FloorTop);
  b.fill(1, 12, 34, 12, TileId.Brick);
  b.pillar(6, 8);
  b.pillar(29, 8);
  b.punch(0, 8, 10); // from towerTop
  b.at("boss", 22, 10, "sovereign");
  b.at("candle", 10, 10);
  b.at("candle", 26, 10);
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

/**
 * Underground Cavern — sits under the Entrance Hall's right pit.
 * Continuity:
 *  - CEILING hole (cols 40–43, right) ↔ Entrance floor pit (cols 52–54)
 *  - FLOOR hole (cols 3–5, left) ↔ Lake ceiling shaft (right side of lake)
 *  - LEFT lower door ↔ Lake right stair door (walk connection)
 *  - RIGHT door ↔ Hermit's Den
 */
function buildCavern(): BuiltRoom {
  const b = new RoomBuilder(48, 20);
  b.frame();
  b.hline(16, 1, 46, TileId.FloorTop);
  b.fill(1, 17, 46, 18, TileId.Brick);
  b.pillar(8, 13);
  b.pillar(30, 13);
  b.punch(47, 13, 15); // right door to the Hermit's Den

  // --- CEILING SHAFT back up to Entrance (right side) ---
  // Open ceiling so a full jump from the ledge triggers the top exit.
  for (let c = 40; c <= 43; c++) {
    b.set(c, 0, TileId.Empty);
    b.set(c, 1, TileId.Empty);
    b.set(c, 2, TileId.Empty);
  }
  // Landing ledges under the entrance drop + climb ladder back up the shaft.
  b.hline(3, 40, 43, TileId.Platform); // high — single jump exits to entrance
  b.hline(5, 36, 39, TileId.Platform);
  b.hline(5, 44, 46, TileId.Platform);
  b.hline(8, 38, 45, TileId.Platform);
  b.hline(11, 36, 42, TileId.Platform);
  b.hline(13, 40, 46, TileId.Platform);

  // Mid platforms (optional climb path across the room).
  b.hline(13, 20, 28, TileId.Platform);
  b.hline(10, 12, 18, TileId.Platform);
  b.hline(7, 6, 12, TileId.Platform);

  // Lower-left door: walk connection to Sunken Gallery stairs.
  b.punch(0, 13, 15);

  // --- FLOOR SHAFT down to Lake (LEFT side, above the left door) ---
  // Aligns with lake's right-ceiling shaft geographically (lake is to the left).
  for (let c = 3; c <= 5; c++) {
    b.set(c, 16, TileId.Empty);
    for (let r = 17; r <= 19; r++) b.set(c, r, TileId.Empty);
  }
  // Solid lips beside the pit so you don't slide in while using the door.
  b.set(2, 16, TileId.FloorTop);
  b.set(6, 16, TileId.FloorTop);

  // Warp away from both pits.
  b.at("warp", 22, 15);
  b.at("skeleton", 18, 15);
  b.at("skeleton", 34, 15);
  b.spawns.push({ kind: "bat", x: 20 * TILE, y: 10 * TILE });
  b.spawns.push({ kind: "bat", x: 32 * TILE, y: 8 * TILE });
  b.at("candle", 12, 15);
  b.at("candle", 28, 15);
  b.at("candle", 38, 12);
  b.at("candle", 42, 7);
  return b.build();
}

/**
 * Sunken Gallery — flooded chamber left of the cavern.
 * Continuity:
 *  - RIGHT door ↔ cavern lower-left door
 *  - CEILING shaft (cols 48–51, over the dry stair) ↔ cavern floor pit
 *  - LEFT door ↔ lakeDepths
 */
function buildLake(): BuiltRoom {
  const b = new RoomBuilder(56, 20);
  b.frame();

  // --- water column (most of the room) ---
  const surface = 11;
  b.hline(surface, 1, 54, TileId.WaterTop);
  b.fill(1, surface + 1, 54, 17, TileId.Water);
  b.hline(18, 1, 54, TileId.FloorTop);

  // Upper dry platforms (left/center only — right is the stair shaft).
  b.hline(5, 8, 20, TileId.Platform);
  b.hline(5, 28, 40, TileId.Platform);
  b.hline(8, 18, 30, TileId.Platform);

  // Left dry pedestal for Mermaid Statue (air pocket + solid floor).
  b.fill(2, surface, 7, 14, TileId.Empty);
  b.hline(15, 2, 7, TileId.FloorTop);
  b.fill(2, 16, 7, 17, TileId.Brick);
  // Cracked wall sealing the alcove from the open water on the right.
  for (let r = 12; r <= 15; r++) b.set(8, r, TileId.Cracked);

  // Submerged shelves (swim-through platforms).
  b.hline(15, 22, 26, TileId.Platform);
  b.hline(14, 36, 40, TileId.Platform);

  // Right dry stair block + CEILING SHAFT from cavern (aligned drop).
  b.fill(48, surface, 54, 13, TileId.Empty);
  b.hline(14, 48, 54, TileId.FloorTop);
  b.fill(48, 15, 54, 17, TileId.Brick);
  b.hline(12, 46, 47, TileId.Platform);
  b.hline(10, 50, 54, TileId.Platform);
  // Open the ceiling above the stair so the cavern pit drops you HERE,
  // not into mid-water in the center of the room.
  for (let c = 48; c <= 51; c++) {
    b.set(c, 0, TileId.Empty);
    b.set(c, 1, TileId.Empty);
    b.set(c, 2, TileId.Empty);
    b.set(c, 3, TileId.Empty);
    b.set(c, 4, TileId.Empty);
  }
  // Catch + climb platforms in the shaft (one-way; ↓+Jump to drop through).
  b.hline(3, 48, 51, TileId.Platform); // high enough to jump back to cavern
  b.hline(6, 48, 52, TileId.Platform);

  b.punch(55, 11, 13); // right door → cavern lower-left
  b.punch(0, 15, 17); // left door → lakeDepths (underwater)

  b.at("relic", 4, 14, "waterWalk");
  b.at("fishman", 18, 17);
  b.at("fishman", 32, 17);
  b.at("fishman", 42, 17);
  b.at("candle", 12, 4);
  b.at("candle", 34, 4);
  b.at("candle", 50, 9);
  b.at("candle", 24, 14);
  return b.build();
}

/** Fully flooded lower depths with denser fishmen + Coral Ring chest. */
function buildLakeDepths(): BuiltRoom {
  const b = new RoomBuilder(40, 16);
  b.frame();

  // Entire interior flooded; thin surface band near the ceiling.
  b.hline(3, 1, 38, TileId.WaterTop);
  b.fill(1, 4, 38, 13, TileId.Water);
  b.hline(14, 1, 38, TileId.FloorTop);

  // Air-pocket treasure ledge (right) with Coral Ring.
  b.fill(30, 8, 34, 10, TileId.Empty);
  b.hline(11, 30, 34, TileId.FloorTop);
  b.fill(30, 12, 34, 13, TileId.Brick);

  b.punch(39, 11, 13); // right door → lake left

  b.at("fishman", 10, 13);
  b.at("fishman", 18, 13);
  b.at("fishman", 26, 13);
  b.spawns.push({ kind: "item", x: 32 * TILE + 8, y: 11 * TILE, id: "coralRing", n: 0 });
  b.at("candle", 6, 13);
  b.at("candle", 22, 13);
  b.at("candle", 32, 10);
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
  b.at("boss", 28, 10, "colossus");
  b.at("candle", 8, 10);
  b.at("candle", 32, 10);
  return b.build();
}

/**
 * Exit spawn convention (feet = bottom-center):
 *  - Door floors: stand on FloorTop surface → y = row * TILE
 *  - Left entry x ≈ 24–40; right entry x ≈ widthPx - 40
 *  - Never spawn into a floor hole; land on a solid ledge beside it
 */
export const ROOMS: Record<string, RoomDef> = {
  entrance: {
    id: "entrance",
    name: "Entrance Hall",
    build: buildEntrance,
    // Map: spans left castle; pit on the right sits over cavern's top-right.
    mapRect: { gx: 0, gy: 0, gw: 4, gh: 2 },
    exits: [
      // Right step (floor y=288) → corridor left floor (y=176)
      { side: "right", min: 230, max: 300, target: "corridor", tx: 40, ty: 176 },
      // Floor pit (cols 52–54) → cavern ceiling shaft landing (right ledges)
      {
        side: "bottom",
        min: 52 * TILE,
        max: 55 * TILE,
        target: "cavern",
        tx: 600, // between right-side platforms under the shaft
        ty: 96, // feet on platform row 5/6
      },
    ],
  },
  corridor: {
    id: "corridor",
    name: "Marble Gallery",
    build: buildCorridor,
    mapRect: { gx: 4, gy: 0, gw: 3, gh: 1 },
    exits: [
      // → entrance right STEP (y=288), not the lower main floor
      { side: "left", min: 120, max: 180, target: "entrance", tx: 960, ty: 288 },
      { side: "right", min: 120, max: 180, target: "saveRoom", tx: 40, ty: 144 },
      // Ceiling hole → shaft left floor ledge (beside bottom hole)
      {
        side: "top",
        min: 24 * TILE,
        max: 26 * TILE,
        target: "towerShaft",
        tx: 40,
        ty: 592,
      },
    ],
  },
  towerShaft: {
    id: "towerShaft",
    name: "Clock Tower Shaft",
    zone: "tower",
    build: buildTowerShaft,
    mapRect: { gx: 5, gy: -3, gw: 1, gh: 3 },
    exits: [
      // Bottom hole → under corridor ceiling hatch
      {
        side: "bottom",
        min: 5 * TILE,
        max: 11 * TILE,
        target: "corridor",
        tx: 400,
        ty: 176,
      },
      // Ceiling hatch → hall floor, RIGHT of the return hole (cols 4–7)
      {
        side: "top",
        min: 4 * TILE,
        max: 12 * TILE,
        target: "towerHall",
        tx: 168,
        ty: 208,
      },
    ],
  },
  towerHall: {
    id: "towerHall",
    name: "Gear Gallery",
    zone: "tower",
    build: buildTowerHall,
    mapRect: { gx: 4, gy: -4, gw: 3, gh: 1 },
    exits: [
      // Floor hole → shaft top-left solid ledge (row 4, y=64)
      {
        side: "bottom",
        min: 4 * TILE,
        max: 8 * TILE,
        target: "towerShaft",
        tx: 40,
        ty: 64,
      },
      {
        side: "right",
        min: 152,
        max: 208,
        target: "towerTop",
        tx: 40,
        ty: 176,
      },
    ],
  },
  towerTop: {
    id: "towerTop",
    name: "Clockwork Spire",
    zone: "tower",
    build: buildTowerTop,
    mapRect: { gx: 7, gy: -4, gw: 2, gh: 1 },
    boss: {
      id: "wraith",
      gateCells: [
        [2, 8],
        [2, 9],
        [2, 10],
      ],
      rewards: [{ relic: "highJump", x: 256, y: 176 }],
    },
    exits: [
      { side: "left", min: 120, max: 180, target: "towerHall", tx: 600, ty: 208 },
      // Final gate (opened only when forms+bosses ready) → throne
      { side: "right", min: 120, max: 180, target: "throne", tx: 40, ty: 176 },
    ],
  },
  throne: {
    id: "throne",
    name: "Throne of Night",
    zone: "tower",
    build: buildThrone,
    mapRect: { gx: 9, gy: -4, gw: 2, gh: 1 },
    boss: {
      id: "sovereign",
      gateCells: [
        [2, 8],
        [2, 9],
        [2, 10],
      ],
      rewards: [],
    },
    exits: [
      { side: "left", min: 120, max: 180, target: "towerTop", tx: 472, ty: 176 },
    ],
  },
  saveRoom: {
    id: "saveRoom",
    name: "Sanctuary",
    build: buildSaveRoom,
    mapRect: { gx: 7, gy: 0, gw: 2, gh: 1 },
    exits: [{ side: "left", min: 88, max: 148, target: "corridor", tx: 728, ty: 176 }],
  },
  cavern: {
    id: "cavern",
    name: "Underground Cavern",
    build: buildCavern,
    // Under entrance-right; lake sits to the left on the map.
    mapRect: { gx: 3, gy: 2, gw: 3, gh: 2 },
    exits: [
      // Jump out ceiling shaft (cols 40–43) → entrance pit lip (col 51)
      {
        side: "top",
        min: 40 * TILE,
        max: 44 * TILE,
        target: "entrance",
        tx: 816, // solid floor left of the pit (col 51)
        ty: 320,
      },
      // Lower-left door → lake right stair (walk)
      { side: "left", min: 200, max: 260, target: "lake", tx: 856, ty: 224 },
      // Right door → shop
      { side: "right", min: 200, max: 260, target: "shop", tx: 40, ty: 144 },
      // Floor shaft (cols 3–5) → lake ceiling shaft above the dry stair
      {
        side: "bottom",
        min: 3 * TILE,
        max: 6 * TILE,
        target: "lake",
        tx: 792, // under lake ceiling hole cols 48–51
        ty: 112, // catch platform row 6
      },
    ],
  },
  lake: {
    id: "lake",
    name: "Sunken Gallery",
    build: buildLake,
    // Left of cavern, one row lower on the minimap.
    mapRect: { gx: 0, gy: 4, gw: 3, gh: 2 },
    exits: [
      // Right stair door → cavern lower-left floor (beside the floor pit)
      { side: "right", min: 176, max: 224, target: "cavern", tx: 120, ty: 256 },
      // Jump out ceiling shaft → cavern next to floor pit lip
      {
        side: "top",
        min: 48 * TILE,
        max: 52 * TILE,
        target: "cavern",
        tx: 112, // solid lip col 6 beside pit
        ty: 256,
      },
      // Left underwater → lakeDepths near right door
      { side: "left", min: 232, max: 288, target: "lakeDepths", tx: 600, ty: 224 },
    ],
  },
  lakeDepths: {
    id: "lakeDepths",
    name: "Sunken Depths",
    build: buildLakeDepths,
    mapRect: { gx: 0, gy: 6, gw: 2, gh: 1 },
    exits: [
      { side: "right", min: 176, max: 224, target: "lake", tx: 40, ty: 288 },
    ],
  },
  shop: {
    id: "shop",
    name: "Hermit's Den",
    build: buildShop,
    mapRect: { gx: 6, gy: 2, gw: 1, gh: 2 },
    exits: [
      { side: "left", min: 88, max: 148, target: "cavern", tx: 728, ty: 256 },
      { side: "right", min: 88, max: 148, target: "bossRoom", tx: 48, ty: 176 },
    ],
  },
  bossRoom: {
    id: "bossRoom",
    name: "Hall of the Colossus",
    build: buildBossRoom,
    mapRect: { gx: 7, gy: 2, gw: 2, gh: 2 },
    boss: {
      id: "colossus",
      gateCells: [
        [2, 8],
        [2, 9],
        [2, 10],
      ],
      rewards: [
        { relic: "batForm", x: 368, y: 176 },
        { relic: "wolfForm", x: 416, y: 176 },
      ],
    },
    exits: [{ side: "left", min: 120, max: 180, target: "shop", tx: 280, ty: 144 }],
  },
};

export const START = { room: "entrance", x: 56, y: 320 };

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
