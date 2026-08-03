import { TILE } from "../gfx/tiles";
import type { Rect } from "../engine/math";
import type { Tilemap } from "./tilemap";

export interface Body {
  x: number; // hitbox top-left, world px
  y: number;
  w: number;
  h: number;
  vx: number; // px per tick
  vy: number;
  onGround: boolean;
  dropThrough?: boolean; // set for a few ticks to fall through one-way platforms
}

/**
 * Move a body through the tilemap, resolving each axis separately
 * (horizontal sweep, then vertical). One-way platforms only collide when
 * falling onto them from above and not dropping through.
 */
export function moveBody(body: Body, map: Tilemap): void {
  // --- horizontal ---
  body.x += body.vx;
  if (body.vx !== 0) {
    const dir = Math.sign(body.vx);
    const edge = dir > 0 ? body.x + body.w : body.x;
    const col = Math.floor(edge / TILE);
    const r0 = Math.floor(body.y / TILE);
    const r1 = Math.floor((body.y + body.h - 1) / TILE);
    for (let r = r0; r <= r1; r++) {
      if (map.isSolid(col, r)) {
        body.x = dir > 0 ? col * TILE - body.w - 0.001 : (col + 1) * TILE;
        body.vx = 0;
        break;
      }
    }
  }

  // --- vertical ---
  const wasBottom = body.y + body.h;
  body.y += body.vy;
  body.onGround = false;
  if (body.vy > 0) {
    const bottom = body.y + body.h;
    const row = Math.floor(bottom / TILE);
    const c0 = Math.floor(body.x / TILE);
    const c1 = Math.floor((body.x + body.w - 1) / TILE);
    for (let c = c0; c <= c1; c++) {
      const solid = map.isSolid(c, row);
      // One-way platform: land only if we crossed its top edge this tick.
      const oneWay =
        !body.dropThrough &&
        map.isOneWay(c, row) &&
        wasBottom <= row * TILE + 0.5;
      if (solid || oneWay) {
        body.y = row * TILE - body.h - 0.001;
        body.vy = 0;
        body.onGround = true;
        break;
      }
    }
  } else if (body.vy < 0) {
    const row = Math.floor(body.y / TILE);
    const c0 = Math.floor(body.x / TILE);
    const c1 = Math.floor((body.x + body.w - 1) / TILE);
    for (let c = c0; c <= c1; c++) {
      if (map.isSolid(c, row)) {
        body.y = (row + 1) * TILE;
        body.vy = 0;
        break;
      }
    }
  }
}

/** Is the body standing with ground directly beneath (for ledge checks)? */
export function groundAhead(body: Body, map: Tilemap, dir: number): boolean {
  const probeX = dir > 0 ? body.x + body.w + 2 : body.x - 2;
  const col = Math.floor(probeX / TILE);
  const row = Math.floor((body.y + body.h + 2) / TILE);
  return map.isSolid(col, row) || map.isOneWay(col, row);
}

export function bodyRect(body: Body): Rect {
  return { x: body.x, y: body.y, w: body.w, h: body.h };
}
