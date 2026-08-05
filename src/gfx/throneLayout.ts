/**
 * Authored layout for the Throne of Night (48×16 room, 768×256 px).
 *
 * Single source of truth shared by the room builder (prop placement), the
 * procedural backdrop, and the blockout reference the generated art must
 * follow (tools/make-throne-blockout.mjs mirrors these values). Positions
 * are DESIGNED, not measured: art is generated to match them, never the
 * other way around.
 */
import { TILE } from "./tiles";

export const THRONE_W = 48 * TILE; // 768
export const THRONE_H = 16 * TILE; // 256

/** Top of FloorTop row 13 — feet line for props, floor line in the art. */
export const THRONE_FLOOR_Y = 13 * TILE; // 208

/** Raised dais: top surface y and left edge x (col 38). */
export const THRONE_DAIS_Y = 12 * TILE; // 192
export const THRONE_DAIS_X = 38 * TILE; // 608

/**
 * Engaged pier centers, pitch 144px (9 tiles). Piers split the wall into
 * five bays: glass / curtain / glass / curtain / dais+canopy.
 */
export const THRONE_PIER_XS = [160, 304, 448, 592] as const;

/** Painted pier shaft width in the art (props are 28px wide and cover it). */
export const THRONE_PIER_W = 24;

/** Bay edges: playable interior runs x 16..752 (1-tile frame border). */
export const THRONE_BAY_EDGES = [16, 160, 304, 448, 592, 752] as const;

/** Centers of the two stained-glass bays (chandelier anchors). */
export const THRONE_GLASS_CENTERS = [88, 376] as const;
