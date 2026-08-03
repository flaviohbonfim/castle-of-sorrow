import { VIEW_W, VIEW_H } from "../engine/renderer";
import { PAL } from "../gfx/palette";
import { computeCompletion, formatPlayTime } from "../rpg/completion";
import { ENDINGS, type EndingId } from "../data/endings";
import { LOCK_TICKS } from "./cutscene";
import type { Game } from "../game";

/**
 * Results screen — shown AFTER the ending cutscene, world still frozen.
 * X returns to the title, C starts New Game+. Shares the cutscene's input
 * lockout so a held attack can't blow straight through it.
 */
export class VictoryUI {
  open = false;
  private ending: EndingId = "true";
  private lock = 0;

  show(ending: EndingId = "true"): void {
    this.ending = ending;
    this.open = true;
    this.lock = LOCK_TICKS;
  }

  update(game: Game): void {
    if (!this.open) return;
    const input = game.input;
    if (this.lock > 0) {
      this.lock--;
      input.consume("attack");
      input.consume("jump");
      return;
    }
    if (input.pressed("attack")) {
      input.consume("attack");
      this.open = false;
      game.requestExitToTitle();
    }
    if (input.pressed("subweapon")) {
      input.consume("subweapon");
      this.open = false;
      game.startNewGamePlus();
    }
  }

  draw(ctx: CanvasRenderingContext2D, game: Game): void {
    if (!this.open) return;
    const c = computeCompletion(game.flags);
    const def = ENDINGS[this.ending];
    ctx.save();
    ctx.fillStyle = "rgba(4, 2, 12, 0.9)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.strokeStyle = PAL.textGold;
    ctx.strokeRect(40.5, 26.5, VIEW_W - 81, VIEW_H - 53);

    ctx.font = "10px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = PAL.textGold;
    ctx.fillText(def.name, VIEW_W / 2, 50);

    ctx.font = "8px 'Courier New', monospace";
    ctx.fillStyle = PAL.uiFrame;
    ctx.fillText(def.note, VIEW_W / 2, 64);

    const lines = [
      `Time   ${formatPlayTime(game.playTicks)}`,
      `Deaths ${game.deaths}`,
      `Clear  ${c.percent}%`,
      "",
      `Rooms  ${c.visited}/${c.visitedTotal}`,
      `Relics ${c.relics}/${c.relicsTotal}`,
      `Bosses ${c.bosses}/${c.bossesTotal}`,
      `Items  ${c.items}/${c.itemsTotal}`,
    ];
    lines.forEach((l, i) => {
      ctx.fillStyle = i < 3 ? PAL.textWhite : PAL.uiFrame;
      ctx.fillText(l, VIEW_W / 2, 88 + i * 12);
    });

    if (this.lock === 0) {
      ctx.fillStyle = PAL.textGold;
      ctx.fillText("X  Return to title", VIEW_W / 2, VIEW_H - 44);
      ctx.fillStyle = PAL.uiFrame;
      ctx.fillText("C  New Game+ (keep relics, foes ×1.5)", VIEW_W / 2, VIEW_H - 32);
    }
    ctx.textAlign = "left";
    ctx.restore();
  }
}
