import { VIEW_W, VIEW_H, makeSurface } from "../engine/renderer";

let overlay: HTMLCanvasElement | null = null;

/** Pre-bake a 2px-period translucent scanline pattern once. */
function buildOverlay(): HTMLCanvasElement {
  const [c, ctx] = makeSurface(VIEW_W, VIEW_H);
  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  for (let y = 0; y < VIEW_H; y += 2) {
    ctx.fillRect(0, y, VIEW_W, 1);
  }
  // Slight vignette warmth on the lines
  ctx.fillStyle = "rgba(20, 10, 40, 0.06)";
  for (let y = 1; y < VIEW_H; y += 2) {
    ctx.fillRect(0, y, VIEW_W, 1);
  }
  return c;
}

/** Draw CRT-ish scanlines over the finished frame when enabled. */
export function drawScanlines(ctx: CanvasRenderingContext2D): void {
  overlay ??= buildOverlay();
  ctx.drawImage(overlay, 0, 0);
}
