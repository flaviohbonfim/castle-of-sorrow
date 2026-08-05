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
import { TILE } from "./tiles";

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

  // Far crimson curtain panels (depth plane)
  for (let i = 0; i < 10; i++) {
    const x = 40 + i * Math.floor(w / 10);
    const panelW = 28 + (i % 3) * 4;
    const open = i >= 3 && i <= 6;
    if (open) continue; // open center for fight readability
    ctx.fillStyle = i % 2 === 0 ? "#4a1018" : "#381018";
    ctx.fillRect(x, 12, panelW, h - 56);
    ctx.fillStyle = "#6a1828";
    ctx.fillRect(x + 3, 12, 3, h - 56);
    ctx.fillStyle = "#1a080c";
    ctx.fillRect(x + panelW - 4, 12, 2, h - 56);
  }

  // Tall arched window recesses (mid plane)
  const winY = 28;
  const winH = 56;
  const winW = 22;
  for (const wx of [72, 200, 340, 480, 620]) {
    if (wx > w - 40) continue;
    // recess
    ctx.fillStyle = "#0a0c14";
    ctx.fillRect(wx, winY + 8, winW, winH - 8);
    // arch top
    ctx.beginPath();
    ctx.ellipse(wx + winW / 2, winY + 14, winW / 2, 12, 0, Math.PI, 0);
    ctx.fill();
    // glass
    ctx.fillStyle = "#1a1850";
    ctx.fillRect(wx + 3, winY + 14, winW - 6, winH - 22);
    ctx.fillStyle = "#2a2880";
    ctx.fillRect(wx + 5, winY + 18, winW - 10, 10);
    // mullion
    ctx.fillStyle = stoneL;
    ctx.fillRect(wx + winW / 2 - 1, winY + 12, 2, winH - 18);
    // moon glow
    ctx.fillStyle = "rgba(220, 220, 255, 0.35)";
    ctx.fillRect(wx + 6, winY + 20, 5, 5);
    // stone frame
    ctx.strokeStyle = stoneM;
    ctx.lineWidth = 2;
    ctx.strokeRect(wx + 1, winY + 10, winW - 2, winH - 14);
  }

  // Painted pillar silhouettes (far, low contrast) — real solid pillars are tiles
  ctx.globalAlpha = 0.35;
  for (const px of [110, 280, 450, 610]) {
    if (px > w - 20) continue;
    ctx.fillStyle = stoneL;
    ctx.fillRect(px, 48, 10, h - 100);
    ctx.fillRect(px - 2, 48, 14, 6);
    ctx.fillRect(px - 3, h - 56, 16, 8);
  }
  ctx.globalAlpha = 1;

  // Upper valence / ceiling shadow
  const ceil = ctx.createLinearGradient(0, 0, 0, 40);
  ceil.addColorStop(0, "#08060a");
  ceil.addColorStop(1, "rgba(8,6,10,0)");
  ctx.fillStyle = ceil;
  ctx.fillRect(0, 0, w, 40);

  // Floor shadow band (depth at feet — actual FloorTop tiles draw on top)
  const floorY = h - 3 * TILE;
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
