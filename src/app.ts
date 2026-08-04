import { Input } from "./engine/input";
import { music } from "./engine/music";
import { getSettings } from "./engine/settings";
import { drawScanlines } from "./gfx/scanlines";
import { Game } from "./game";
import { TitleScreen } from "./ui/title";
import { SlotScreen } from "./ui/slots";
import { migrateLegacy, readSlot } from "./rpg/saveSlots";

export type Screen = "title" | "slots" | "playing";

/**
 * Top-level shell: owns the screen state machine, the single Input, and the
 * active Game (if any).
 *
 * IMPORTANT: the App calls `input.beginTick()` exactly once per tick for the
 * whole application — `Game.update()` must never call it again, or every
 * press fires twice.
 */
export class App {
  readonly input = new Input();
  screen: Screen = "title";
  game: Game | null = null;

  private title = new TitleScreen();
  private slots = new SlotScreen();

  constructor() {
    migrateLegacy();
    this.title.refresh();
  }

  private startGame(slot: number | null, load: boolean): void {
    const data = load && slot !== null ? readSlot(slot) : null;
    this.game = new Game(this.input, data, slot);
    this.screen = "playing";
    music.setTrack("castle");
    this.publishDebugHandle();
  }

  private toTitle(): void {
    this.game = null;
    this.screen = "title";
    this.title.refresh();
    this.slots.close();
    music.setTrack("title");
    this.publishDebugHandle();
  }

  /** Keep `window.__game` pointing at the live Game for dev tooling. */
  private publishDebugHandle(): void {
    if (import.meta.env.DEV) {
      (window as unknown as { __game: Game | null }).__game = this.game;
    }
  }

  update(): void {
    this.input.beginTick();

    switch (this.screen) {
      case "title": {
        const choice = this.title.update(this.input);
        if (choice === "new") {
          // Pick the slot the new run will be written to.
          this.slots.openPicker(
            "new",
            (slot) => this.startGame(slot, false),
            () => (this.screen = "title"),
          );
          this.screen = "slots";
        } else if (choice === "load") {
          this.slots.openPicker(
            "load",
            (slot) => this.startGame(slot, true),
            () => (this.screen = "title"),
          );
          this.screen = "slots";
        }
        break;
      }
      case "slots": {
        this.slots.update(this.input);
        // The picker's callbacks change `screen`; if it closed on its own
        // without one firing, fall back to the title.
        if (!this.slots.open && this.screen === "slots") this.screen = "title";
        break;
      }
      case "playing": {
        const game = this.game;
        if (!game) {
          this.toTitle();
          break;
        }
        game.update();
        if (game.exitToTitle) this.toTitle();
        break;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, alpha: number): void {
    switch (this.screen) {
      case "title":
        this.title.draw(ctx);
        break;
      case "slots":
        // Keep the title art behind the picker.
        this.title.draw(ctx);
        this.slots.draw(ctx);
        break;
      case "playing":
        this.game?.draw(ctx, alpha);
        break;
    }
    // CRT scanlines over every screen when enabled (Phase 9).
    if (getSettings().scanlines) drawScanlines(ctx);
  }
}
