import { VIEW_W, VIEW_H } from "../engine/renderer";
import { PAL } from "../gfx/palette";
import { audio } from "../engine/audio";
import { dialoguePages, NPC_DEFS, npcName, type DialoguePages } from "../data/dialogues";
import { resolvePortraitSprites } from "../gfx/resolveSprites";
import { noticeText } from "../combat/damage";
import { t } from "../data/i18n";
import type { Game } from "../game";

let PORTRAITS: ReturnType<typeof resolvePortraitSprites> | null = null;

/**
 * Modal dialogue textbox — freezes the world while open.
 * Attack / Jump advances pages; closes on the last page.
 */
export class DialogueUI {
  open = false;
  private name = "";
  private portrait: "hermit" | "ghost" | "demon" = "hermit";
  private pages: DialoguePages = [];
  private page = 0;
  private dialogueId = "";
  private npcId: string | null = null;
  private openShopAfter = false;
  private age = 0;

  /**
   * Start a dialogue by NPC def id (resolves lines from flags/inventory)
   * or by raw dialogue id.
   */
  startFromNpc(game: Game, npcId: string): void {
    const def = NPC_DEFS[npcId];
    if (!def) return;
    const p = game.player;
    const hasItem = (id: string) => p.inventory.count(id) > 0;
    const dialogueId = def.pickDialogue(game.flags, hasItem);
    const pages = dialoguePages(dialogueId);
    if (!pages) return;
    this.name = npcName(def);
    this.portrait = def.portrait;
    this.pages = pages;
    this.page = 0;
    this.dialogueId = dialogueId;
    this.npcId = npcId;
    this.openShopAfter = !!def.openShopAfter;
    this.open = true;
    this.age = 0;
    audio.play("pickup");
  }

  startRaw(name: string, portrait: "hermit" | "ghost" | "demon", dialogueId: string): void {
    const pages = dialoguePages(dialogueId);
    if (!pages) return;
    this.name = name;
    this.portrait = portrait;
    this.pages = pages;
    this.page = 0;
    this.dialogueId = dialogueId;
    this.npcId = null;
    this.openShopAfter = false;
    this.open = true;
    this.age = 0;
  }

  update(game: Game): void {
    if (!this.open) return;
    this.age++;
    const input = game.input;
    // Advance on attack or jump; menu cancels without rewards.
    if (input.pressed("menu")) {
      input.consume("menu");
      this.close(game, false);
      return;
    }
    if (input.pressed("attack") || input.pressed("jump") || input.pressed("up")) {
      input.consume("attack");
      input.consume("jump");
      input.consume("up");
      if (this.page < this.pages.length - 1) {
        this.page++;
        audio.play("swing");
      } else {
        this.close(game, true);
      }
    }
  }

  private close(game: Game, completed: boolean): void {
    this.open = false;
    if (completed && this.npcId) {
      const def = NPC_DEFS[this.npcId];
      def?.onComplete?.(this.dialogueId, {
        flags: game.flags,
        hasItem: (id) => game.player.inventory.count(id) > 0,
        removeItem: (id) => game.player.inventory.remove(id),
        grantHeartMax: (n) => {
          const p = game.player;
          p.res.maxHp += n;
          p.res.hp = Math.min(p.res.maxHp, p.res.hp + n);
          game.texts.push(
            noticeText(p.centerX, p.body.y - 12, t("notice.maxHp", { n }), PAL.textGold),
          );
          audio.play("levelup");
          game.camera.addShake(0.25);
        },
      });
    }
    if (completed && this.openShopAfter) {
      game.openShop();
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.open) return;
    PORTRAITS ??= resolvePortraitSprites();
    const boxH = 72;
    const boxY = VIEW_H - boxH - 12;
    const boxX = 16;
    const boxW = VIEW_W - 32;

    ctx.save();
    // Dim world slightly
    ctx.fillStyle = "rgba(4, 2, 10, 0.35)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Textbox
    ctx.fillStyle = "rgba(12, 8, 22, 0.94)";
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = PAL.uiFrame;
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

    // Portrait frame
    const px = boxX + 8;
    const py = boxY + 10;
    ctx.fillStyle = PAL.barBack;
    ctx.fillRect(px - 1, py - 1, 34, 34);
    ctx.strokeStyle = PAL.uiFrameDark;
    ctx.strokeRect(px - 0.5, py - 0.5, 33, 33);
    const face = PORTRAITS[this.portrait];
    if (face) ctx.drawImage(face, px, py);

    // Name
    ctx.font = "8px 'Courier New', monospace";
    ctx.fillStyle = PAL.textGold;
    ctx.fillText(this.name, px + 40, boxY + 16);

    // Lines
    const lines = this.pages[this.page] ?? [];
    ctx.fillStyle = PAL.textWhite;
    lines.forEach((line, i) => {
      ctx.fillText(line, px + 40, boxY + 32 + i * 12);
    });

    // Advance hint (blink)
    if (this.age % 40 < 28) {
      ctx.fillStyle = PAL.uiFrame;
      const more = this.page < this.pages.length - 1;
      ctx.textAlign = "right";
      ctx.fillText(more ? "▼" : "×", boxX + boxW - 10, boxY + boxH - 10);
      ctx.textAlign = "left";
    }
    ctx.restore();
  }
}
