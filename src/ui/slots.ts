import { VIEW_W, VIEW_H } from "../engine/renderer";
import { PAL } from "../gfx/palette";
import { audio } from "../engine/audio";
import type { Input } from "../engine/input";
import { SLOT_COUNT, deleteSlot, slotSummary, type SlotSummary } from "../rpg/saveSlots";
import { t } from "../data/i18n";

export type SlotMode = "load" | "save" | "new";

/**
 * Shared 3-slot picker. Hosted by both the App (load / new game) and the
 * Game (save pedestal), so the two flows can never drift apart.
 *
 * Follows the world-freeze overlay pattern: the host checks `.open` early in
 * its update and draws this last.
 */
export class SlotScreen {
  open = false;
  private mode: SlotMode = "load";
  private cursor = 0;
  private rows: (SlotSummary | null)[] = [];
  private confirm: "overwrite" | "delete" | null = null;
  private onPick: (slot: number) => void = () => {};
  private onCancel: () => void = () => {};

  openPicker(mode: SlotMode, onPick: (slot: number) => void, onCancel: () => void = () => {}): void {
    this.mode = mode;
    this.onPick = onPick;
    this.onCancel = onCancel;
    this.cursor = 0;
    this.confirm = null;
    this.refresh();
    this.open = true;
  }

  private refresh(): void {
    this.rows = [];
    for (let i = 0; i < SLOT_COUNT; i++) this.rows.push(slotSummary(i));
  }

  private selectable(i: number): boolean {
    // Loading an empty slot does nothing; saving into one is fine.
    return this.mode !== "load" || this.rows[i] !== null;
  }

  update(input: Input): void {
    if (!this.open) return;

    if (this.confirm) {
      if (input.pressed("attack")) {
        input.consume("attack");
        if (this.confirm === "delete") {
          deleteSlot(this.cursor);
          this.refresh();
          audio.play("hit");
          this.confirm = null;
        } else {
          this.confirm = null;
          this.commit(this.cursor);
        }
        return;
      }
      if (input.pressed("jump") || input.pressed("menu")) {
        input.consume("jump");
        input.consume("menu");
        this.confirm = null;
      }
      return;
    }

    if (input.pressed("down")) {
      input.consume("down");
      this.cursor = (this.cursor + 1) % SLOT_COUNT;
      audio.play("pickup");
    }
    if (input.pressed("up")) {
      input.consume("up");
      this.cursor = (this.cursor - 1 + SLOT_COUNT) % SLOT_COUNT;
      audio.play("pickup");
    }
    if (input.pressed("subweapon")) {
      input.consume("subweapon");
      if (this.rows[this.cursor]) this.confirm = "delete";
    }
    if (input.pressed("attack")) {
      input.consume("attack");
      if (!this.selectable(this.cursor)) {
        audio.play("hurt");
        return;
      }
      // Writing over an existing run always asks first.
      if (this.mode !== "load" && this.rows[this.cursor]) this.confirm = "overwrite";
      else this.commit(this.cursor);
    }
    if (input.pressed("jump") || input.pressed("menu")) {
      input.consume("jump");
      input.consume("menu");
      this.close();
      this.onCancel();
    }
  }

  private commit(slot: number): void {
    this.close();
    this.onPick(slot);
  }

  close(): void {
    this.open = false;
    this.confirm = null;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.open) return;
    ctx.save();
    // Nearly opaque: the title logotype sits right behind this panel.
    ctx.fillStyle = "rgba(5, 3, 12, 0.97)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.strokeStyle = PAL.uiFrame;
    ctx.strokeRect(36.5, 30.5, VIEW_W - 73, VIEW_H - 61);

    ctx.font = "10px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = PAL.textGold;
    const titleKey =
      this.mode === "load" ? "slots.load" : this.mode === "save" ? "slots.save" : "title.new";
    ctx.fillText(`— ${t(titleKey)} —`, VIEW_W / 2, 52);

    ctx.font = "8px 'Courier New', monospace";
    for (let i = 0; i < SLOT_COUNT; i++) {
      const row = this.rows[i];
      const sel = this.cursor === i;
      const y = 76 + i * 40;
      ctx.fillStyle = sel ? "rgba(74, 58, 110, 0.55)" : "rgba(20, 14, 36, 0.55)";
      ctx.fillRect(60, y - 12, VIEW_W - 120, 32);
      ctx.strokeStyle = sel ? PAL.textGold : PAL.uiFrameDark;
      ctx.strokeRect(60.5, y - 11.5, VIEW_W - 121, 31);

      ctx.textAlign = "left";
      const dim = !this.selectable(i);
      ctx.fillStyle = sel ? PAL.textGold : dim ? PAL.uiFrameDark : PAL.textWhite;
      ctx.fillText(`${sel ? ">" : " "} ${t("slots.slot", { n: i + 1 })}`, 70, y);

      if (!row) {
        ctx.fillStyle = PAL.uiFrameDark;
        ctx.fillText(t("slots.empty"), 150, y);
      } else {
        ctx.fillStyle = dim ? PAL.uiFrameDark : PAL.textWhite;
        ctx.fillText(row.roomName, 150, y);
        ctx.fillStyle = PAL.uiFrame;
        ctx.fillText(
          `${t("slots.lv", { n: row.level })}   ${row.percent}%   ${row.time}   deaths ${row.deaths}`,
          70,
          y + 13,
        );
      }
      ctx.textAlign = "center";
    }

    ctx.fillStyle = PAL.uiFrame;
    if (this.confirm === "overwrite") {
      ctx.fillStyle = PAL.textGold;
      ctx.fillText(t("slots.overwrite", { n: this.cursor + 1 }), VIEW_W / 2, VIEW_H - 40);
    } else if (this.confirm === "delete") {
      ctx.fillStyle = PAL.dmgPlayer;
      ctx.fillText(t("slots.confirmDelete", { n: this.cursor + 1 }), VIEW_W / 2, VIEW_H - 40);
    } else {
      ctx.fillText(t("slots.hint"), VIEW_W / 2, VIEW_H - 40);
    }
    ctx.textAlign = "left";
    ctx.restore();
  }
}
