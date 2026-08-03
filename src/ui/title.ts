import { VIEW_W, VIEW_H } from "../engine/renderer";
import { PAL } from "../gfx/palette";
import { audio } from "../engine/audio";
import type { Input } from "../engine/input";
import { ParallaxBackground } from "../gfx/parallax";
import { anySlotUsed } from "../rpg/saveSlots";

export type TitleChoice = "new" | "load";

interface Item {
  choice: TitleChoice;
  label: string;
}

const ITEMS: Item[] = [
  { choice: "new", label: "NEW GAME" },
  { choice: "load", label: "LOAD GAME" },
];

/**
 * Title screen — drifting parallax castle, procedural logotype, menu.
 * Owned by the App, so it exists before any Game does.
 */
export class TitleScreen {
  private cursor = 0;
  private age = 0;
  private parallax = new ParallaxBackground();
  private hasSaves = false;
  private vignette: CanvasGradient | null = null;

  /** Re-read slot state whenever we come back to the title. */
  refresh(): void {
    this.hasSaves = anySlotUsed();
    // Always land on the first entry so returning to the title is predictable.
    this.cursor = 0;
    this.age = 0;
  }

  private enabled(i: number): boolean {
    return ITEMS[i].choice !== "load" || this.hasSaves;
  }

  /** Returns a choice on confirm, else null. */
  update(input: Input): TitleChoice | null {
    this.age++;
    this.parallax.update();

    if (input.pressed("down")) {
      input.consume("down");
      this.cursor = (this.cursor + 1) % ITEMS.length;
      audio.play("pickup");
    }
    if (input.pressed("up")) {
      input.consume("up");
      this.cursor = (this.cursor - 1 + ITEMS.length) % ITEMS.length;
      audio.play("pickup");
    }
    if (input.pressed("attack") || input.pressed("jump")) {
      input.consume("attack");
      input.consume("jump");
      if (!this.enabled(this.cursor)) {
        audio.play("hurt");
        return null;
      }
      audio.play("heart");
      return ITEMS[this.cursor].choice;
    }
    return null;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // Slow drift so the castle keeps moving behind the logo.
    this.parallax.draw(ctx, this.age * 0.25);

    ctx.save();
    // Darken so the type reads over the artwork.
    ctx.fillStyle = "rgba(6, 4, 14, 0.55)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (!this.vignette) {
      this.vignette = ctx.createRadialGradient(
        VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35,
        VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.95,
      );
      this.vignette.addColorStop(0, "rgba(0,0,0,0)");
      this.vignette.addColorStop(1, "rgba(4,2,10,0.65)");
    }
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Logotype.
    ctx.textAlign = "center";
    ctx.font = "20px 'Courier New', monospace";
    ctx.fillStyle = "#000000";
    ctx.fillText("CASTLE OF", VIEW_W / 2 + 2, 74);
    ctx.fillText("SORROW", VIEW_W / 2 + 2, 98);
    ctx.fillStyle = PAL.textGold;
    ctx.fillText("CASTLE OF", VIEW_W / 2, 72);
    ctx.fillText("SORROW", VIEW_W / 2, 96);

    // Gothic rule under the title.
    ctx.fillStyle = PAL.uiFrame;
    ctx.fillRect(VIEW_W / 2 - 80, 108, 160, 1);
    ctx.fillRect(VIEW_W / 2 - 3, 105, 6, 6);

    ctx.font = "8px 'Courier New', monospace";
    ctx.fillStyle = PAL.uiFrame;
    ctx.fillText("a nocturne in six hundred years", VIEW_W / 2, 124);

    // Menu.
    ITEMS.forEach((item, i) => {
      const sel = this.cursor === i;
      const on = this.enabled(i);
      const y = 168 + i * 22;
      ctx.fillStyle = !on ? PAL.uiFrameDark : sel ? PAL.textGold : PAL.textWhite;
      const blink = sel && Math.floor(this.age / 20) % 2 === 0;
      ctx.fillText(`${blink ? "» " : "  "}${item.label}${blink ? " «" : "  "}`, VIEW_W / 2, y);
    });

    ctx.fillStyle = PAL.uiFrameDark;
    ctx.fillText("↑↓ choose    X confirm", VIEW_W / 2, VIEW_H - 24);
    ctx.textAlign = "left";
    ctx.restore();
  }
}
