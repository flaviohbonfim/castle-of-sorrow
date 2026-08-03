import { VIEW_W } from "../engine/renderer";
import { PAL } from "../gfx/palette";
import { ROOMS } from "../world/rooms";

const CELL = 5; // px per map-grid cell

/**
 * SotN-style corner minimap: one box per visited room, current room lit,
 * blinking dot for the player. Uses each RoomDef's mapRect footprint.
 * Supports negative gx/gy (tower wing above the main castle).
 */
export class Minimap {
  draw(ctx: CanvasRenderingContext2D, currentRoom: string, flags: Set<string>, tick: number): void {
    let minGx = 0;
    let minGy = 0;
    let maxGx = 0;
    let maxGy = 0;
    for (const def of Object.values(ROOMS)) {
      const { gx, gy, gw, gh } = def.mapRect;
      minGx = Math.min(minGx, gx);
      minGy = Math.min(minGy, gy);
      maxGx = Math.max(maxGx, gx + gw);
      maxGy = Math.max(maxGy, gy + gh);
    }
    const gridW = maxGx - minGx;
    const gridH = maxGy - minGy;
    const originX = VIEW_W - 10 - gridW * CELL;
    // Top-right corner free of HUD chrome (Phase 8.6 B).
    const originY = 6;

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(10, 6, 20, 0.7)";
    ctx.fillRect(originX - 3, originY - 3, gridW * CELL + 6, gridH * CELL + 6);

    for (const def of Object.values(ROOMS)) {
      if (!flags.has(`visited:${def.id}`)) continue;
      const { gx, gy, gw, gh } = def.mapRect;
      const x = originX + (gx - minGx) * CELL;
      const y = originY + (gy - minGy) * CELL;
      const isCurrent = def.id === currentRoom;
      ctx.fillStyle = isCurrent ? "#4a3a6e" : "#241c3c";
      ctx.fillRect(x, y, gw * CELL - 1, gh * CELL - 1);
      ctx.strokeStyle = PAL.uiFrame;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, gw * CELL - 2, gh * CELL - 2);
      if (isCurrent && tick % 40 < 25) {
        ctx.fillStyle = PAL.textWhite;
        ctx.fillRect(x + (gw * CELL) / 2 - 1, y + (gh * CELL) / 2 - 1, 2, 2);
      }
    }
    ctx.restore();
  }
}
