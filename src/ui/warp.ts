import { VIEW_W, VIEW_H } from "../engine/renderer";
import { PAL } from "../gfx/palette";
import { audio } from "../engine/audio";
import { ROOMS, WARP_CYCLE, WARP_PADS } from "../world/rooms";
import type { Game } from "../game";

interface WarpDest {
  room: string;
  name: string;
  x: number;
  y: number;
}

/**
 * Warp destination picker (world-freeze). Shown when there are 3+ pads so
 * the player can choose instead of auto-cycling.
 */
export class WarpUI {
  open = false;
  private cursor = 0;
  private dests: WarpDest[] = [];

  /** Build the list from every cycle pad except the current room. */
  show(fromRoom: string): void {
    this.dests = WARP_CYCLE.filter((id) => id !== fromRoom && WARP_PADS[id]).map((id) => ({
      room: id,
      name: ROOMS[id]?.name ?? id,
      x: WARP_PADS[id].x,
      y: WARP_PADS[id].y,
    }));
    this.cursor = 0;
    this.open = this.dests.length > 0;
  }

  close(): void {
    this.open = false;
  }

  update(game: Game): void {
    const input = game.input;
    if (input.pressed("menu") || input.pressed("backdash")) {
      input.consume("menu");
      input.consume("backdash");
      this.close();
      return;
    }
    if (this.dests.length === 0) {
      this.close();
      return;
    }
    if (input.pressed("down")) {
      input.consume("down");
      this.cursor = (this.cursor + 1) % this.dests.length;
    }
    if (input.pressed("up")) {
      input.consume("up");
      this.cursor = (this.cursor - 1 + this.dests.length) % this.dests.length;
    }
    if (input.pressed("attack") || input.pressed("jump")) {
      input.consume("attack");
      input.consume("jump");
      const d = this.dests[this.cursor];
      this.close();
      if (d) {
        audio.play("spell");
        game.loadRoom(d.room, d.x, d.y);
        game.camera.addShake(0.3);
        game.player.iframes = Math.max(game.player.iframes, 30);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = "rgba(6, 4, 14, 0.78)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const boxW = 220;
    const boxH = 40 + this.dests.length * 16;
    const x = (VIEW_W - boxW) / 2;
    const y = (VIEW_H - boxH) / 2;
    ctx.fillStyle = "rgba(16, 10, 28, 0.95)";
    ctx.fillRect(x, y, boxW, boxH);
    ctx.strokeStyle = PAL.uiFrame;
    ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);

    ctx.font = "8px 'Courier New', monospace";
    ctx.fillStyle = PAL.textGold;
    ctx.fillText("— WARP —", x + 12, y + 16);
    ctx.fillStyle = PAL.uiFrame;
    ctx.fillText("↑↓ select   X/Z confirm   Esc cancel", x + 12, y + boxH - 10);

    this.dests.forEach((d, i) => {
      const sel = i === this.cursor;
      ctx.fillStyle = sel ? PAL.textGold : PAL.textWhite;
      ctx.fillText(`${sel ? ">" : " "} ${d.name}`, x + 16, y + 36 + i * 16);
    });
    ctx.restore();
  }
}
