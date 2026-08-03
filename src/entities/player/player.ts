import { Entity } from "../entity";
import type { Game } from "../../game";
import { audio } from "../../engine/audio";
import { moveBody } from "../../world/collision";
import {
  buildPlayerSprites,
  buildPlayerBatSprites,
  buildPlayerWolfSprites,
  type PlayerSprites,
  type SpriteSet,
} from "../../gfx/sprites";
import { TILE } from "../../gfx/tiles";
import { PAL } from "../../gfx/palette";
import { Inventory } from "../../rpg/inventory";
import { deriveCombat, type Attributes, type CombatStats, type Resources } from "../../rpg/stats";
import { grantExp } from "../../rpg/leveling";
import { SUBWEAPONS, type SubweaponId } from "../../rpg/subweapons";
import type { EquipSlot } from "../../rpg/items";
import { computeDamage } from "../../combat/damage";
import { noticeText } from "../../combat/damage";
import type { AttackInstance } from "./attacks";
import { DieState, HurtState, IdleState, type PlayerState } from "./states";

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
  private sprites: PlayerSprites = buildPlayerSprites();
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
  spawnX: number;
  spawnY: number;

  constructor(x: number, y: number) {
    super(x - 6, y - STAND_H, 12, STAND_H);
    this.spawnX = x;
    this.spawnY = y;

    // Starting loadout — the combat engine reads gear through the inventory.
    this.inventory.add("shortSword");
    this.inventory.add("leatherWhip");
    this.inventory.add("nobleRapier");
    this.inventory.add("travelerTunic");
    this.inventory.add("wornCloak");
    this.inventory.add("potion", 3);
    this.inventory.equip("shortSword");
    this.inventory.equip("travelerTunic");
    this.inventory.equip("wornCloak");
    this.inventory.gold = 0;
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
    // Hold Up + Subweapon to throw the axe; plain press throws the dagger.
    const id: SubweaponId = game.input.held("up") ? "axe" : this.subweapon === "axe" ? "axe" : "dagger";
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
    if (this.iframes > 0 || this.state.name === "die" || this.state.name === "hurt") return;
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

  gainExp(game: Game, amount: number): void {
    const ups = grantExp(this.levelState, this.attrs, this.res, amount);
    for (const up of ups) {
      game.texts.push(
        noticeText(this.centerX, this.body.y - 16, `LEVEL ${up.newLevel}!`, PAL.textGold),
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
      this.batSprites ??= buildPlayerBatSprites();
      return set(this.batSprites)[Math.floor(this.animTick / 8) % 2];
    }
    if (this.form === "wolf") {
      this.wolfSprites ??= buildPlayerWolfSprites();
      const moving = Math.abs(this.body.vx) > 0.3;
      return set(this.wolfSprites)[moving ? Math.floor(this.animTick / 7) % 2 : 0];
    }
    const s = this.sprites;
    const atk = this.activeAttack;
    if (atk) {
      const idx = atk.phase === "startup" ? 0 : atk.phase === "active" ? 1 : 2;
      const sheet = atk.dir === "up" ? s.attackUp : atk.crouched ? s.crouchAttack : s.attack;
      return set(sheet)[idx];
    }
    switch (this.state.name) {
      case "walk": return set(s.walk)[Math.floor(this.animTick / 7) % 4];
      case "jump": return set(s.jump)[0];
      case "fall": return set(s.fall)[0];
      case "crouch": return set(s.crouch)[0];
      case "backdash": return set(s.backdash)[0];
      case "hurt": return set(s.hurt)[0];
      case "die": return this.body.onGround ? set(s.die)[0] : set(s.hurt)[0];
      case "spell": return set(s.attackUp)[1];
      default:
        if (this.throwAnim > 0) return set(s.attack)[2];
        return set(s.idle)[Math.floor(this.animTick / 32) % 2];
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
      ctx.drawImage(
        frame,
        Math.round(cx - frame.width / 2 - camX),
        Math.round(footY - frame.height - camY),
      );
      return;
    }
    const anchorX = this.facing > 0 ? 21 : 19;
    ctx.drawImage(frame, Math.round(cx - anchorX - camX), Math.round(footY - 36 - camY));
  }
}
