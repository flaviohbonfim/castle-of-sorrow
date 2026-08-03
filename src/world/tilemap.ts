import { TILE, TileId, buildTileset } from "../gfx/tiles";

export class Tilemap {
  readonly widthPx: number;
  readonly heightPx: number;
  private tileset = buildTileset();

  constructor(
    readonly cols: number,
    readonly rows: number,
    private tiles: Uint8Array, // TileId per cell
  ) {
    this.widthPx = cols * TILE;
    this.heightPx = rows * TILE;
  }

  at(col: number, row: number): TileId {
    if (col < 0 || col >= this.cols) return TileId.Brick; // solid outside horizontally
    if (row < 0) return TileId.Empty;
    if (row >= this.rows) return TileId.Empty; // open below: room exits fall through
    return this.tiles[row * this.cols + col] as TileId;
  }

  setTile(col: number, row: number, id: TileId): void {
    if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
      this.tiles[row * this.cols + col] = id;
    }
  }

  isSolid(col: number, row: number): boolean {
    const t = this.at(col, row);
    return (
      t === TileId.Brick ||
      t === TileId.FloorTop ||
      t === TileId.PillarTop ||
      t === TileId.Pillar ||
      t === TileId.PillarBase ||
      t === TileId.Cracked ||
      t === TileId.Gate
    );
  }

  isOneWay(col: number, row: number): boolean {
    return this.at(col, row) === TileId.Platform;
  }

  /** Any flooded cell (body + surface). Non-solid. */
  isWater(col: number, row: number): boolean {
    const t = this.at(col, row);
    return t === TileId.Water || t === TileId.WaterTop;
  }

  /** Surface row only — used for Water Walking one-way landings. */
  isWaterTop(col: number, row: number): boolean {
    return this.at(col, row) === TileId.WaterTop;
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, viewW: number, viewH: number): void {
    const c0 = Math.max(0, Math.floor(camX / TILE));
    const c1 = Math.min(this.cols - 1, Math.ceil((camX + viewW) / TILE));
    const r0 = Math.max(0, Math.floor(camY / TILE));
    const r1 = Math.min(this.rows - 1, Math.ceil((camY + viewH) / TILE));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = this.at(c, r);
        if (t === TileId.Empty) continue;
        const variants = this.tileset.get(t);
        if (!variants) continue;
        // WaterTop alternates by column for a static ripple strip.
        const img =
          t === TileId.WaterTop
            ? variants[c % variants.length]
            : variants[(c * 7 + r * 13) % variants.length];
        ctx.drawImage(img, c * TILE - camX, r * TILE - camY);
      }
    }
  }
}
