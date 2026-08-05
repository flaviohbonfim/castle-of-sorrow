/**
 * Per-room painted backdrops (Strategy C).
 *
 * When a room has a backdrop, the tilemap skips decorative fill (BgWall /
 * BgWindow) so depth comes from one continuous image — SotN boss-hall style —
 * while FloorTop / Brick / pillars / doors still provide collision and the
 * walkable surface.
 *
 * Override: manifest key `backdrop.<roomId>` (single frame). Missing key →
 * procedural builder when one exists, else null (normal tiled look).
 */
import { makeSurface } from "../engine/renderer";
import { getSheet } from "./assets";
import { PAL } from "./palette";
import {
  THRONE_BAY_EDGES,
  THRONE_FLOOR_Y,
  THRONE_PIER_W,
  THRONE_PIER_XS,
} from "./throneLayout";

export type Frame = HTMLCanvasElement;

// Rooms are re-entered constantly; backdrops are static, so build each once.
const cache = new Map<string, Frame | null>();

/** Resolve backdrop for a room id — override PNG first, then procedural. */
export function resolveRoomBackdrop(
  roomId: string,
  widthPx: number,
  heightPx: number,
): Frame | null {
  const cached = cache.get(roomId);
  if (cached !== undefined) return cached;
  const frame = buildRoomBackdrop(roomId, widthPx, heightPx);
  cache.set(roomId, frame);
  return frame;
}

function buildRoomBackdrop(
  roomId: string,
  widthPx: number,
  heightPx: number,
): Frame | null {
  const sheet = getSheet(`backdrop.${roomId}`);
  if (sheet && sheet.length > 0) {
    const src = sheet[0];
    if (src.width === widthPx && src.height === heightPx) return src;
    // Native-size art is the contract; stretching is a legacy fallback that
    // distorts pixels (non-integer, non-uniform scale).
    if (import.meta.env.DEV) {
      console.warn(
        `backdrop.${roomId}: ${src.width}×${src.height} != room ${widthPx}×${heightPx} — stretching (author art at native size)`,
      );
    }
    const [c, ctx] = makeSurface(widthPx, heightPx);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, widthPx, heightPx);
    return c;
  }
  if (roomId === "throne") return buildThroneBackdrop(widthPx, heightPx);
  return null;
}

/**
 * Procedural Throne of Night hall — continuous wall + depth, not tile noise.
 * Designed for ~48×16 rooms (768×256) but scales to any size.
 */
export function buildThroneBackdrop(w: number, h: number): Frame {
  const [c, ctx] = makeSurface(w, h);

  // Base: deep cool wall wash (behind everything)
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#0c1010");
  sky.addColorStop(0.45, "#141c18");
  sky.addColorStop(1, "#0a0e0c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Masonry: mid-size blocks (large looked like giant tiles on camera)
  const stoneD = PAL.towerStoneDark;
  const stoneM = PAL.towerStoneMid;
  const stoneL = PAL.towerStoneLight;
  const blockH = 12;
  const blockW = 22;
  for (let y = 6; y < h - 48; y += blockH) {
    const row = Math.floor(y / blockH);
    const off = row % 2 === 0 ? 0 : Math.floor(blockW / 2);
    for (let x = -blockW + off; x < w; x += blockW) {
      ctx.fillStyle = stoneM;
      ctx.fillRect(x, y, blockW - 1, blockH - 1);
      ctx.fillStyle = stoneD;
      ctx.fillRect(x, y + blockH - 2, blockW - 1, 1);
      ctx.fillRect(x + blockW - 2, y, 1, blockH - 1);
      ctx.fillStyle = stoneL;
      ctx.fillRect(x + 1, y + 1, blockW - 4, 1);
      // subtle mid mortar speck so walls don't feel flat
      if ((row + Math.floor(x / blockW)) % 3 === 0) {
        ctx.fillStyle = stoneD;
        ctx.fillRect(x + 4, y + 5, 2, 1);
      }
    }
  }

  // Five bays between the authored piers: glass / curtain / glass / curtain /
  // dais+canopy. Same constants the props and the generated art use.
  const floorY = Math.min(THRONE_FLOOR_Y, h - 2 * 16);
  for (let bay = 0; bay < THRONE_BAY_EDGES.length - 1; bay++) {
    const x0 = THRONE_BAY_EDGES[bay];
    const x1 = Math.min(THRONE_BAY_EDGES[bay + 1], w - 16);
    if (x1 - x0 < 40) continue;
    const cx = Math.floor((x0 + x1) / 2);
    if (bay === 1 || bay === 3 || bay === 4) {
      // Floor-length crimson curtain panel filling the bay center.
      const cw = Math.min(72, x1 - x0 - 48);
      ctx.fillStyle = bay === 4 ? "#4a1018" : "#381018";
      ctx.fillRect(cx - cw / 2, 16, cw, floorY - 16);
      ctx.fillStyle = "#6a1828";
      ctx.fillRect(cx - cw / 2 + 4, 16, 4, floorY - 16);
      ctx.fillRect(cx + cw / 2 - 12, 16, 3, floorY - 16);
      ctx.fillStyle = "#1a080c";
      ctx.fillRect(cx + cw / 2 - 4, 16, 4, floorY - 16);
    } else {
      // Twin-lancet stained-glass window centered in the bay.
      const winY = 28;
      const winH = 96;
      const winW = 56;
      const wx = cx - winW / 2;
      ctx.fillStyle = "#0a0c14";
      ctx.fillRect(wx, winY + 8, winW, winH - 8);
      ctx.beginPath();
      ctx.ellipse(cx, winY + 14, winW / 2, 12, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = "#1a1850";
      ctx.fillRect(wx + 4, winY + 14, winW - 8, winH - 24);
      ctx.fillStyle = "#2a2880";
      ctx.fillRect(wx + 7, winY + 20, winW - 14, 14);
      // central mullion makes it read as a twin lancet
      ctx.fillStyle = stoneL;
      ctx.fillRect(cx - 2, winY + 12, 4, winH - 20);
      ctx.fillStyle = "rgba(220, 220, 255, 0.35)";
      ctx.fillRect(wx + 9, winY + 26, 7, 7);
      ctx.strokeStyle = stoneM;
      ctx.lineWidth = 2;
      ctx.strokeRect(wx + 1, winY + 10, winW - 2, winH - 14);
    }
  }

  // Painted pier silhouettes on the authored centers (columns cover them,
  // but the fallback must still read right without prop overrides).
  ctx.globalAlpha = 0.35;
  for (const px of THRONE_PIER_XS) {
    if (px > w - 20) continue;
    const pw = THRONE_PIER_W - 8;
    ctx.fillStyle = stoneL;
    ctx.fillRect(px - pw / 2, 40, pw, floorY - 40);
    ctx.fillRect(px - pw / 2 - 3, 40, pw + 6, 6);
    ctx.fillRect(px - pw / 2 - 4, floorY - 8, pw + 8, 8);
  }
  ctx.globalAlpha = 1;

  // Upper valence / ceiling shadow
  const ceil = ctx.createLinearGradient(0, 0, 0, 40);
  ceil.addColorStop(0, "#08060a");
  ceil.addColorStop(1, "rgba(8,6,10,0)");
  ctx.fillStyle = ceil;
  ctx.fillRect(0, 0, w, 40);

  // Floor shadow band (depth at feet — actual FloorTop tiles draw on top)
  const floorG = ctx.createLinearGradient(0, floorY - 24, 0, h);
  floorG.addColorStop(0, "rgba(0,0,0,0)");
  floorG.addColorStop(0.4, "rgba(0,0,0,0.35)");
  floorG.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = floorG;
  ctx.fillRect(0, floorY - 24, w, h - (floorY - 24));

  // Red carpet strip suggestion (tiles/props still own gameplay floor)
  ctx.fillStyle = "#3a0c14";
  ctx.fillRect(64, h - 52, w - 128, 14);
  ctx.fillStyle = "#5a1420";
  ctx.fillRect(64, h - 50, w - 128, 3);
  ctx.fillStyle = "#a07020";
  ctx.fillRect(64, h - 52, w - 128, 1);

  // Side vignette for depth
  const vigL = ctx.createLinearGradient(0, 0, 48, 0);
  vigL.addColorStop(0, "rgba(0,0,0,0.55)");
  vigL.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = vigL;
  ctx.fillRect(0, 0, 48, h);
  const vigR = ctx.createLinearGradient(w, 0, w - 48, 0);
  vigR.addColorStop(0, "rgba(0,0,0,0.55)");
  vigR.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = vigR;
  ctx.fillRect(w - 48, 0, 48, h);

  return c;
}
