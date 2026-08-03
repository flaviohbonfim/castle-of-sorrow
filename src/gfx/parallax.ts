import { makeSurface, VIEW_W, VIEW_H } from "../engine/renderer";
import { PAL } from "./palette";

interface Layer {
  canvas: HTMLCanvasElement;
  factor: number; // scroll factor (0 = static, 1 = foreground speed)
  y: number;
  drift?: number; // autonomous horizontal drift in px/tick (clouds)
}

/**
 * Pre-rendered parallax layers: night sky + moon (static), drifting clouds,
 * distant castle towers, and a nearer arched gallery. Each layer tiles
 * horizontally and scrolls at its own factor for depth.
 */
export class ParallaxBackground {
  private layers: Layer[] = [];
  private sky: HTMLCanvasElement;
  private t = 0;

  constructor() {
    this.sky = this.buildSky();
    this.layers.push({ canvas: this.buildClouds(), factor: 0.05, y: 10, drift: 0.06 });
    this.layers.push({ canvas: this.buildFarTowers(), factor: 0.15, y: 40 });
    this.layers.push({ canvas: this.buildGallery(), factor: 0.35, y: VIEW_H - 150 });
  }

  update(): void {
    this.t++;
  }

  draw(ctx: CanvasRenderingContext2D, camX: number): void {
    ctx.drawImage(this.sky, 0, 0);
    for (const layer of this.layers) {
      const w = layer.canvas.width;
      const drift = (layer.drift ?? 0) * this.t;
      let off = ((camX * layer.factor + drift) % w + w) % w;
      for (let x = -off; x < VIEW_W; x += w) {
        ctx.drawImage(layer.canvas, Math.round(x), layer.y);
      }
    }
  }

  private buildSky(): HTMLCanvasElement {
    const [c, ctx] = makeSurface(VIEW_W, VIEW_H);
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, PAL.skyTop);
    grad.addColorStop(1, PAL.skyBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // Stars
    for (let i = 0; i < 90; i++) {
      const x = Math.floor(((i * 97) % VIEW_W) + Math.sin(i * 13) * 8);
      const y = Math.floor((i * 53) % (VIEW_H * 0.7));
      ctx.fillStyle = i % 5 === 0 ? "#c8c0e0" : "#605880";
      ctx.fillRect(x, y, 1, 1);
    }
    // Moon with glow
    const mx = VIEW_W - 90;
    const my = 48;
    ctx.fillStyle = PAL.moonGlow;
    ctx.beginPath();
    ctx.arc(mx, my, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.moon;
    ctx.beginPath();
    ctx.arc(mx, my, 17, 0, Math.PI * 2);
    ctx.fill();
    // Craters
    ctx.fillStyle = "#c8c4b0";
    ctx.fillRect(mx - 8, my - 4, 5, 4);
    ctx.fillRect(mx + 2, my + 5, 4, 3);
    ctx.fillRect(mx + 4, my - 9, 3, 3);
    return c;
  }

  private buildClouds(): HTMLCanvasElement {
    const [c, ctx] = makeSurface(520, 70);
    ctx.fillStyle = PAL.cloudDark;
    const blobs = [
      [20, 30, 90, 12], [60, 22, 60, 10], [200, 40, 120, 14], [250, 30, 70, 10],
      [400, 25, 90, 12], [440, 35, 60, 9],
    ];
    for (const [x, y, w, h] of blobs) {
      ctx.fillRect(x, y, w, h);
      ctx.fillRect(x + 8, y - 4, w - 20, 4);
    }
    return c;
  }

  private buildFarTowers(): HTMLCanvasElement {
    const [c, ctx] = makeSurface(560, 230);
    ctx.fillStyle = PAL.castleFar;
    // Silhouetted keep with towers and spires
    const towers = [
      [30, 90, 34], [90, 130, 26], [150, 60, 40], [240, 110, 30], [310, 80, 36],
      [400, 140, 24], [460, 70, 38],
    ];
    for (const [x, top, w] of towers) {
      ctx.fillRect(x, top, w, 230 - top);
      // Spire
      for (let i = 0; i < w / 2; i++) {
        ctx.fillRect(x + i, top - i, w - i * 2, 1);
      }
      // Lit windows
      ctx.fillStyle = "#4a3d2a";
      for (let wy = top + 20; wy < 200; wy += 28) {
        ctx.fillRect(x + w / 2 - 1, wy, 2, 4);
      }
      ctx.fillStyle = PAL.castleFar;
    }
    // Connecting wall
    ctx.fillRect(0, 170, 560, 60);
    return c;
  }

  private buildGallery(): HTMLCanvasElement {
    const [c, ctx] = makeSurface(240, 150);
    // Arched cloister silhouette, nearer and darker-blue
    ctx.fillStyle = PAL.castleMid;
    ctx.fillRect(0, 0, 240, 150);
    // Carve arches out (transparent)
    ctx.globalCompositeOperation = "destination-out";
    for (let ax = 20; ax < 240; ax += 60) {
      ctx.fillRect(ax, 40, 28, 80);
      ctx.beginPath();
      ctx.arc(ax + 14, 40, 14, Math.PI, 0);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    // Column highlights
    ctx.fillStyle = "#2e2448";
    for (let ax = 8; ax < 240; ax += 60) {
      ctx.fillRect(ax, 30, 3, 120);
    }
    return c;
  }
}
