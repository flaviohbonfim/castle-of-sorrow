export const VIEW_W = 480;
export const VIEW_H = 270;

/**
 * Pixel-perfect renderer: the game draws into a fixed 480x270 backbuffer which
 * is integer-scaled up to the window. All world drawing uses whole pixels.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  constructor(root: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;
    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas not supported");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    root.appendChild(this.canvas);

    const resize = () => {
      const scale = Math.max(
        1,
        Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)),
      );
      this.canvas.style.width = `${VIEW_W * scale}px`;
      this.canvas.style.height = `${VIEW_H * scale}px`;
    };
    window.addEventListener("resize", resize);
    resize();
  }
}

/** Offscreen canvas helper for procedural sprite/tile generation. */
export function makeSurface(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}
