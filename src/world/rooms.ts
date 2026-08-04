import { TILE, TileId, type ZoneId } from "../gfx/tiles";
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
  const b = new RoomBuilder(64, 24);
  b.frame();
  b.windows(3, 7, 55, 8);

  // Main floor + solid underlay.
  b.hline(20, 1, 62, TileId.FloorTop);
  b.fill(1, 21, 62, 22, TileId.Brick);
  // Right raised step — solid brick column under it (no floating FloorTop strip).
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
  b.set(55, 20, TileId.FloorTop);

  b.at("player", 3, 19);
  b.at("zombie", 22, 19);
  b.at("skeleton", 28, 19);
  b.at("zombie", 38, 19);
  b.at("skeleton", 43, 19);
  b.at("skeleton", 60, 17);
  b.at("fleaMan", 30, 13);
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

  b.door(0, 8, 10); // to Entrance
  b.door(47, 8, 10); // to Sanctuary

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
  b.at("spearGuard", 20, 10);
  b.at("skeleton", 32, 10);
  b.at("fleaMan", 25, 6);
  return b.build();
}

function buildChapel(): BuiltRoom {
  const b = new RoomBuilder(28, 16);
  b.frame();
  b.windows(4, 5, 22, 6);
  b.hline(13, 1, 26, TileId.FloorTop);
  b.fill(1, 14, 26, 14, TileId.Brick);
  b.pillar(6, 10);
  b.pillar(21, 10);
  // Raised altar ledge
  b.hline(11, 10, 17, TileId.Platform);
  b.door(27, 10, 12); // back to entrance
  b.at("spearGuard", 14, 12);
  b.at("zombie", 8, 12);
  b.at("zombie", 20, 12);
  b.at("candle", 5, 12);
  b.at("candle", 22, 12);
  b.at("candle", 12, 10);
  b.at("candle", 15, 10);
  return b.build();
}

function buildLibrary(): BuiltRoom {
  const b = new RoomBuilder(32, 14);
  b.frame();
  b.windows(4, 5, 26, 6);
  b.hline(11, 1, 30, TileId.FloorTop);
  b.fill(1, 12, 30, 12, TileId.Brick);
  b.hline(8, 8, 14, TileId.Platform);
  b.hline(8, 18, 24, TileId.Platform);
  b.pillar(10, 8);
  b.pillar(22, 8);
  b.door(0, 8, 10); // from corridor
  b.door(31, 8, 10); // to sanctuary
  b.at("axeKnight", 16, 10);
  b.at("skeleton", 8, 10);
  b.at("fleaMan", 20, 7);
  b.at("candle", 6, 10);
  b.at("candle", 12, 10);
  b.at("candle", 20, 10);
  b.at("candle", 26, 10);
  return b.build();
}

function buildApproach(): BuiltRoom {
  const b = new RoomBuilder(36, 14, "tower");
  b.frame();
  b.hline(11, 1, 34, TileId.FloorTop);
  b.fill(1, 12, 34, 12, TileId.Brick);
  b.hline(8, 10, 16, TileId.Platform);
  b.hline(8, 20, 26, TileId.Platform);
  b.pillar(8, 8);
  b.pillar(27, 8);
  b.door(0, 8, 10); // from towerTop
  b.door(35, 8, 10); // to sovereign hall
  b.at("spearGuard", 14, 10);
  b.at("spearGuard", 24, 10);
  b.at("axeKnight", 18, 10);
  // Form skill relics (separate from the transformation unlocks)
  b.at("relic", 12, 7, "batFire");
  b.at("relic", 22, 7, "wolfDash");
  b.at("candle", 6, 10);
  b.at("candle", 12, 10);
  b.at("candle", 22, 10);
  b.at("candle", 30, 10);
  return b.build();
}

function buildCatacombs(): BuiltRoom {
  const b = new RoomBuilder(40, 16);
  b.frame();
  b.hline(13, 1, 38, TileId.FloorTop);
  b.fill(1, 14, 38, 14, TileId.Brick);
  b.hline(10, 6, 12, TileId.Platform);
  b.hline(10, 18, 24, TileId.Platform);
  b.hline(7, 28, 34, TileId.Platform);
  b.pillar(10, 10);
  b.pillar(22, 10);
  b.pillar(32, 10);
  b.door(0, 10, 12); // from lakeDepths
  b.at("zombie", 8, 12);
  b.at("zombie", 14, 12);
  b.at("zombie", 20, 12);
  b.at("skeleton", 28, 12);
  b.at("fleaMan", 20, 9);
  b.at("fleaMan", 30, 6);
  b.at("candle", 5, 12);
  b.at("candle", 16, 12);
  b.at("candle", 26, 12);
  b.at("candle", 34, 12);
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
  b.door(39, 10, 12); // to towerTop boss

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
  b.door(0, 8, 10); // from towerHall
  // Right wall sealed as Gate by default; Game opens it when throne is unlocked.
  for (let r = 8; r <= 10; r++) b.set(31, r, TileId.Gate);
  b.at("boss", 20, 10, "wraith");
  b.at("candle", 8, 10);
  b.at("candle", 24, 10);
  return b.build();
}

/** Final arena — opens only with all form relics + both wing bosses slain. */
/**
 * Throne of Night — SotN-inspired red hall: wide carpet, stepped dais,
 * pillars sitting on each landing, candelabras. Dracula on the top dais.
 */
function buildThrone(): BuiltRoom {
  const b = new RoomBuilder(48, 16, "tower");
  b.frame();
  // Main hall floor
  b.hline(13, 1, 46, TileId.FloorTop);
  b.fill(1, 14, 46, 14, TileId.Brick);

  // Stepped dais (each step: FloorTop + solid brick underlay — never inverted fill ranges)
  // Step 1 (lowest)
  b.hline(12, 16, 40, TileId.FloorTop);
  b.fill(16, 13, 40, 13, TileId.Brick);
  // Step 2
  b.hline(11, 20, 38, TileId.FloorTop);
  b.fill(20, 12, 38, 12, TileId.Brick);
  // Step 3 (throne platform)
  b.hline(10, 24, 36, TileId.FloorTop);
  b.fill(24, 11, 36, 11, TileId.Brick);

  // Pillars sit ON their landings (base = floor row)
  b.pillar(6, 11); // main floor 13 → top at 11
  b.pillar(12, 11);
  b.pillar(30, 8); // top dais floor 10 → top at 8
  b.pillar(42, 11);

  b.door(0, 10, 12); // from sovereign hall / approach
  b.at("boss", 30, 9, "dracula");
  b.at("candle", 4, 12);
  b.at("candle", 9, 12);
  b.at("candle", 15, 12);
  b.at("candle", 18, 11);
  b.at("candle", 22, 10);
  b.at("candle", 34, 9);
  b.at("candle", 44, 12);
  return b.build();
}

/** Sovereign rematch arena — between Approach and Throne (boss kept, not removed). */
function buildSovereignHall(): BuiltRoom {
  const b = new RoomBuilder(40, 14, "tower");
  b.frame();
  b.hline(11, 1, 38, TileId.FloorTop);
  b.fill(1, 12, 38, 12, TileId.Brick);
  b.pillar(8, 8);
  b.pillar(31, 8);
  b.door(0, 8, 10); // from approach
  b.door(39, 8, 10); // to throne (sealed as Gate while boss lives)
  b.at("boss", 22, 10, "sovereign");
  b.at("candle", 6, 10);
  b.at("candle", 14, 10);
  b.at("candle", 26, 10);
  b.at("candle", 34, 10);
  return b.build();
}

function buildSaveRoom(): BuiltRoom {
  const b = new RoomBuilder(20, 12);
  b.frame();
  b.set(5, 3, TileId.BgWindow);
  b.hline(9, 1, 18, TileId.FloorTop);
  b.fill(1, 10, 18, 10, TileId.Brick);

  b.door(0, 6, 8); // to Corridor

  // Secret alcove behind a breakable wall, hiding the double-jump relic.
  for (let r = 6; r <= 8; r++) b.set(12, r, TileId.Cracked);

  b.at("save", 6, 8);
  b.at("candle", 9, 8);
  b.at("relic", 15, 8, "doubleJump");
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
  const b = new RoomBuilder(48, 20);
  b.frame();
  b.hline(16, 1, 46, TileId.FloorTop);
  b.fill(1, 17, 46, 18, TileId.Brick);
  b.pillar(12, 13);
  b.pillar(28, 13);
  b.door(47, 13, 15); // right → shop
  b.door(0, 13, 15); // left → lake (ONLY link to lake)

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
  b.at("candle", 10, 15);
  b.at("candle", 25, 15); // clear of the col-28 pillar base
  b.at("candle", 38, 12);
  b.at("candle", 42, 7);
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
  const b = new RoomBuilder(48, 18);
  b.frame();

  const surface = 9;
  b.hline(surface, 1, 46, TileId.WaterTop);
  b.fill(1, surface + 1, 46, 15, TileId.Water);
  b.hline(16, 1, 46, TileId.FloorTop);

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

  b.door(47, 10, 12); // right → cavern

  // Dive shaft down to the Sunken Depths — flooded so it reads as deep water
  // continuing below, not a hole onto the sky. Clear of both stone shelves.
  for (let c = 26; c <= 29; c++) {
    b.set(c, 16, TileId.Water);
    b.set(c, 17, TileId.Water);
  }

  b.at("relic", 4, 12, "waterWalk");
  b.at("fishman", 16, 15);
  b.at("fishman", 28, 15);
  b.at("fishman", 36, 15);
  b.at("candle", 10, 3);
  b.at("candle", 30, 3);
  b.at("candle", 42, 12);
  b.at("candle", 20, 12);
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

  // Dry east ledge + door → catacombs
  b.fill(36, 10, 38, 12, TileId.Empty);
  b.hline(13, 36, 38, TileId.FloorTop);
  b.door(39, 10, 12);

  // Ceiling shaft back up to the Sunken Gallery. Rows 1–2 are already open
  // air above the surface; only the stone ceiling needs punching through.
  b.hpunch(0, 18, 21);
  // Launch platform under the shaft so the swim-up exit is always reachable.
  b.hline(4, 18, 21, TileId.Platform);

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
  b.door(0, 6, 8); // from Cavern
  b.door(19, 6, 8); // to the Boss hall
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
  // Doorway (left wall). While the Colossus lives, Game fills these
  // exact cells with Gate so the portcullis sits ON the exit.
  b.door(0, 8, 10); // from the shop
  b.at("boss", 28, 10, "colossus");
  b.at("candle", 8, 10);
  b.at("candle", 32, 10);
  return b.build();
}

/**
 * Castle topology (minimap grid — gx right, gy down). ONE link per edge.
 *
 * ```
 *                 [towerHall]——[towerTop]——[throne]
 *                      |
 *                 [towerShaft]
 *                      |
 *  [entrance]——[corridor]——[saveRoom]
 *       |           ^up from corridor
 *       v pit
 *  [lake]——[cavern]——[shop]——[bossRoom]
 *    |
 *    v dive shaft
 *  [lakeDepths]
 * ```
 *
 * Exit spawn convention (feet = bottom-center):
 *  - Door floors: y = FloorTop row * TILE
 *  - Left entry x ≈ 40; right entry x ≈ widthPx - 40
 *  - Shaft landings: solid ledge beside the hole, never into the void
 *
 * Minimap scale: ONE grid cell ≈ 16 columns × 12 rows of room, rounded, so a
 * footprint reflects the room's real size. Keep new rooms on that scale —
 * `__validateMap()` checks adjacency/direction but not proportion.
 */
export const ROOMS: Record<string, RoomDef> = {
  entrance: {
    id: "entrance",
    name: "Entrance Hall",
    build: buildEntrance,
    mapRect: { gx: 0, gy: 0, gw: 4, gh: 2 }, // 64x24
    exits: [
      { side: "left", min: 260, max: 320, target: "chapel", tx: 400, ty: 208 },
      { side: "right", min: 230, max: 300, target: "corridor", tx: 40, ty: 176 },
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
    exits: [{ side: "right", min: 152, max: 208, target: "entrance", tx: 48, ty: 304 }],
  },
  corridor: {
    id: "corridor",
    name: "Marble Gallery",
    build: buildCorridor,
    mapRect: { gx: 4, gy: 0, gw: 3, gh: 1 }, // 48x14
    exits: [
      { side: "left", min: 120, max: 180, target: "entrance", tx: 960, ty: 288 },
      { side: "right", min: 120, max: 180, target: "library", tx: 40, ty: 176 },
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
  library: {
    id: "library",
    name: "Forbidden Library",
    build: buildLibrary,
    mapRect: { gx: 7, gy: 0, gw: 2, gh: 1 }, // 32x14
    exits: [
      { side: "left", min: 120, max: 180, target: "corridor", tx: 728, ty: 176 },
      { side: "right", min: 120, max: 180, target: "saveRoom", tx: 40, ty: 144 },
    ],
  },
  towerShaft: {
    id: "towerShaft",
    name: "Clock Tower Shaft",
    zone: "tower",
    build: buildTowerShaft,
    mapRect: { gx: 5, gy: -3, gw: 1, gh: 3 }, // 16x40
    exits: [
      // Range matches the floor hole exactly (cols 6–9).
      {
        side: "bottom",
        min: 6 * TILE,
        max: 10 * TILE,
        target: "corridor",
        tx: 400,
        ty: 176,
      },
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
    mapRect: { gx: 4, gy: -4, gw: 3, gh: 1 }, // 40x16
    exits: [
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
    mapRect: { gx: 7, gy: -4, gw: 2, gh: 1 }, // 32x14
    boss: {
      id: "wraith",
      gateCells: [
        [0, 8],
        [0, 9],
        [0, 10],
      ],
      rewards: [{ relic: "highJump", x: 256, y: 176 }],
    },
    exits: [
      { side: "left", min: 120, max: 180, target: "towerHall", tx: 600, ty: 208 },
      { side: "right", min: 120, max: 180, target: "approach", tx: 40, ty: 176 },
    ],
  },
  approach: {
    id: "approach",
    name: "Royal Approach",
    zone: "tower",
    build: buildApproach,
    mapRect: { gx: 9, gy: -4, gw: 2, gh: 1 }, // 36x14
    exits: [
      { side: "left", min: 120, max: 180, target: "towerTop", tx: 472, ty: 176 },
      { side: "right", min: 120, max: 180, target: "sovereignHall", tx: 40, ty: 176 },
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
        [39, 8],
        [39, 9],
        [39, 10],
      ],
      rewards: [],
    },
    exits: [
      { side: "left", min: 120, max: 180, target: "approach", tx: 536, ty: 176 },
      { side: "right", min: 120, max: 180, target: "throne", tx: 48, ty: 208 },
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
        [0, 10],
        [0, 11],
        [0, 12],
      ],
      rewards: [],
    },
    exits: [
      { side: "left", min: 152, max: 208, target: "sovereignHall", tx: 600, ty: 176 },
    ],
  },
  saveRoom: {
    id: "saveRoom",
    name: "Sanctuary",
    build: buildSaveRoom,
    mapRect: { gx: 9, gy: 0, gw: 1, gh: 1 }, // 20x12
    exits: [{ side: "left", min: 88, max: 148, target: "library", tx: 472, ty: 176 }],
  },
  cavern: {
    id: "cavern",
    name: "Underground Cavern",
    build: buildCavern,
    // Under entrance; lake is immediately to the LEFT on the map. 48x20
    mapRect: { gx: 1, gy: 2, gw: 3, gh: 2 },
    exits: [
      // Ceiling shaft → entrance pit lip
      {
        side: "top",
        min: 40 * TILE,
        max: 44 * TILE,
        target: "entrance",
        tx: 816,
        ty: 320,
      },
      // Left door → lake (ONLY link to lake)
      { side: "left", min: 200, max: 260, target: "lake", tx: 720, ty: 208 },
      // Right door → shop
      { side: "right", min: 200, max: 260, target: "shop", tx: 40, ty: 144 },
    ],
  },
  lake: {
    id: "lake",
    name: "Sunken Gallery",
    build: buildLake,
    // Same vertical band as cavern, immediately to its left. 48x18
    mapRect: { gx: -2, gy: 2, gw: 3, gh: 2 },
    exits: [
      // Right door → cavern left (ONLY link to cavern)
      { side: "right", min: 152, max: 208, target: "cavern", tx: 40, ty: 256 },
      // Dive shaft (cols 26–29) → depths, which sit BELOW on the map.
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
        ty: 256,
      },
      { side: "right", min: 152, max: 208, target: "catacombs", tx: 40, ty: 208 },
    ],
  },
  catacombs: {
    id: "catacombs",
    name: "Bone Catacombs",
    build: buildCatacombs,
    mapRect: { gx: 1, gy: 4, gw: 3, gh: 1 }, // 40x16
    exits: [
      { side: "left", min: 152, max: 208, target: "lakeDepths", tx: 600, ty: 208 },
    ],
  },
  shop: {
    id: "shop",
    name: "Hermit's Den",
    build: buildShop,
    mapRect: { gx: 4, gy: 3, gw: 1, gh: 1 }, // 20x12
    exits: [
      { side: "left", min: 88, max: 148, target: "cavern", tx: 728, ty: 256 },
      { side: "right", min: 88, max: 148, target: "bossRoom", tx: 48, ty: 176 },
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
        [0, 8],
        [0, 9],
        [0, 10],
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
