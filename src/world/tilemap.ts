import { TILE, TileId, buildTileset, type ZoneId } from "../gfx/tiles";

export class Tilemap {
  readonly widthPx: number;
  readonly heightPx: number;
  private tileset: Map<TileId, HTMLCanvasElement[]>;

  constructor(
    readonly cols: number,
    readonly rows: number,
    private tiles: Uint8Array, // TileId per cell
    zone: ZoneId = "castle",
  ) {
    this.widthPx = cols * TILE;
    this.heightPx = rows * TILE;
    this.tileset = buildTileset(zone);
  }

  at(col: number, row: number): TileId {
    // Outside left/right: solid Brick, EXCEPT at rows where the edge column
    // is a Door — so wide forms (wolf/bat) can walk through the passage
    // far enough to trigger room transitions. Gates stay solid (mist only).
    if (col < 0 || col >= this.cols) {
      const edge = col < 0 ? 0 : this.cols - 1;
      if (row >= 0 && row < this.rows) {
        const edgeTile = this.tiles[row * this.cols + edge] as TileId;
        if (edgeTile === TileId.Door) return TileId.Empty;
      }
      return TileId.Brick;
    }
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

  /** Door / Gate stacks — top / mid / bot for vertical arch drawing. */
  private isPassage(col: number, row: number): boolean {
    const t = this.at(col, row);
    return t === TileId.Door || t === TileId.Gate;
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, viewW: number, viewH: number): void {
    const c0 = Math.max(0, Math.floor(camX / TILE));
    const c1 = Math.min(this.cols - 1, Math.ceil((camX + viewW) / TILE));
    const r0 = Math.max(0, Math.floor(camY / TILE));
    const r1 = Math.min(this.rows - 1, Math.ceil((camY + viewH) / TILE));
    const bgWall = this.tileset.get(TileId.BgWall);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = this.at(c, r);
        if (t === TileId.Empty) continue;
        const variants = this.tileset.get(t);
        if (!variants) continue;
        const dx = c * TILE - camX;
        const dy = r * TILE - camY;
        // Platform / pillar sprites only paint part of the 16×16 cell (thin lip
        // or center column). Without a wall underlay the transparent pixels
        // punch through to the parallax sky — looks like accidental "windows".
        if (
          bgWall &&
          (t === TileId.Platform ||
            t === TileId.PillarTop ||
            t === TileId.Pillar ||
            t === TileId.PillarBase)
        ) {
          const under = bgWall[(c * 7 + r * 13) % bgWall.length];
          ctx.drawImage(under, dx, dy);
        }
        let img: HTMLCanvasElement;
        if (t === TileId.Door && variants.length >= 3) {
          // 0=arch top, 1=mid, 2=threshold — pick from vertical neighbors.
          const above = this.isPassage(c, r - 1);
          const below = this.isPassage(c, r + 1);
          const vi = !above && below ? 0 : above && !below ? 2 : 1;
          img = variants[vi];
        } else if (t === TileId.WaterTop) {
          img = variants[c % variants.length];
        } else {
          img = variants[(c * 7 + r * 13) % variants.length];
        }
        ctx.drawImage(img, dx, dy);
      }
    }
  }
}
