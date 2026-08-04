import { VIEW_W, VIEW_H } from "../engine/renderer";
import { PAL } from "../gfx/palette";
import { audio } from "../engine/audio";
import { t } from "../data/i18n";
import type { Game } from "../game";

interface ShopEntry {
  itemId?: string; // regular item purchase
  relicId?: string; // one-time relic purchase
  name: string;
  price: number;
}

const STOCK: ShopEntry[] = [
  { itemId: "potion", name: "Potion", price: 30 },
  { itemId: "highPotion", name: "High Potion", price: 80 },
  { itemId: "manaPrism", name: "Mana Prism", price: 60 },
  { itemId: "roastBeef", name: "Roast Beef", price: 50 },
  { itemId: "ironShield", name: "Iron Shield", price: 120 },
  { itemId: "leatherCap", name: "Leather Cap", price: 90 },
  { itemId: "heartBrooch", name: "Heart Brooch", price: 150 },
  { itemId: "moonRing", name: "Moon Ring", price: 180 },
  { relicId: "mistForm", name: "Power of the Mist", price: 250 },
];

/** The Hermit's shop overlay: arrows navigate, X buys, Tab closes. */
export class ShopUI {
  open = false;
  private cursor = 0;

  private stock(game: Game): ShopEntry[] {
    return STOCK.filter((e) => !e.relicId || !game.flags.has(`relic:${e.relicId}`));
  }

  toggle(): void {
    this.open = !this.open;
    this.cursor = 0;
  }

  update(game: Game): void {
    const input = game.input;
    if (input.pressed("menu") || input.pressed("jump")) {
      input.consume("menu");
      input.consume("jump");
      this.open = false;
      return;
    }
    const list = this.stock(game);
    if (input.pressed("down")) {
      input.consume("down");
      this.cursor = (this.cursor + 1) % list.length;
    }
    if (input.pressed("up")) {
      input.consume("up");
      this.cursor = (this.cursor - 1 + list.length) % list.length;
    }
    if (input.pressed("attack")) {
      input.consume("attack");
      this.buy(game, list[this.cursor]);
    }
  }

  /** Coral quest reward: 20% discount when `quest:coral:done` is set. */
  private priceOf(game: Game, base: number): number {
    const mult = game.flags.has("quest:coral:done") ? 0.8 : 1;
    return Math.max(1, Math.floor(base * mult));
  }

  private buy(game: Game, entry: ShopEntry | undefined): void {
    if (!entry) return;
    const p = game.player;
    const price = this.priceOf(game, entry.price);
    if (p.inventory.gold < price) {
      audio.play("hurt");
      return;
    }
    p.inventory.gold -= price;
    if (entry.relicId) {
      p.relics.add(entry.relicId);
      game.flags.add(`relic:${entry.relicId}`);
      audio.play("levelup");
      this.cursor = 0;
    } else if (entry.itemId) {
      p.inventory.add(entry.itemId);
      audio.play("pickup");
    }
  }

  draw(ctx: CanvasRenderingContext2D, game: Game): void {
    const p = game.player;
    const list = this.stock(game);
    const discount = game.flags.has("quest:coral:done");
    ctx.save();
    ctx.fillStyle = "rgba(6, 4, 14, 0.85)";
    ctx.fillRect(60, 30, VIEW_W - 120, VIEW_H - 70);
    ctx.strokeStyle = PAL.uiFrame;
    ctx.strokeRect(60.5, 30.5, VIEW_W - 121, VIEW_H - 71);
    ctx.font = "8px 'Courier New', monospace";

    ctx.fillStyle = PAL.textGold;
    ctx.fillText(discount ? t("shop.titleFriend") : t("shop.title"), 76, 46);
    ctx.textAlign = "right";
    ctx.fillText(`$ ${p.inventory.gold}`, VIEW_W - 76, 46);
    ctx.textAlign = "left";

    list.forEach((e, i) => {
      const sel = this.cursor === i;
      const price = this.priceOf(game, e.price);
      const afford = p.inventory.gold >= price;
      ctx.fillStyle = sel ? PAL.textGold : afford ? PAL.textWhite : PAL.uiFrameDark;
      ctx.fillText(
        `${sel ? ">" : " "}${e.name}${e.relicId ? ` ${t("shop.relic")}` : ""}`,
        76,
        62 + i * 12,
      );
      ctx.textAlign = "right";
      ctx.fillText(`$${price}`, VIEW_W - 76, 62 + i * 12);
      ctx.textAlign = "left";
    });

    ctx.fillStyle = PAL.uiFrame;
    ctx.fillText(t("shop.hint"), 76, VIEW_H - 48);
    ctx.restore();
  }
}
