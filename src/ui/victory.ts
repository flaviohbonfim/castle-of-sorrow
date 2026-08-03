import { VIEW_W, VIEW_H } from "../engine/renderer";
import { PAL } from "../gfx/palette";
import { computeCompletion, formatPlayTime } from "../rpg/completion";
import type { Game } from "../game";

/**
 * Victory overlay after the final boss. World stays frozen.
 * Attack = New Game+ (keep gear/relics, harder foes); Jump = soft reset.
 */
export class VictoryUI {
  open = false;

  show(): void {
    this.open = true;
  }

  update(game: Game): void {
    if (!this.open) return;
    const input = game.input;
    if (input.pressed("attack")) {
      input.consume("attack");
      game.startNewGamePlus();
      this.open = false;
    }
    if (input.pressed("jump") || input.pressed("menu")) {
      input.consume("jump");
      input.consume("menu");
      game.startFreshRun();
      this.open = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D, game: Game): void {
    if (!this.open) return;
    const c = computeCompletion(game.flags);
    ctx.save();
    ctx.fillStyle = "rgba(4, 2, 12, 0.88)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.strokeStyle = PAL.textGold;
    ctx.strokeRect(40.5, 36.5, VIEW_W - 81, VIEW_H - 73);

    ctx.font = "10px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = PAL.textGold;
    ctx.fillText("— CASTLE OF SORROW —", VIEW_W / 2, 60);
    ctx.fillStyle = PAL.textWhite;
    ctx.fillText("THE NIGHT YIELDS", VIEW_W / 2, 78);

    ctx.font = "8px 'Courier New', monospace";
    ctx.fillStyle = PAL.uiFrame;
    const lines = [
      `Time   ${formatPlayTime(game.playTicks)}`,
      `Deaths ${game.deaths}`,
      `Clear  ${c.percent}%`,
      "",
      `Rooms  ${c.visited}/${c.visitedTotal}`,
      `Relics ${c.relics}/${c.relicsTotal}`,
      `Bosses ${c.bosses}/${c.bossesTotal}`,
    ];
    lines.forEach((l, i) => {
      ctx.fillStyle = i < 3 ? PAL.textWhite : PAL.uiFrame;
      ctx.fillText(l, VIEW_W / 2, 108 + i * 14);
    });

    ctx.fillStyle = PAL.textGold;
    ctx.fillText("X  New Game+ (keep relics, foes ×1.5)", VIEW_W / 2, VIEW_H - 56);
    ctx.fillStyle = PAL.uiFrame;
    ctx.fillText("Z / Tab  Return to Entrance", VIEW_W / 2, VIEW_H - 42);
    ctx.textAlign = "left";
    ctx.restore();
  }
}
