import { VIEW_W, VIEW_H } from "../engine/renderer";
import { PAL } from "../gfx/palette";
import { SCENES } from "../gfx/scenes";
import { ENDINGS, type EndingId, type EndingPanel } from "../data/endings";
import { audio } from "../engine/audio";
import type { Game } from "../game";

const FADE_IN = 20;
const FADE_OUT = 16;
const TICKS_PER_CHAR = 2;
/**
 * Confirm inputs are ignored for this long after the cutscene opens.
 * The final boss dies with `attack` still held and buffered, which used to
 * dismiss the whole ending on the same frame it appeared.
 */
export const LOCK_TICKS = 45;

type Phase = "fadeIn" | "typing" | "hold" | "fadeOut";

/**
 * Illustrated ending: full-screen procedural panels, typewriter narration,
 * fades between them. Freezes the world (Game checks `.open` first).
 */
export class CutsceneUI {
  open = false;
  private ending: EndingId = "true";
  private panels: EndingPanel[] = [];
  private index = 0;
  private phase: Phase = "fadeIn";
  private phaseAge = 0;
  /** Ticks since the panel appeared — drives the scene animation. */
  private sceneAge = 0;
  private lock = 0;

  play(game: Game, ending: EndingId): void {
    this.ending = ending;
    this.panels = ENDINGS[ending].panels;
    this.index = 0;
    this.phase = "fadeIn";
    this.phaseAge = 0;
    this.sceneAge = 0;
    this.open = true;
    this.armLock(game);
  }

  /** Swallow any buffered confirm and hold them off for a moment. */
  private armLock(game: Game): void {
    this.lock = LOCK_TICKS;
    game.input.clearCommands();
    game.input.consume("attack");
    game.input.consume("jump");
    game.input.consume("menu");
  }

  private get panel(): EndingPanel {
    return this.panels[this.index];
  }

  /** Full narration text of the current panel. */
  private get fullText(): string[] {
    return this.panel?.lines ?? [];
  }

  private get totalChars(): number {
    return this.fullText.reduce((n, l) => n + l.length, 0);
  }

  private get revealed(): number {
    return Math.floor(this.phaseAge / TICKS_PER_CHAR);
  }

  update(game: Game): void {
    if (!this.open) return;
    this.phaseAge++;
    this.sceneAge++;
    if (this.lock > 0) {
      this.lock--;
      // Keep eating confirms that arrive during the lockout.
      game.input.consume("attack");
      game.input.consume("jump");
      return;
    }

    const input = game.input;
    const confirm = input.pressed("attack") || input.pressed("jump");
    if (confirm) {
      input.consume("attack");
      input.consume("jump");
    }

    switch (this.phase) {
      case "fadeIn":
        if (this.phaseAge >= FADE_IN) this.setPhase("typing");
        break;
      case "typing":
        // Confirm completes the line instead of skipping the panel, so a
        // stray press can never blow through the whole ending.
        if (confirm || this.revealed >= this.totalChars) {
          this.setPhase("hold");
          audio.play("pickup");
        }
        break;
      case "hold":
        if (confirm) this.setPhase("fadeOut");
        break;
      case "fadeOut":
        if (this.phaseAge >= FADE_OUT) {
          this.index++;
          if (this.index >= this.panels.length) {
            this.open = false;
            game.showResults(this.ending);
          } else {
            this.setPhase("fadeIn");
            this.sceneAge = 0;
          }
        }
        break;
    }
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseAge = 0;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.open || !this.panel) return;
    ctx.save();

    SCENES[this.panel.scene](ctx, this.sceneAge);

    // Letterbox bars frame the panel and hold the narration.
    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.fillRect(0, 0, VIEW_W, 18);
    ctx.fillRect(0, VIEW_H - 62, VIEW_W, 62);

    // Narration, revealed a character at a time across the lines.
    ctx.font = "8px 'Courier New', monospace";
    ctx.textAlign = "center";
    let budget = this.phase === "fadeIn" ? 0 : this.revealed;
    if (this.phase === "hold" || this.phase === "fadeOut") budget = this.totalChars;
    let used = 0;
    this.fullText.forEach((line, i) => {
      const take = Math.max(0, Math.min(line.length, budget - used));
      used += line.length;
      if (take <= 0) return;
      const text = line.slice(0, take);
      const y = VIEW_H - 48 + i * 12;
      ctx.fillStyle = "#000000";
      ctx.fillText(text, VIEW_W / 2 + 1, y + 1);
      ctx.fillStyle = PAL.textWhite;
      ctx.fillText(text, VIEW_W / 2, y);
    });

    // Advance prompt, only once the panel is fully read and unlocked.
    if (this.phase === "hold" && this.lock === 0 && Math.floor(this.sceneAge / 20) % 2 === 0) {
      ctx.fillStyle = PAL.textGold;
      ctx.fillText("▼", VIEW_W - 24, VIEW_H - 12);
    }

    // Fades.
    let alpha = 0;
    if (this.phase === "fadeIn") alpha = 1 - this.phaseAge / FADE_IN;
    else if (this.phase === "fadeOut") alpha = this.phaseAge / FADE_OUT;
    if (alpha > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, alpha)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    ctx.textAlign = "left";
    ctx.restore();
  }
}
