import type { Body } from "../world/collision";
import type { Game } from "../game";
import { lerp } from "../engine/math";

export type Facing = 1 | -1;

export abstract class Entity {
  body: Body;
  facing: Facing = 1;
  dead = false;
  protected prevX: number;
  protected prevY: number;

  constructor(x: number, y: number, w: number, h: number) {
    this.body = { x, y, w, h, vx: 0, vy: 0, onGround: false };
    this.prevX = x;
    this.prevY = y;
  }

  /** Call at the top of update to record the interpolation baseline. */
  protected savePrev(): void {
    this.prevX = this.body.x;
    this.prevY = this.body.y;
  }

  renderX(alpha: number): number {
    return lerp(this.prevX, this.body.x, alpha);
  }

  renderY(alpha: number): number {
    return lerp(this.prevY, this.body.y, alpha);
  }

  get centerX(): number {
    return this.body.x + this.body.w / 2;
  }

  get centerY(): number {
    return this.body.y + this.body.h / 2;
  }

  abstract update(game: Game): void;
  abstract draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, alpha: number): void;
}
