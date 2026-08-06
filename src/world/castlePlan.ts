/**
 * Castle Master Plan — single source of truth for architecture datums.
 *
 * Every room belongs to a wing. Rooms that share a horizontal door within
 * a wing share the same floor feet-Y and door band so painted backdrops
 * (and the SotN slide transition) can continue across the seam.
 *
 * Design-first: art is generated to match these constants, never measured
 * from art. See docs/CASTLE_PLAN.md.
 */
import { TILE } from "../gfx/tiles";
import type { ZoneId } from "../gfx/tiles";

/* ------------------------------------------------------------------ */
/*  Architectural profiles (reusable room "kits")                     */
/* ------------------------------------------------------------------ */

/**
 * A room-height kit: floor row, 3-tile door stack, foundation under the
 * floor. Feet stand on the top edge of FloorTop (`floorRow * TILE`).
 */
export interface ArchProfile {
  id: string;
  /** Total room rows (including border bricks). */
  rows: number;
  /** FloorTop row index. */
  floorRow: number;
  /** Feet Y on the main floor (= floorRow * TILE). */
  floorY: number;
  /** Door tile rows [r0, r1] inclusive — always 3 cells tall. */
  doorRow0: number;
  doorRow1: number;
  /**
   * Exit band on the perpendicular axis for left/right doors
   * (body-center Y range that triggers the exit).
   */
  doorBand: { min: number; max: number };
}

/** 14-row gallery: the most common horizontal corridor kit. */
export const GALLERY: ArchProfile = {
  id: "gallery",
  rows: 14,
  floorRow: 11,
  floorY: 11 * TILE, // 176
  doorRow0: 8,
  doorRow1: 10,
  doorBand: { min: 120, max: 180 },
};

/** 16-row hall: taller ceremony / chapel / catacomb kit. */
export const HALL: ArchProfile = {
  id: "hall",
  rows: 16,
  floorRow: 13,
  floorY: 13 * TILE, // 208
  doorRow0: 10,
  doorRow1: 12,
  doorBand: { min: 152, max: 220 },
};

/** 12-row sanctum: compact side rooms (kept for legacy; prefer GALLERY). */
export const SANCTUM: ArchProfile = {
  id: "sanctum",
  rows: 12,
  floorRow: 9,
  floorY: 9 * TILE, // 144
  doorRow0: 6,
  doorRow1: 8,
  doorBand: { min: 88, max: 148 },
};

/** 24-row grand entrance — multi-level, not a flat kit. */
export const GRAND: ArchProfile = {
  id: "grand",
  rows: 24,
  floorRow: 20,
  floorY: 20 * TILE, // 320
  doorRow0: 17,
  doorRow1: 19,
  doorBand: { min: 260, max: 320 },
};

/** 20-row cavern hall. */
export const CAVERN: ArchProfile = {
  id: "cavern",
  rows: 20,
  floorRow: 16,
  floorY: 16 * TILE, // 256
  doorRow0: 13,
  doorRow1: 15,
  doorBand: { min: 200, max: 260 },
};

/** 18-row flooded gallery (dry landings use HALL door geometry). */
export const FLOODED: ArchProfile = {
  id: "flooded",
  rows: 18,
  floorRow: 16, // seabed; dry landings sit at row 13 (HALL.floorY)
  floorY: 16 * TILE, // 256 seabed
  doorRow0: 10,
  doorRow1: 12,
  doorBand: { min: 152, max: 208 },
};

/** 40-row vertical shaft — no side doors; top/bottom hatches only. */
export const SHAFT: ArchProfile = {
  id: "shaft",
  rows: 40,
  floorRow: 37,
  floorY: 37 * TILE, // 592
  doorRow0: 0,
  doorRow1: 0,
  doorBand: { min: 0, max: 0 },
};

/* ------------------------------------------------------------------ */
/*  Wings                                                             */
/* ------------------------------------------------------------------ */

export type WingId = "upper" | "tower" | "under" | "depths";

export interface WingDef {
  id: WingId;
  name: string;
  zone: ZoneId;
  /** Default profile for new rooms added to this wing. */
  defaultProfile: ArchProfile;
  /**
   * Horizontal floor datum for side-door continuity within the wing.
   * Rooms on this wing that open left/right to each other must land
   * the player at this feet-Y (or document an explicit step).
   */
  floorDatumY: number;
  rooms: string[];
  notes: string;
}

export const WINGS: Record<WingId, WingDef> = {
  upper: {
    id: "upper",
    name: "Upper Gallery",
    zone: "castle",
    defaultProfile: GALLERY,
    floorDatumY: GALLERY.floorY, // 176
    rooms: ["chapel", "entrance", "corridor", "library", "saveRoom"],
    notes:
      "Main horizontal spine. corridor/library/saveRoom share GALLERY datum (176). " +
      "entrance is GRAND (multi-level); right door sits on the raised step (288) " +
      "and drops the player to corridor 176 (documented stair). " +
      "chapel is HALL (208) — side chapel one step below entrance main floor.",
  },
  tower: {
    id: "tower",
    name: "Clock Tower",
    zone: "tower",
    defaultProfile: GALLERY,
    floorDatumY: GALLERY.floorY, // 176
    rooms: ["towerShaft", "towerHall", "towerTop", "approach", "sovereignHall", "throne"],
    notes:
      "Vertical climb (shaft) then horizontal run Hall→Top→Approach→Sovereign at 176. " +
      "throne is HALL (208) — ceremonial single step up into the final arena. " +
      "towerShaft is pure vertical (SHAFT profile).",
  },
  under: {
    id: "under",
    name: "Undercroft",
    zone: "castle",
    defaultProfile: CAVERN,
    floorDatumY: CAVERN.floorY, // 256
    rooms: ["cavern", "lake", "shop", "bossRoom"],
    notes:
      "cavern is the hub at 256. lake dry landings use HALL door geom (208) — " +
      "step up from cavern waterline door. shop+bossRoom share GALLERY (176) " +
      "as a raised hermit annex off the cavern.",
  },
  depths: {
    id: "depths",
    name: "Sunken Depths",
    zone: "castle",
    defaultProfile: HALL,
    floorDatumY: HALL.floorY, // 208
    rooms: ["lakeDepths", "catacombs"],
    notes:
      "Fully / partially flooded lower wing. lakeDepths east ledge and " +
      "catacombs share HALL datum (208). Linked up to lake via dive shaft.",
  },
};

/* ------------------------------------------------------------------ */
/*  Per-room plan                                                     */
/* ------------------------------------------------------------------ */

export interface RoomPlan {
  id: string;
  wing: WingId;
  profile: ArchProfile;
  cols: number;
  rows: number;
  /**
   * Feet-Y used by side-door entries into this room.
   * Equals profile.floorY for flat rooms; entrance uses the door-local
   * landing (main floor or raised step).
   */
  entryFloorY: number;
  /**
   * Explicit steps to a neighbor (when entryFloorY differs across a door).
   * Positive = step up into neighbor.
   */
  steps?: { to: string; deltaY: number; reason: string }[];
  boss?: boolean;
  notes?: string;
}

/**
 * Canonical room plan. Geometry in rooms.ts MUST match these numbers.
 * When adding a room: pick a wing, pick/extend a profile, add an entry
 * here, then build the RoomDef against the profile constants.
 */
export const ROOM_PLANS: Record<string, RoomPlan> = {
  /* ---------- Upper Gallery ---------- */
  chapel: {
    id: "chapel",
    wing: "upper",
    profile: HALL,
    cols: 28,
    rows: HALL.rows,
    entryFloorY: HALL.floorY,
    steps: [
      {
        to: "entrance",
        deltaY: GRAND.floorY - HALL.floorY, // +112
        reason: "side chapel sits below the grand hall main floor",
      },
    ],
    notes: "Forsaken Chapel — HALL kit, west of entrance.",
  },
  entrance: {
    id: "entrance",
    wing: "upper",
    profile: GRAND,
    cols: 64,
    rows: GRAND.rows,
    entryFloorY: GRAND.floorY, // main floor; right-door uses step 288 via exits
    steps: [
      {
        to: "corridor",
        deltaY: GALLERY.floorY - 18 * TILE, // 176 - 288 = -112
        reason: "raised east step drops into the Marble Gallery",
      },
      {
        to: "chapel",
        deltaY: HALL.floorY - GRAND.floorY, // -112
        reason: "west door into the lower side chapel",
      },
    ],
    notes:
      "Grand multi-level hall. Main floorY=320; east step floorY=288 " +
      "(door rows 15–17); west door on main floor (rows 17–19).",
  },
  corridor: {
    id: "corridor",
    wing: "upper",
    profile: GALLERY,
    cols: 48,
    rows: GALLERY.rows,
    entryFloorY: GALLERY.floorY,
    notes: "Marble Gallery — spine of the upper wing; warp pad; shaft hatch up.",
  },
  library: {
    id: "library",
    wing: "upper",
    profile: GALLERY,
    cols: 32,
    rows: GALLERY.rows,
    entryFloorY: GALLERY.floorY,
    notes: "Forbidden Library — flat GALLERY run east of corridor.",
  },
  saveRoom: {
    id: "saveRoom",
    wing: "upper",
    profile: GALLERY,
    cols: 20,
    rows: GALLERY.rows,
    entryFloorY: GALLERY.floorY,
    notes: "Sanctuary — raised to GALLERY datum so library door is continuous.",
  },

  /* ---------- Clock Tower ---------- */
  towerShaft: {
    id: "towerShaft",
    wing: "tower",
    profile: SHAFT,
    cols: 16,
    rows: SHAFT.rows,
    entryFloorY: SHAFT.floorY,
    notes: "Pure vertical climb; top/bottom hatches only.",
  },
  towerHall: {
    id: "towerHall",
    wing: "tower",
    profile: GALLERY,
    cols: 40,
    rows: GALLERY.rows,
    entryFloorY: GALLERY.floorY,
    notes: "Gear Gallery — lowered to GALLERY datum for continuous run to towerTop.",
  },
  towerTop: {
    id: "towerTop",
    wing: "tower",
    profile: GALLERY,
    cols: 32,
    rows: GALLERY.rows,
    entryFloorY: GALLERY.floorY,
    boss: true,
    notes: "Clockwork Spire — Wraith arena.",
  },
  approach: {
    id: "approach",
    wing: "tower",
    profile: GALLERY,
    cols: 36,
    rows: GALLERY.rows,
    entryFloorY: GALLERY.floorY,
    notes: "Royal Approach — form-skill relics.",
  },
  sovereignHall: {
    id: "sovereignHall",
    wing: "tower",
    profile: GALLERY,
    cols: 40,
    rows: GALLERY.rows,
    entryFloorY: GALLERY.floorY,
    boss: true,
    steps: [
      {
        to: "throne",
        deltaY: HALL.floorY - GALLERY.floorY, // +32
        reason: "ceremonial step up into the Throne of Night",
      },
    ],
    notes: "Hall of the Eternal — Sovereign arena.",
  },
  throne: {
    id: "throne",
    wing: "tower",
    profile: HALL,
    cols: 48,
    rows: HALL.rows,
    entryFloorY: HALL.floorY,
    boss: true,
    notes:
      "Throne of Night — final arena. HALL kit (208) with dais; " +
      "layout constants live in gfx/throneLayout.ts.",
  },

  /* ---------- Undercroft ---------- */
  cavern: {
    id: "cavern",
    wing: "under",
    profile: CAVERN,
    cols: 48,
    rows: CAVERN.rows,
    entryFloorY: CAVERN.floorY,
    steps: [
      {
        to: "lake",
        deltaY: HALL.floorY - CAVERN.floorY, // -48
        reason: "west door onto lake dry landing (one step up from waterline hall)",
      },
      {
        to: "shop",
        deltaY: GALLERY.floorY - CAVERN.floorY, // -80
        reason: "east door climbs into the hermit annex",
      },
    ],
    notes: "Underground hub — warp pad; ceiling shaft to entrance.",
  },
  lake: {
    id: "lake",
    wing: "under",
    profile: FLOODED,
    cols: 48,
    rows: FLOODED.rows,
    entryFloorY: HALL.floorY, // dry landing
    notes: "Sunken Gallery — flooded; side doors use HALL door geometry on dry ledges.",
  },
  shop: {
    id: "shop",
    wing: "under",
    profile: GALLERY,
    cols: 20,
    rows: GALLERY.rows,
    entryFloorY: GALLERY.floorY,
    notes: "Hermit's Den — raised to GALLERY so bossRoom door is continuous.",
  },
  bossRoom: {
    id: "bossRoom",
    wing: "under",
    profile: GALLERY,
    cols: 40,
    rows: GALLERY.rows,
    entryFloorY: GALLERY.floorY,
    boss: true,
    notes: "Hall of the Colossus — Bone Colossus arena.",
  },

  /* ---------- Depths ---------- */
  lakeDepths: {
    id: "lakeDepths",
    wing: "depths",
    profile: HALL,
    cols: 40,
    rows: HALL.rows,
    entryFloorY: HALL.floorY, // east dry ledge / catacombs door
    notes: "Sunken Depths — flooded; east ledge at HALL datum into catacombs.",
  },
  catacombs: {
    id: "catacombs",
    wing: "depths",
    profile: HALL,
    cols: 40,
    rows: HALL.rows,
    entryFloorY: HALL.floorY,
    notes: "Bone Catacombs — flat HALL run east of the depths.",
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

export function wingOf(roomId: string): WingDef | null {
  const plan = ROOM_PLANS[roomId];
  return plan ? WINGS[plan.wing] : null;
}

export function planOf(roomId: string): RoomPlan | null {
  return ROOM_PLANS[roomId] ?? null;
}

/** Pixel size of a room from its plan. */
export function roomSizePx(roomId: string): { w: number; h: number } | null {
  const p = ROOM_PLANS[roomId];
  if (!p) return null;
  return { w: p.cols * TILE, h: p.rows * TILE };
}

/**
 * Side-door exit band for a room using its profile.
 * Prefer this over hard-coded min/max in RoomDef.exits.
 */
export function sideDoorBand(roomId: string): { min: number; max: number } {
  const p = ROOM_PLANS[roomId];
  return p ? p.profile.doorBand : GALLERY.doorBand;
}

/** Entry feet position just inside a left door (`tx`/`ty` for RoomExit). */
export function leftEntry(roomId: string, tx = 40): { tx: number; ty: number } {
  const p = ROOM_PLANS[roomId];
  return { tx, ty: p?.entryFloorY ?? GALLERY.floorY };
}

/** Entry feet position just inside a right door (`tx`/`ty` for RoomExit). */
export function rightEntry(roomId: string, inset = 40): { tx: number; ty: number } {
  const p = ROOM_PLANS[roomId];
  const w = (p?.cols ?? 40) * TILE;
  return { tx: w - inset, ty: p?.entryFloorY ?? GALLERY.floorY };
}

/**
 * Door-tile rows for the room's profile — pass straight to RoomBuilder.door().
 */
export function doorRows(roomId: string): [number, number] {
  const p = ROOM_PLANS[roomId];
  const prof = p?.profile ?? GALLERY;
  return [prof.doorRow0, prof.doorRow1];
}

/** FloorTop row for the room's main walkable floor. */
export function floorRow(roomId: string): number {
  return ROOM_PLANS[roomId]?.profile.floorRow ?? GALLERY.floorRow;
}

/** All room ids in wing order (upper → tower → under → depths). */
export function allPlannedRoomIds(): string[] {
  return (Object.keys(WINGS) as WingId[]).flatMap((w) => WINGS[w].rooms);
}
