import { TILE, TileId } from "../gfx/tiles";
import { ROOMS, WARP_CYCLE, WARP_PADS, type RoomDef, type RoomExit, type Spawn } from "../world/rooms";
import type { Tilemap } from "../world/tilemap";

/**
 * Static map validator — mechanically checks every castle-topology invariant
 * so broken transitions are caught without play-testing each door by hand.
 *
 * Run in the browser console: `__validateMap()` (DEV builds expose it).
 * Keep it green before shipping any room change.
 */

export interface MapIssue {
  severity: "error" | "warn";
  room: string;
  code: string;
  message: string;
}

/** Player standing hitbox (mirrors Player: 12 wide, 28 tall, feet-anchored). */
const PW = 12;
const PH = 28;

const OPPOSITE: Record<RoomExit["side"], RoomExit["side"]> = {
  left: "right",
  right: "left",
  top: "bottom",
  bottom: "top",
};

interface Built {
  def: RoomDef;
  map: Tilemap;
  spawns: Spawn[];
}

/** Spawn kinds that must rest on a walkable surface. */
const GROUNDED_SPAWNS = new Set<Spawn["kind"]>([
  "player", "skeleton", "axeKnight", "zombie", "spearGuard", "fleaMan",
  "candle", "relic", "item", "warp", "save", "shopkeeper", "npc", "boss",
]);

function buildAll(): Map<string, Built> {
  const out = new Map<string, Built>();
  for (const def of Object.values(ROOMS)) {
    const built = def.build();
    out.set(def.id, { def, map: built.map, spawns: built.spawns });
  }
  return out;
}

/** True when any solid tile overlaps the rect. */
function rectHitsSolid(map: Tilemap, x: number, y: number, w: number, h: number): boolean {
  const c0 = Math.floor(x / TILE);
  const c1 = Math.floor((x + w - 1) / TILE);
  const r0 = Math.floor(y / TILE);
  const r1 = Math.floor((y + h - 1) / TILE);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (r < 0 || r >= map.rows) continue; // above ceiling / below floor is open
      if (map.isSolid(c, r)) return true;
    }
  }
  return false;
}

/** Distance in px from `feetY` down to the first support, or null if none. */
function dropToSupport(map: Tilemap, cx: number, feetY: number): number | null {
  const c0 = Math.floor((cx - PW / 2) / TILE);
  const c1 = Math.floor((cx + PW / 2 - 1) / TILE);
  for (let r = Math.floor(feetY / TILE); r < map.rows; r++) {
    for (let c = c0; c <= c1; c++) {
      if (map.isSolid(c, r) || map.isOneWay(c, r) || map.isWaterTop(c, r) || map.isWater(c, r)) {
        return r * TILE - feetY;
      }
    }
  }
  return null;
}

/** Would standing at this spot immediately re-trigger one of the room's exits? */
function triggersExit(def: RoomDef, map: Tilemap, cx: number, feetY: number): RoomExit | null {
  const cy = feetY - PH / 2;
  const bodyY = feetY - PH;
  for (const e of def.exits) {
    const hit =
      (e.side === "right" && cx > map.widthPx - 8 && cy >= e.min && cy <= e.max) ||
      (e.side === "left" && cx < 8 && cy >= e.min && cy <= e.max) ||
      (e.side === "bottom" && bodyY > map.heightPx && cx >= e.min && cx <= e.max) ||
      (e.side === "top" && bodyY < 0 && cx >= e.min && cx <= e.max);
    if (hit) return e;
  }
  return null;
}

/**
 * Passable (non-solid) row spans of a boundary column, in px.
 * Gate counts as open: boss portcullises and the throne seal are solid only
 * while their unlock condition is unmet, and Game swaps them to Door.
 */
function passableSpans(map: Tilemap, col: number): [number, number][] {
  const spans: [number, number][] = [];
  let start: number | null = null;
  for (let r = 0; r < map.rows; r++) {
    const open = !map.isSolid(col, r) || map.at(col, r) === TileId.Gate;
    if (open && start === null) start = r;
    if (!open && start !== null) {
      spans.push([start * TILE, r * TILE]);
      start = null;
    }
  }
  if (start !== null) spans.push([start * TILE, map.rows * TILE]);
  return spans;
}

/** Passable column spans of a boundary row, in px. */
function passableCols(map: Tilemap, row: number): [number, number][] {
  const spans: [number, number][] = [];
  let start: number | null = null;
  for (let c = 0; c < map.cols; c++) {
    const open = !map.isSolid(c, row);
    if (open && start === null) start = c;
    if (!open && start !== null) {
      spans.push([start * TILE, c * TILE]);
      start = null;
    }
  }
  if (start !== null) spans.push([start * TILE, map.cols * TILE]);
  return spans;
}

function overlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

export function validateMap(): MapIssue[] {
  const issues: MapIssue[] = [];
  const rooms = buildAll();
  const add = (severity: MapIssue["severity"], room: string, code: string, message: string) =>
    issues.push({ severity, room, code, message });

  for (const { def, map, spawns } of rooms.values()) {
    /* ---------------- exits ---------------- */
    for (const exit of def.exits) {
      const label = `${def.id}.${exit.side}→${exit.target}`;
      const target = rooms.get(exit.target);
      if (!target) {
        add("error", def.id, "no-target", `${label}: target room does not exist`);
        continue;
      }

      // 1. Reciprocity: the target must lead back on the opposite side.
      const back = target.def.exits.find((e) => e.target === def.id);
      if (!back) {
        add("error", def.id, "one-way", `${label}: target has no exit back (dead end)`);
      } else if (back.side !== OPPOSITE[exit.side]) {
        add(
          "warn", def.id, "side-mismatch",
          `${label}: return exit is on '${back.side}', expected '${OPPOSITE[exit.side]}'`,
        );
      }

      // 2. Entry point inside the target room.
      const { tx, ty } = exit;
      if (tx < 0 || tx > target.map.widthPx || ty < 0 || ty > target.map.heightPx + TILE) {
        add("error", def.id, "entry-oob", `${label}: entry (${tx},${ty}) outside target bounds`);
        continue;
      }

      // 3. Entry hitbox must not be embedded in solid tiles.
      if (rectHitsSolid(target.map, tx - PW / 2, ty - PH, PW, PH)) {
        add("error", def.id, "entry-in-solid", `${label}: entry (${tx},${ty}) is inside solid tiles`);
      }

      // 4. Entry must have support below (side doors land, shafts may fall).
      const drop = dropToSupport(target.map, tx, ty);
      if (drop === null) {
        add("error", def.id, "entry-void", `${label}: entry (${tx},${ty}) has no ground below (void)`);
      } else if (exit.side === "left" || exit.side === "right") {
        if (drop > 8) {
          add(
            "warn", def.id, "entry-airborne",
            `${label}: side-door entry floats ${drop}px above ground`,
          );
        }
      } else if (drop > 12 * TILE) {
        add("warn", def.id, "entry-longfall", `${label}: shaft entry falls ${drop}px before support`);
      }

      // 5. Entry must not instantly bounce back through an exit.
      const bounce = triggersExit(target.def, target.map, tx, ty);
      if (bounce) {
        add(
          "error", def.id, "entry-bounce",
          `${label}: entry immediately re-triggers ${exit.target}.${bounce.side}→${bounce.target}`,
        );
      }

      // 6. Trigger band must line up with actually passable tiles.
      if (exit.side === "left" || exit.side === "right") {
        const col = exit.side === "left" ? 0 : map.cols - 1;
        const open = passableSpans(map, col);
        if (!open.some((s) => overlaps(s, [exit.min, exit.max]))) {
          add(
            "error", def.id, "trigger-sealed",
            `${label}: y-range ${exit.min}-${exit.max} has no opening in column ${col}`,
          );
        }
      } else {
        const row = exit.side === "top" ? 0 : map.rows - 1;
        const open = passableCols(map, row);
        const covered = open.filter((s) => overlaps(s, [exit.min, exit.max]));
        if (covered.length === 0) {
          add(
            "error", def.id, "trigger-sealed",
            `${label}: x-range ${exit.min}-${exit.max} has no opening in row ${row}`,
          );
        } else {
          const hole = covered[0];
          if (exit.min < hole[0] - 1 || exit.max > hole[1] + 1) {
            add(
              "warn", def.id, "trigger-loose",
              `${label}: x-range ${exit.min}-${exit.max} is wider than the hole ${hole[0]}-${hole[1]}`,
            );
          }
        }
      }

      // 7. Minimap direction must match the exit side.
      const a = def.mapRect;
      const b = target.def.mapRect;
      const touchX = a.gx + a.gw === b.gx || b.gx + b.gw === a.gx;
      const touchY = a.gy + a.gh === b.gy || b.gy + b.gh === a.gy;
      const overlapY = a.gy < b.gy + b.gh && b.gy < a.gy + a.gh;
      const overlapX = a.gx < b.gx + b.gw && b.gx < a.gx + a.gw;
      const adjacent = (touchX && overlapY) || (touchY && overlapX);
      if (!adjacent) {
        add(
          "error", def.id, "map-not-adjacent",
          `${label}: rooms are not adjacent on the minimap grid`,
        );
      } else {
        const wantRight = exit.side === "right" && b.gx > a.gx;
        const wantLeft = exit.side === "left" && b.gx < a.gx;
        const wantDown = exit.side === "bottom" && b.gy > a.gy;
        const wantUp = exit.side === "top" && b.gy < a.gy;
        if (!(wantRight || wantLeft || wantDown || wantUp)) {
          add(
            "error", def.id, "map-direction",
            `${label}: exit points '${exit.side}' but the target sits at ` +
              `gx${b.gx},gy${b.gy} relative to gx${a.gx},gy${a.gy}`,
          );
        }
      }
    }

    /* ---------------- spawns ---------------- */
    spawns.forEach((s, i) => {
      if (!GROUNDED_SPAWNS.has(s.kind)) return;
      const feet = s.y;
      if (rectHitsSolid(map, s.x - PW / 2, feet - PH, PW, PH)) {
        add("warn", def.id, "spawn-in-solid", `spawn #${i} '${s.kind}' at (${s.x},${feet}) is inside solid tiles`);
      }
      const drop = dropToSupport(map, s.x, feet);
      if (drop === null) {
        add("error", def.id, "spawn-void", `spawn #${i} '${s.kind}' at (${s.x},${feet}) has no ground below`);
      } else if (drop > 4 * TILE) {
        add("warn", def.id, "spawn-floating", `spawn #${i} '${s.kind}' at (${s.x},${feet}) floats ${drop}px up`);
      }
    });

    /* ---------------- warp pads ---------------- */
    if (WARP_CYCLE.includes(def.id)) {
      const pad = WARP_PADS[def.id];
      if (!pad) {
        add("error", def.id, "warp-nopad", `room is in WARP_CYCLE but has no WARP_PADS entry`);
      } else {
        const marker = spawns.find((s) => s.kind === "warp");
        if (!marker) {
          add("error", def.id, "warp-nospawn", `WARP_PADS entry exists but no 'warp' spawn in the room`);
        } else if (Math.abs(marker.x - pad.x) > 8 || Math.abs(marker.y - pad.y) > 8) {
          add(
            "error", def.id, "warp-mismatch",
            `WARP_PADS (${pad.x},${pad.y}) does not match the pad spawn (${marker.x},${marker.y})`,
          );
        }
        if (rectHitsSolid(map, pad.x - PW / 2, pad.y - PH, PW, PH)) {
          add("error", def.id, "warp-in-solid", `warp landing (${pad.x},${pad.y}) is inside solid tiles`);
        }
        const drop = dropToSupport(map, pad.x, pad.y);
        if (drop === null || drop > 8) {
          add("error", def.id, "warp-airborne", `warp landing (${pad.x},${pad.y}) is not on solid ground`);
        }
      }
    }
  }

  /* ---------------- global minimap layout ---------------- */
  const defs = Object.values(ROOMS);
  for (let i = 0; i < defs.length; i++) {
    for (let j = i + 1; j < defs.length; j++) {
      const a = defs[i].mapRect;
      const b = defs[j].mapRect;
      if (a.gx < b.gx + b.gw && b.gx < a.gx + a.gw && a.gy < b.gy + b.gh && b.gy < a.gy + a.gh) {
        add("error", defs[i].id, "map-overlap", `minimap footprint overlaps ${defs[j].id}`);
      }
    }
  }

  // Connectivity: every room reachable from START by exits alone.
  const seen = new Set<string>(["entrance"]);
  const queue = ["entrance"];
  while (queue.length) {
    const cur = ROOMS[queue.shift()!];
    for (const e of cur.exits) {
      if (!seen.has(e.target)) {
        seen.add(e.target);
        queue.push(e.target);
      }
    }
  }
  for (const def of defs) {
    if (!seen.has(def.id)) add("error", def.id, "unreachable", `not reachable from the start room`);
  }

  return issues;
}

/** Console-friendly report. Returns the issue list too. */
export function reportMap(): MapIssue[] {
  const issues = validateMap();
  const errors = issues.filter((i) => i.severity === "error");
  const warns = issues.filter((i) => i.severity === "warn");
  console.log(`Map validation: ${errors.length} error(s), ${warns.length} warning(s)`);
  for (const i of issues) {
    console.log(`  [${i.severity}] ${i.room} (${i.code}): ${i.message}`);
  }
  return issues;
}
