import { Entity } from "../entity";
import type { Game } from "../../game";
import { audio } from "../../engine/audio";
import { moveBody } from "../../world/collision";
import {
  buildPlayerBatSprites,
  buildPlayerWolfSprites,
  type PlayerSprites,
  type SpriteSet,
} from "../../gfx/sprites";
import { resolvePlayerSprites, resolveSpriteSet } from "../../gfx/resolveSprites";
import { TILE } from "../../gfx/tiles";
import { PAL } from "../../gfx/palette";
import { Inventory } from "../../rpg/inventory";
import { deriveCombat, type Attributes, type CombatStats, type Resources } from "../../rpg/stats";
import { grantExp } from "../../rpg/leveling";
import { SUBWEAPONS, type SubweaponId } from "../../rpg/subweapons";
import type { EquipSlot } from "../../rpg/items";
import { defaultPlayerSave } from "../../rpg/defaultSave";
import { computeDamage } from "../../combat/damage";
import { noticeText } from "../../combat/damage";
import type { AttackInstance } from "./attacks";
import { DieState, HurtState, IdleState, PetrifyState, type PlayerState } from "./states";
import { t } from "../../data/i18n";

/** All movement tuning in one table — feel adjustments happen here. */
export const PHYS = {
  walkSpeed: 1.7,
  groundAccel: 0.4,
  airAccel: 0.22,
  gravity: 0.26,
  jumpVel: -5.6,
  shortHopGravityMult: 2.3, // extra gravity when jump released while rising
  terminalVel: 6.0,
  coyoteTicks: 5,
  backdashSpeed: 3.8,
  backdashTicks: 16,
  backdashIframes: 10,
  knockbackX: 2.0,
  knockbackY: -2.6,
  hurtIframes: 60,
} as const;

const STAND_H = 28;
const CROUCH_H = 18;

export interface PlayerSave {
  attrs: Attributes;
  res: Resources;
  levelState: { level: number; exp: number };
  relics: string[];
  subweapon: SubweaponId;
  inventory: {
    items: { itemId: string; count: number }[];
    gold: number;
    equipment: Record<EquipSlot, string | null>;
  };
}

export class Player extends Entity {
  private sprites: PlayerSprites = resolvePlayerSprites();
  state: PlayerState = new IdleState();

  // RPG state
  attrs: Attributes = { str: 6, con: 6, int: 6, lck: 5 };
  res: Resources = { hp: 70, maxHp: 70, mp: 20, maxMp: 20, hearts: 10, maxHearts: 50 };
  levelState = { level: 1, exp: 0 };
  inventory = new Inventory();
  subweapon: SubweaponId = "dagger";

  // Relics: permanent abilities (doubleJump, batForm, wolfForm, mistForm, waterWalk)
  relics = new Set<string>();
  airJumpsLeft = 0;
  /** Current transformation. Mist is intangible; bat flies; wolf runs fast. */
  form: "human" | "bat" | "wolf" | "mist" = "human";
  private batSprites: SpriteSet | null = null;
  private wolfSprites: SpriteSet | null = null;

  // Transient combat/movement state
  iframes = 0;
  coyote = 0;
  dropTimer = 0;
  activeAttack: AttackInstance | null = null;
  private throwAnim = 0;
  private animTick = 0;
  private wasInWater = false;
  /** Crack progress 0..1 while petrified (draw overlay). */
  petrifyCracks = 0;
  /**
   * Wolf sonic run — invulnerable body-ram. Cleared every tick by WolfFormState;
   * Game applies contact damage while true.
   */
  sonicRun = false;
  /** Bat fireball cooldown (ticks). */
  batFireCd = 0;
  spawnX: number;
  spawnY: number;

  constructor(x: number, y: number) {
    super(x - 6, y - STAND_H, 12, STAND_H);
    this.spawnX = x;
    this.spawnY = y;
    // Starting loadout comes from the shared default so a fresh Player and
    // Game.startFreshRun() can never disagree.
    this.restore(defaultPlayerSave());
  }

  combatStats(): CombatStats {
    const totals = this.inventory.equipmentTotals();
    const attrs = this.inventory.effectiveAttributes(this.attrs);
    return deriveCombat(attrs, totals.atk, totals.def);
  }

  setState(next: PlayerState, game: Game): void {
    this.state.exit(this, game);
    this.state = next;
    this.animTick = 0;
    next.enter(this, game);
  }

  update(game: Game): void {
    this.savePrev();
    this.animTick++;
    if (this.iframes > 0) this.iframes--;
    if (this.throwAnim > 0) this.throwAnim--;
    if (this.batFireCd > 0) this.batFireCd--;
    // Default off; WolfFormState re-enables each tick while dashing.
    this.sonicRun = false;
    if (this.dropTimer > 0) {
      this.dropTimer--;
      this.body.dropThrough = true;
    } else {
      this.body.dropThrough = false;
    }

    // Water Walking: surface is solid unless holding ↓ to sink on purpose.
    const canWalkWater =
      this.relics.has("waterWalk") &&
      (this.form === "human" || this.form === "wolf") &&
      !game.input.held("down");
    this.body.walkOnWater = canWalkWater;
    // Mist drifts through solids (boss portcullis, cracked walls, platforms).
    this.body.phaseThrough = this.form === "mist";

    const next = this.state.update(this, game);
    if (next) this.setState(next, game);

    moveBody(this.body, game.map);
    this.coyote = this.body.onGround ? PHYS.coyoteTicks : Math.max(0, this.coyote - 1);
    if (this.body.onGround) this.airJumpsLeft = 1;

    // Splash FX when first entering a flooded cell.
    const wet = this.inWater(game);
    if (wet && !this.wasInWater) this.waterSplash(game);
    this.wasInWater = wet;

    // Quick-use potion.
    if (game.input.pressed("potion")) {
      game.input.consume("potion");
      this.usePotion(game);
    }
  }

  /** True when the body center sits in a Water / WaterTop tile. */
  inWater(game: Game): boolean {
    const col = Math.floor(this.centerX / TILE);
    const row = Math.floor(this.centerY / TILE);
    return game.map.isWater(col, row);
  }

  /** Gravity with variable jump height: releasing jump while rising cuts the arc. */
  applyGravity(game: Game): void {
    const wet = this.inWater(game);
    let grav = PHYS.gravity;
    if (wet) grav *= 0.35;
    else if (this.body.vy < 0 && !game.input.held("jump")) grav *= PHYS.shortHopGravityMult;
    const terminal = wet ? 1.2 : PHYS.terminalVel;
    this.body.vy = Math.min(this.body.vy + grav, terminal);
  }

  waterSplash(game: Game): void {
    audio.play("splash");
    const y = this.body.y + this.body.h;
    for (let i = 0; i < 8; i++) {
      game.spawnParticle(this.centerX + (Math.random() * 14 - 7), y, {
        vx: Math.random() * 1.6 - 0.8,
        vy: -Math.random() * 1.4 - 0.3,
        life: 14 + Math.floor(Math.random() * 10),
        color: i % 2 === 0 ? PAL.waterHi : PAL.waterMid,
        size: i % 3 === 0 ? 2 : 1,
      });
    }
  }

  setCrouchHitbox(crouched: boolean): void {
    const targetH = crouched ? CROUCH_H : STAND_H;
    if (this.body.h !== targetH) {
      this.body.y += this.body.h - targetH;
      this.body.h = targetH;
    }
  }

  /** Resize the hitbox keeping feet and horizontal center anchored. */
  setHitboxSize(w: number, h: number): void {
    this.body.x += (this.body.w - w) / 2;
    this.body.y += this.body.h - h;
    this.body.w = w;
    this.body.h = h;
  }

  /** Would the human 12x28 hitbox fit at the current feet position? */
  canStandHuman(game: Game): boolean {
    const feetY = this.body.y + this.body.h;
    const cx = this.centerX;
    const rect = { x: cx - 6, y: feetY - STAND_H, w: 12, h: STAND_H };
    const c0 = Math.floor(rect.x / TILE);
    const c1 = Math.floor((rect.x + rect.w - 1) / TILE);
    const r0 = Math.floor(rect.y / TILE);
    const r1 = Math.floor((rect.y + rect.h - 1) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (game.map.isSolid(c, r)) return false;
      }
    }
    return true;
  }

  becomeHuman(): void {
    this.form = "human";
    this.setHitboxSize(12, STAND_H);
  }

  transformPoof(game: Game): void {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      game.spawnParticle(this.centerX, this.centerY, {
        vx: Math.cos(a) * 1.3,
        vy: Math.sin(a) * 1.3,
        life: 16,
        color: i % 2 === 0 ? PAL.spellCyan : PAL.textWhite,
        size: 1,
      });
    }
  }

  throwSubweapon(game: Game): boolean {
    // Hold Up + Subweapon still forces the axe; otherwise use the selected sub.
    const id: SubweaponId = game.input.held("up") ? "axe" : this.subweapon;
    const def = SUBWEAPONS[id];
    if (this.res.hearts < def.heartCost) return false;
    this.res.hearts -= def.heartCost;
    game.spawnSubweapon(this, id);
    this.throwAnim = 12;
    audio.play("throw");
    return true;
  }

  castSpell(game: Game, spell: "soulLance" | "hellfire"): boolean {
    const cost = spell === "soulLance" ? 10 : 16;
    if (this.res.mp < cost) return false;
    this.res.mp -= cost;
    game.input.clearCommands();
    game.spawnSpell(this, spell);
    audio.play("spell");
    game.camera.addShake(0.25);
    return true;
  }

  usePotion(game: Game): void {
    const def = this.inventory.consumable("potion");
    if (!def || this.res.hp >= this.res.maxHp) return;
    this.inventory.remove("potion");
    this.res.hp = Math.min(this.res.maxHp, this.res.hp + (def.restoreHp ?? 0));
    game.texts.push(noticeText(this.centerX, this.body.y - 6, `+${def.restoreHp} HP`, PAL.textGold));
    audio.play("pickup");
  }

  /** Incoming hit. `power` is the attacker's raw attack value. */
  takeDamage(game: Game, power: number, fromX: number): void {
    if (this.form === "mist") return; // intangible
    if (
      this.iframes > 0 ||
      this.state.name === "die" ||
      this.state.name === "hurt" ||
      this.state.name === "petrify"
    ) {
      return;
    }
    if (this.form !== "human") this.becomeHuman(); // hits knock you out of form
    const stats = this.combatStats();
    const { amount } = computeDamage(power, stats.defense, 0);
    this.res.hp -= amount;
    game.texts.push(noticeText(this.centerX, this.body.y - 8, String(amount), PAL.dmgPlayer));
    game.camera.addShake(0.35);
    audio.play("hurt");
    const dir = this.centerX < fromX ? -1 : 1;
    if (this.res.hp <= 0) {
      this.res.hp = 0;
      this.setState(new DieState(), game);
    } else {
      this.setState(new HurtState(dir), game);
    }
  }

  /**
   * Medusa Head contact — SotN petrify: take damage and freeze as stone
   * until the player mashes directions to crack free.
   */
  petrify(game: Game, power: number, fromX: number): void {
    if (this.form === "mist") return;
    if (
      this.iframes > 0 ||
      this.state.name === "die" ||
      this.state.name === "petrify" ||
      this.state.name === "hurt"
    ) {
      return;
    }
    if (this.form !== "human") this.becomeHuman();
    const stats = this.combatStats();
    const { amount } = computeDamage(power, stats.defense, 0);
    this.res.hp -= amount;
    game.texts.push(noticeText(this.centerX, this.body.y - 8, String(amount), PAL.dmgPlayer));
    game.texts.push(
      noticeText(this.centerX, this.body.y - 18, t("notice.petrify"), "#c0b8a0"),
    );
    if (this.res.hp <= 0) {
      this.res.hp = 0;
      this.setState(new DieState(), game);
      return;
    }
    this.setState(new PetrifyState(), game);
    void fromX; // direction unused — stone freezes in place
  }

  gainExp(game: Game, amount: number): void {
    const ups = grantExp(this.levelState, this.attrs, this.res, amount);
    for (const up of ups) {
      game.texts.push(
        noticeText(this.centerX, this.body.y - 16, t("notice.levelUp", { n: up.newLevel }), PAL.textGold),
      );
      audio.play("levelup");
      game.camera.addShake(0.3);
    }
  }

  landDust(game: Game): void {
    for (let i = 0; i < 5; i++) {
      game.spawnParticle(this.centerX + (Math.random() * 12 - 6), this.body.y + this.body.h, {
        vx: Math.random() * 1.2 - 0.6, vy: -Math.random() * 0.6, life: 14, color: PAL.stoneLight, size: 1,
      });
    }
  }

  doubleJumpPuff(game: Game): void {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      game.spawnParticle(this.centerX, this.body.y + this.body.h - 2, {
        vx: Math.cos(a) * 1.1, vy: Math.sin(a) * 0.4 + 0.2, life: 14, color: PAL.spellCyan, size: 1,
      });
    }
  }

  dashDust(game: Game): void {
    for (let i = 0; i < 4; i++) {
      game.spawnParticle(this.centerX + this.facing * 6, this.body.y + this.body.h - 2, {
        vx: this.facing * (0.5 + Math.random()), vy: -Math.random() * 0.5, life: 12, color: PAL.stoneLight, size: 1,
      });
    }
  }

  /* ---------------------------- persistence ---------------------------- */

  serialize(): PlayerSave {
    return {
      attrs: { ...this.attrs },
      res: { ...this.res },
      levelState: { ...this.levelState },
      relics: [...this.relics],
      subweapon: this.subweapon,
      inventory: {
        items: this.inventory.items.map((e) => ({ ...e })),
        gold: this.inventory.gold,
        equipment: { ...this.inventory.equipment },
      },
    };
  }

  restore(data: PlayerSave): void {
    this.attrs = { ...data.attrs };
    this.res = { ...data.res };
    this.levelState = { ...data.levelState };
    this.relics = new Set(data.relics);
    this.subweapon = data.subweapon;
    this.inventory.items = data.inventory.items.map((e) => ({ ...e }));
    this.inventory.gold = data.inventory.gold;
    this.inventory.equipment = { ...data.inventory.equipment };
  }

  /* ------------------------------ drawing ------------------------------ */

  private currentFrame(): HTMLCanvasElement {
    const set = (s: SpriteSet) => (this.facing > 0 ? s.right : s.left);
    if (this.form === "bat") {
      this.batSprites ??= resolveSpriteSet("player.bat", buildPlayerBatSprites);
      // Procedural bat is 3 frames @ 4 ticks (~12-tick cycle). Scale so AI
      // strips with more frames keep similar wing-beat tempo.
      const frames = this.batSprites.right.length;
      const ticksPerFrame = Math.max(1, Math.round(12 / frames));
      return set(this.batSprites)[Math.floor(this.animTick / ticksPerFrame) % frames];
    }
    if (this.form === "wolf") {
      this.wolfSprites ??= resolveSpriteSet("player.wolf", buildPlayerWolfSprites);
      const moving = Math.abs(this.body.vx) > 0.25;
      const frames = this.wolfSprites.right.length;
      // Procedural: idle=[0], run=[1..3] @ 5 ticks (~15-tick cycle). AI strips
      // are a full run loop — hold frame 0 when still, cycle all when moving.
      if (!moving) return set(this.wolfSprites)[0];
      const ticksPerFrame = Math.max(1, Math.round(15 / frames));
      return set(this.wolfSprites)[Math.floor(this.animTick / ticksPerFrame) % frames];
    }
    const s = this.sprites;
    const atk = this.activeAttack;
    if (atk) {
      // Procedural attack sheets have 3 frames (startup/active/recovery). AI
      // overrides may have more — map attack progress across the full strip so
      // no frames are dead weight. Up/crouch still use their own sheets.
      const sheet = atk.dir === "up" ? s.attackUp : atk.crouched ? s.crouchAttack : s.attack;
      const frames = sheet.right.length;
      let idx: number;
      if (frames <= 3) {
        idx = atk.phase === "startup" ? 0 : atk.phase === "active" ? 1 : 2;
      } else {
        const progress = Math.min(0.999, atk.tick / Math.max(1, atk.total));
        idx = Math.min(frames - 1, Math.floor(progress * frames));
      }
      return set(sheet)[idx];
    }
    switch (this.state.name) {
      case "walk": {
        // Keep the full step-cycle duration ~constant (28 ticks) regardless of
        // frame count, so an override with more frames plays smoother instead
        // of just slower. 4 frames -> 7 ticks/frame, matching the original.
        const frames = s.walk.right.length;
        const ticksPerFrame = Math.max(1, Math.round(28 / frames));
        return set(s.walk)[Math.floor(this.animTick / ticksPerFrame) % frames];
      }
      case "jump": {
        // Procedural jump is a single pose; multi-frame overrides play through
        // the strip (held mid-air still advances so the coat/legs read as live).
        const frames = s.jump.right.length;
        if (frames <= 1) return set(s.jump)[0];
        const ticksPerFrame = Math.max(1, Math.round(24 / frames));
        return set(s.jump)[Math.floor(this.animTick / ticksPerFrame) % frames];
      }
      case "fall": {
        // When jump is an AI multi-frame strip, reuse a mid-air tuck pose so
        // fall doesn't flash back to the procedural style. Procedural jump is
        // 1 frame and has a dedicated fall sheet — keep that path.
        const jumpFrames = s.jump.right.length;
        if (jumpFrames > 1) {
          // Second half of the jump strip is the airborne/tuck region.
          const idx = Math.min(jumpFrames - 1, Math.floor(jumpFrames * 0.6));
          return set(s.jump)[idx];
        }
        return set(s.fall)[0];
      }
      case "crouch":
        // Held crouch is a static pose. Multi-frame crouch strips were a
        // stand→duck transition that looked like endless bobbing when looped.
        return set(s.crouch)[0];
      case "backdash": {
        // Play through the strip once as the dash progresses; hold last frame.
        const frames = s.backdash.right.length;
        if (frames <= 1) return set(s.backdash)[0];
        const idx = Math.min(frames - 1, Math.floor(this.animTick / 3));
        return set(s.backdash)[idx];
      }
      case "hurt": {
        const frames = s.hurt.right.length;
        if (frames <= 1) return set(s.hurt)[0];
        const idx = Math.min(frames - 1, Math.floor(this.animTick / 4));
        return set(s.hurt)[idx];
      }
      case "petrify": {
        // Frozen mid-recoil pose reads as stiff.
        return set(s.hurt)[0];
      }
      case "die": {
        if (!this.body.onGround) {
          const hurtFrames = s.hurt.right.length;
          return set(s.hurt)[Math.min(hurtFrames - 1, Math.floor(this.animTick / 4))];
        }
        const frames = s.die.right.length;
        if (frames <= 1) return set(s.die)[0];
        // Advance once through the death strip, then hold the final pose.
        const idx = Math.min(frames - 1, Math.floor(this.animTick / 5));
        return set(s.die)[idx];
      }
      case "spell": return set(s.attackUp)[Math.min(1, s.attackUp.right.length - 1)];
      default:
        if (this.throwAnim > 0) {
          const frames = s.attack.right.length;
          return set(s.attack)[Math.min(frames - 1, frames <= 3 ? 2 : frames - 1)];
        }
        {
          // Idle: keep a ~64-tick full cycle regardless of frame count
          // (procedural was 2 frames × 32 ticks).
          const frames = s.idle.right.length;
          const ticksPerFrame = Math.max(1, Math.round(64 / frames));
          return set(s.idle)[Math.floor(this.animTick / ticksPerFrame) % frames];
        }
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, alpha: number): void {
    // I-frame flicker: skip every other pair of ticks.
    if (this.iframes > 0 && this.iframes % 4 < 2) return;
    const cx = this.renderX(alpha) + this.body.w / 2;
    const footY = this.renderY(alpha) + this.body.h;

    if (this.form === "mist") {
      // Drifting vapor: translucent additive puffs, no solid sprite.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 5; i++) {
        const px = cx - camX + Math.sin(this.animTick * 0.11 + i * 2.1) * 6;
        const py = footY - 8 - camY + Math.cos(this.animTick * 0.09 + i * 1.7) * 5;
        const r = 5 + (i % 3);
        const grad = ctx.createRadialGradient(px, py, 1, px, py, r);
        grad.addColorStop(0, "rgba(200, 220, 255, 0.30)");
        grad.addColorStop(1, "rgba(200, 220, 255, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(px - r, py - r, r * 2, r * 2);
      }
      ctx.restore();
      return;
    }

    const frame = this.currentFrame();
    if (this.form === "bat" || this.form === "wolf") {
      const dx = Math.round(cx - frame.width / 2 - camX);
      const dy = Math.round(footY - frame.height - camY);
      // Sonic run: cyan afterimage trail
      if (this.sonicRun) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.drawImage(frame, dx - this.facing * 6, dy);
        ctx.globalAlpha = 0.18;
        ctx.drawImage(frame, dx - this.facing * 12, dy);
        ctx.restore();
      }
      ctx.drawImage(frame, dx, dy);
      return;
    }
    // Anchor on frame centre with the same ±1 facing bias the procedural
    // 40×36 sheet used (21 / 19). Works for wider attack frames (48) without
    // hardcoding a single box size.
    const half = frame.width / 2;
    const anchorX = Math.round(half + (this.facing > 0 ? 1 : -1));
    const dx = Math.round(cx - anchorX - camX);
    const dy = Math.round(footY - frame.height - camY);

    if (this.state.name === "petrify") {
      // Stone statue: grey body + crack lines growing with mash progress.
      ctx.save();
      ctx.filter = "grayscale(1) brightness(0.78) contrast(1.15)";
      ctx.drawImage(frame, dx, dy);
      ctx.restore();
      const cracks = this.petrifyCracks;
      if (cracks > 0.05) {
        ctx.save();
        ctx.strokeStyle = `rgba(40, 36, 30, ${0.35 + cracks * 0.55})`;
        ctx.lineWidth = 1;
        const midX = dx + frame.width / 2;
        const top = dy + 6;
        const bot = dy + frame.height - 4;
        // Diagonal fracture that spreads with progress
        ctx.beginPath();
        ctx.moveTo(midX - 2, top);
        ctx.lineTo(midX + cracks * 4, top + (bot - top) * 0.45);
        ctx.lineTo(midX - cracks * 5, bot);
        ctx.stroke();
        if (cracks > 0.4) {
          ctx.beginPath();
          ctx.moveTo(midX + 4, top + 4);
          ctx.lineTo(midX - cracks * 6, top + (bot - top) * 0.55);
          ctx.stroke();
        }
        if (cracks > 0.7) {
          ctx.beginPath();
          ctx.moveTo(midX - 6, top + 10);
          ctx.lineTo(midX + cracks * 3, bot - 2);
          ctx.stroke();
        }
        ctx.restore();
      }
      return;
    }

    ctx.drawImage(frame, dx, dy);
  }
}
