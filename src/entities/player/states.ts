import type { Game } from "../../game";
import { audio } from "../../engine/audio";
import { PAL } from "../../gfx/palette";
import { AttackInstance, type AttackDir } from "./attacks";
import type { Player } from "./player";
import { PHYS } from "./player";

/**
 * Player finite-state machine. Each state owns its physics + transitions and
 * returns the next state (or null to stay). Shared actions (jump, backdash,
 * attack, sub-weapon, spell) are offered by the states that allow them,
 * mirroring SotN's cancel rules.
 */
export abstract class PlayerState {
  abstract readonly name: string;
  enter(_p: Player, _g: Game): void {}
  exit(_p: Player, _g: Game): void {}
  abstract update(p: Player, g: Game): PlayerState | null;
}

/* ----------------------------- helpers ----------------------------- */

function tryJump(p: Player, g: Game): PlayerState | null {
  if (!g.input.pressed("jump")) return null;
  if (p.body.onGround || p.coyote > 0) {
    g.input.consume("jump");
    p.body.vy = PHYS.jumpVel;
    p.coyote = 0;
    audio.play("jump");
    return new JumpState();
  }
  // Swim stroke: always available while submerged; does not spend air jumps.
  if (p.inWater(g)) {
    g.input.consume("jump");
    p.body.vy = PHYS.jumpVel * 0.75;
    audio.play("splash");
    return new JumpState();
  }
  // Double jump — granted by the Soul of the Gale relic.
  if (p.relics.has("doubleJump") && p.airJumpsLeft > 0) {
    g.input.consume("jump");
    p.airJumpsLeft--;
    p.body.vy = PHYS.jumpVel * 0.92;
    audio.play("jump");
    p.doubleJumpPuff(g);
    return new JumpState();
  }
  return null;
}

function tryBackdash(p: Player, g: Game): PlayerState | null {
  if (g.input.pressed("backdash") && p.body.onGround) {
    g.input.consume("backdash");
    return new BackdashState();
  }
  return null;
}

function tryAttack(p: Player, g: Game, crouched: boolean): PlayerState | null {
  if (!g.input.pressed("attack")) return null;
  g.input.consume("attack");

  // Command spells: Down,Up+Attack = Soul Lance; Up,Down+Attack = Hellfire.
  if (!crouched && g.input.command(["down", "up"]) && p.castSpell(g, "soulLance")) {
    return new SpellCastState();
  }
  if (!crouched && g.input.command(["up", "down"]) && p.castSpell(g, "hellfire")) {
    return new SpellCastState();
  }
  const weapon = p.inventory.weapon();
  if (!weapon) return null;
  const dir: AttackDir = !crouched && g.input.held("up") ? "up" : "side";
  audio.play("swing");
  return new AttackState(new AttackInstance(weapon, dir, crouched));
}

/** Check the three transformation keys against owned relics. */
function formPressed(p: Player, g: Game): "bat" | "wolf" | "mist" | null {
  const checks = [
    ["formBat", "batForm", "bat"],
    ["formWolf", "wolfForm", "wolf"],
    ["formMist", "mistForm", "mist"],
  ] as const;
  for (const [action, relic, form] of checks) {
    if (g.input.pressed(action)) {
      g.input.consume(action);
      if (p.relics.has(relic)) return form;
    }
  }
  return null;
}

function tryForm(p: Player, g: Game): PlayerState | null {
  const f = formPressed(p, g);
  if (!f) return null;
  if (f === "bat") return new BatFormState();
  if (f === "wolf") return new WolfFormState();
  return new MistFormState();
}

function trySubweapon(p: Player, g: Game): boolean {
  if (g.input.pressed("subweapon")) {
    g.input.consume("subweapon");
    return p.throwSubweapon(g);
  }
  return false;
}

/** True if feet rest on a one-way platform tile. */
function standingOnOneWay(p: Player, g: Game): boolean {
  const tile = 16;
  const row = Math.floor((p.body.y + p.body.h + 1) / tile);
  const c0 = Math.floor(p.body.x / tile);
  const c1 = Math.floor((p.body.x + p.body.w - 1) / tile);
  for (let c = c0; c <= c1; c++) {
    if (g.map.isOneWay(c, row)) return true;
  }
  return false;
}

function steer(p: Player, g: Game, accel: number, max: number): void {
  const cap = p.inWater(g) ? max * 0.6 : max;
  const dir = (g.input.held("right") ? 1 : 0) - (g.input.held("left") ? 1 : 0);
  if (dir !== 0) {
    p.facing = dir as 1 | -1;
    p.body.vx += dir * accel;
    if (Math.abs(p.body.vx) > cap) p.body.vx = dir * cap;
  } else {
    p.body.vx *= p.body.onGround ? 0.6 : 0.95;
    if (Math.abs(p.body.vx) < 0.05) p.body.vx = 0;
  }
}

/* ------------------------------ states ----------------------------- */

export class IdleState extends PlayerState {
  readonly name = "idle";
  update(p: Player, g: Game): PlayerState | null {
    p.applyGravity(g);
    steer(p, g, PHYS.groundAccel, PHYS.walkSpeed);
    trySubweapon(p, g);

    const next = tryForm(p, g) ?? tryJump(p, g) ?? tryBackdash(p, g) ?? tryAttack(p, g, false);
    if (next) return next;
    if (!p.body.onGround) return new FallState();
    if (g.input.held("down")) return new CrouchState();
    if (g.input.held("left") || g.input.held("right")) return new WalkState();
    return null;
  }
}

export class WalkState extends PlayerState {
  readonly name = "walk";
  update(p: Player, g: Game): PlayerState | null {
    p.applyGravity(g);
    steer(p, g, PHYS.groundAccel, PHYS.walkSpeed);
    trySubweapon(p, g);

    const next = tryForm(p, g) ?? tryJump(p, g) ?? tryBackdash(p, g) ?? tryAttack(p, g, false);
    if (next) return next;
    if (!p.body.onGround) return new FallState();
    if (g.input.held("down")) return new CrouchState();
    if (!g.input.held("left") && !g.input.held("right")) return new IdleState();
    return null;
  }
}

export class CrouchState extends PlayerState {
  readonly name = "crouch";
  enter(p: Player): void {
    p.setCrouchHitbox(true);
    p.body.vx = 0;
  }
  exit(p: Player): void {
    p.setCrouchHitbox(false);
  }
  update(p: Player, g: Game): PlayerState | null {
    p.applyGravity(g);
    p.body.vx = 0;
    const dir = (g.input.held("right") ? 1 : 0) - (g.input.held("left") ? 1 : 0);
    if (dir !== 0) p.facing = dir as 1 | -1;

    // Down + Jump: high jump with Gravity Boots on solid ground; else drop
    // through one-way platforms (always available for platforms).
    if (g.input.pressed("jump")) {
      g.input.consume("jump");
      const onOneWay = standingOnOneWay(p, g);
      if (!onOneWay && p.relics.has("highJump")) {
        p.body.vy = -8.5;
        p.coyote = 0;
        audio.play("jump");
        p.doubleJumpPuff(g);
        return new JumpState();
      }
      p.dropTimer = 8;
      return new FallState();
    }
    const atk = tryAttack(p, g, true) ?? tryBackdash(p, g);
    if (atk) return atk;
    if (!p.body.onGround) return new FallState();
    if (!g.input.held("down")) return new IdleState();
    return null;
  }
}

export class JumpState extends PlayerState {
  readonly name = "jump";
  update(p: Player, g: Game): PlayerState | null {
    p.applyGravity(g);
    steer(p, g, PHYS.airAccel, PHYS.walkSpeed);
    trySubweapon(p, g);

    const next = tryForm(p, g) ?? tryJump(p, g) ?? tryAttack(p, g, false); // double jump mid-rise
    if (next) return next;
    if (p.body.vy >= 0) return new FallState();
    return null;
  }
}

export class FallState extends PlayerState {
  readonly name = "fall";
  update(p: Player, g: Game): PlayerState | null {
    p.applyGravity(g);
    steer(p, g, PHYS.airAccel, PHYS.walkSpeed);
    trySubweapon(p, g);

    const next = tryForm(p, g) ?? tryJump(p, g) ?? tryAttack(p, g, false); // coyote jump
    if (next) return next;
    if (p.body.onGround) {
      p.landDust(g);
      if (g.input.held("down")) return new CrouchState();
      return g.input.held("left") || g.input.held("right") ? new WalkState() : new IdleState();
    }
    return null;
  }
}

export class AttackState extends PlayerState {
  readonly name = "attack";
  constructor(readonly attack: AttackInstance) {
    super();
  }
  enter(p: Player): void {
    if (this.attack.crouched) p.setCrouchHitbox(true);
    p.activeAttack = this.attack;
    if (p.body.onGround) p.body.vx = 0; // grounded swings plant the feet
  }
  exit(p: Player): void {
    p.activeAttack = null;
    if (this.attack.crouched) p.setCrouchHitbox(false);
  }
  update(p: Player, g: Game): PlayerState | null {
    p.applyGravity(g);
    if (!p.body.onGround) steer(p, g, PHYS.airAccel * 0.6, PHYS.walkSpeed); // air swings keep momentum
    else p.body.vx = 0;

    this.attack.tick++;
    if (this.attack.phase === "done") {
      if (!p.body.onGround) return new FallState();
      if (this.attack.crouched && g.input.held("down")) return new CrouchState();
      return new IdleState();
    }
    return null;
  }
}

export class BackdashState extends PlayerState {
  readonly name = "backdash";
  private tick = 0;
  enter(p: Player, g: Game): void {
    p.body.vx = -p.facing * PHYS.backdashSpeed;
    p.iframes = Math.max(p.iframes, PHYS.backdashIframes);
    audio.play("backdash");
    p.dashDust(g);
  }
  update(p: Player, g: Game): PlayerState | null {
    p.applyGravity(g);
    this.tick++;
    // SotN rule: backdash may cancel into a jump at any point.
    const jump = tryJump(p, g);
    if (jump) return jump;
    if (this.tick >= PHYS.backdashTicks) {
      p.body.vx = 0;
      return new IdleState();
    }
    if (!p.body.onGround) return new FallState();
    return null;
  }
}

export class SpellCastState extends PlayerState {
  readonly name = "spell";
  private tick = 0;
  enter(p: Player): void {
    p.body.vx = 0;
  }
  update(p: Player, g: Game): PlayerState | null {
    p.applyGravity(g);
    this.tick++;
    if (this.tick >= 24) {
      return p.body.onGround ? new IdleState() : new FallState();
    }
    return null;
  }
}

/* --------------------------- transformations --------------------------- */

/** Shared revert: back to human if there is room, else stay transformed. */
function tryRevert(p: Player, g: Game): PlayerState | null {
  if (!p.canStandHuman(g)) return null;
  p.becomeHuman();
  p.transformPoof(g);
  return p.body.onGround ? new IdleState() : new FallState();
}

export class BatFormState extends PlayerState {
  readonly name = "bat";
  private drain = 0;
  enter(p: Player, g: Game): void {
    p.form = "bat";
    // Matches the part-based bat silhouette (~body + wings).
    p.setHitboxSize(18, 14);
    p.transformPoof(g);
    audio.play("spell");
  }
  update(p: Player, g: Game): PlayerState | null {
    const f = formPressed(p, g);
    if (f === "bat") return tryRevert(p, g);
    if (f === "wolf") return new WolfFormState();
    if (f === "mist") return new MistFormState();

    // Free 8-way flight, no gravity.
    const dx = (g.input.held("right") ? 1 : 0) - (g.input.held("left") ? 1 : 0);
    const dy = (g.input.held("down") ? 1 : 0) - (g.input.held("up") ? 1 : 0);
    const speed = 2.1;
    p.body.vx += (dx * speed - p.body.vx) * 0.25;
    p.body.vy += (dy * speed - p.body.vy) * 0.25;
    if (dx !== 0) p.facing = dx as 1 | -1;

    // SotN-style bat fireball — requires Fire of the Bat relic.
    if (
      p.relics.has("batFire") &&
      g.input.pressed("attack") &&
      p.batFireCd === 0 &&
      p.res.mp >= 2
    ) {
      g.input.consume("attack");
      p.res.mp -= 2;
      p.batFireCd = 18;
      g.spawnBatFire(p);
      audio.play("spell");
    }

    if (++this.drain >= 30) {
      this.drain = 0;
      p.res.mp--;
    }
    if (p.res.mp <= 0) return tryRevert(p, g) ?? null;
    return null;
  }
}

/** Hold a direction at full lope to charge; then sonic run: i-frames + body damage. */
const SONIC_CHARGE = 28; // ticks of sustained run before boost
const SONIC_SPEED = 5.2;
const SONIC_MIN_SPEED = 2.0;

export class WolfFormState extends PlayerState {
  readonly name = "wolf";
  private charge = 0;
  private sonicTicks = 0;
  enter(p: Player, g: Game): void {
    p.form = "wolf";
    // Matches the part-based wolf (~40×20 sprite, paws on ground).
    p.setHitboxSize(28, 16);
    p.transformPoof(g);
    audio.play("spell");
    this.charge = 0;
    this.sonicTicks = 0;
  }
  exit(p: Player): void {
    p.sonicRun = false;
  }
  update(p: Player, g: Game): PlayerState | null {
    const f = formPressed(p, g);
    if (f === "wolf") return tryRevert(p, g);
    if (f === "bat") return new BatFormState();
    if (f === "mist") return new MistFormState();

    p.applyGravity(g);

    const holding =
      (g.input.held("right") ? 1 : 0) - (g.input.held("left") ? 1 : 0);
    const dirHeld = holding !== 0;

    if (this.sonicTicks > 0) {
      // --- Sonic run active ---
      this.sonicTicks--;
      p.sonicRun = true;
      p.iframes = Math.max(p.iframes, 3);
      if (dirHeld) p.facing = holding as 1 | -1;
      p.body.vx = p.facing * SONIC_SPEED;
      // Dust / speed lines
      if (p.body.onGround && this.sonicTicks % 2 === 0) {
        g.spawnParticle(p.centerX - p.facing * 10, p.body.y + p.body.h - 1, {
          vx: -p.facing * (1 + Math.random()),
          vy: -Math.random() * 0.8,
          life: 10,
          color: Math.random() < 0.5 ? PAL.spellCyan : PAL.stoneLight,
          size: 1,
        });
      }
      // Wall slam ends the dash
      const probe = p.facing > 0 ? p.body.x + p.body.w + 2 : p.body.x - 2;
      const col = Math.floor(probe / 16);
      const row = Math.floor(p.centerY / 16);
      if (g.map.isSolid(col, row)) {
        this.sonicTicks = 0;
        p.sonicRun = false;
        p.body.vx = 0;
        audio.play("hit");
        g.camera.addShake(0.25);
      }
      // Release direction early ends sonic
      if (!dirHeld) {
        this.sonicTicks = 0;
        p.sonicRun = false;
      }
    } else {
      steer(p, g, 0.5, 2.7); // normal lope
      // Charge while running full-speed on ground (needs Fang of the Gale).
      if (
        p.relics.has("wolfDash") &&
        dirHeld &&
        p.body.onGround &&
        Math.abs(p.body.vx) >= SONIC_MIN_SPEED
      ) {
        this.charge++;
        if (this.charge >= SONIC_CHARGE) {
          this.charge = 0;
          this.sonicTicks = 48; // ~0.8s of invuln ramming
          p.sonicRun = true;
          p.iframes = Math.max(p.iframes, 8);
          audio.play("backdash");
          g.camera.addShake(0.2);
        }
      } else {
        this.charge = Math.max(0, this.charge - 2);
      }
    }

    if (g.input.pressed("jump")) {
      if (p.body.onGround || p.coyote > 0) {
        g.input.consume("jump");
        p.body.vy = PHYS.jumpVel;
        // Jumping cancels sonic but keeps a few i-frames
        this.sonicTicks = 0;
        p.sonicRun = false;
        audio.play("jump");
      } else if (p.inWater(g)) {
        g.input.consume("jump");
        p.body.vy = PHYS.jumpVel * 0.75;
        audio.play("splash");
      }
    }
    return null;
  }
}

export class MistFormState extends PlayerState {
  readonly name = "mist";
  private drain = 0;
  enter(p: Player, g: Game): void {
    p.form = "mist";
    p.body.phaseThrough = true;
    p.setHitboxSize(12, 16);
    p.transformPoof(g);
    audio.play("spell");
  }
  exit(p: Player): void {
    p.body.phaseThrough = false;
  }
  update(p: Player, g: Game): PlayerState | null {
    const f = formPressed(p, g);
    if (f === "mist") return tryRevert(p, g);
    if (f === "bat") return new BatFormState();
    if (f === "wolf") return new WolfFormState();

    // Slow intangible drift — phases through gates/walls via body.phaseThrough.
    const dx = (g.input.held("right") ? 1 : 0) - (g.input.held("left") ? 1 : 0);
    const dy = (g.input.held("down") ? 1 : 0) - (g.input.held("up") ? 1 : 0);
    p.body.vx += (dx * 1.15 - p.body.vx) * 0.18;
    p.body.vy += (dy * 1.15 - p.body.vy) * 0.18;

    if (++this.drain >= 15) {
      this.drain = 0;
      p.res.mp--;
    }
    if (p.res.mp <= 0) return tryRevert(p, g) ?? null;
    return null;
  }
}

export class HurtState extends PlayerState {
  readonly name = "hurt";
  private tick = 0;
  constructor(private fromDir: number) {
    super();
  }
  enter(p: Player): void {
    p.body.vx = this.fromDir * PHYS.knockbackX;
    p.body.vy = PHYS.knockbackY;
    p.activeAttack = null;
  }
  exit(p: Player): void {
    p.iframes = PHYS.hurtIframes;
  }
  update(p: Player, g: Game): PlayerState | null {
    p.applyGravity(g);
    this.tick++;
    p.body.vx *= 0.94;
    if (this.tick > 10 && p.body.onGround) return new IdleState();
    if (this.tick > 40) return new FallState();
    return null;
  }
}

/**
 * SotN-style petrification (Medusa Head contact).
 * Player freezes as grey stone; mashing ←→ (or jump) cracks the shell.
 * After enough cracks — or a long timeout — the statue shatters.
 */
export class PetrifyState extends PlayerState {
  readonly name = "petrify";
  /** 0..1 crack progress exposed for draw. */
  cracks = 0;
  private readonly need = 7;
  private presses = 0;
  private tick = 0;
  private cooldown = 0;
  private readonly maxTicks = 210; // ~3.5s failsafe

  enter(p: Player, g: Game): void {
    p.body.vx = 0;
    p.activeAttack = null;
    p.form = "human";
    p.iframes = 8; // brief grace so contact doesn't re-trigger every tick
    p.petrifyCracks = 0;
    audio.play("hurt");
    g.camera.addShake(0.4);
  }

  exit(p: Player): void {
    p.petrifyCracks = 0;
    p.iframes = Math.max(p.iframes, 40);
  }

  update(p: Player, g: Game): PlayerState | null {
    this.tick++;
    p.petrifyCracks = this.cracks;
    // Heavy stone: fall, but no walking.
    p.body.vx = 0;
    p.applyGravity(g);
    // Slightly heavier fall while stone.
    if (p.body.vy > 0) p.body.vy = Math.min(p.body.vy + 0.08, PHYS.terminalVel * 0.85);

    if (this.cooldown > 0) this.cooldown--;

    const input = g.input;
    let cracked = false;
    if (this.cooldown === 0) {
      if (input.pressed("left") || input.pressed("right") || input.pressed("jump") || input.pressed("up") || input.pressed("down")) {
        input.consume("left");
        input.consume("right");
        input.consume("jump");
        input.consume("up");
        input.consume("down");
        cracked = true;
      }
    }
    // Holding a direction also chips stone slowly (SotN-ish struggle).
    if (!cracked && this.tick % 12 === 0 && (input.held("left") || input.held("right"))) {
      cracked = true;
    }

    if (cracked) {
      this.presses++;
      this.cracks = Math.min(1, this.presses / this.need);
      this.cooldown = 4;
      p.petrifyCracks = this.cracks;
      audio.play("hit");
      // Chip particles
      for (let i = 0; i < 3; i++) {
        g.spawnParticle(p.centerX + (Math.random() * 10 - 5), p.centerY + (Math.random() * 12 - 6), {
          vx: Math.random() * 1.4 - 0.7,
          vy: -Math.random() * 1.2 - 0.2,
          life: 12 + Math.floor(Math.random() * 8),
          color: i % 2 === 0 ? "#908878" : "#606058",
          size: 1,
        });
      }
    }

    if (this.presses >= this.need || this.tick >= this.maxTicks) {
      this.shatter(p, g);
      return p.body.onGround ? new IdleState() : new FallState();
    }
    return null;
  }

  private shatter(p: Player, g: Game): void {
    audio.play("crit");
    g.camera.addShake(0.35);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      g.spawnParticle(p.centerX, p.centerY, {
        vx: Math.cos(a) * (1.2 + Math.random()),
        vy: Math.sin(a) * (1.0 + Math.random() * 0.6) - 0.5,
        life: 18 + Math.floor(Math.random() * 12),
        color: i % 3 === 0 ? "#c0b8a0" : "#787060",
        size: i % 2 === 0 ? 2 : 1,
      });
    }
  }
}

export class DieState extends PlayerState {
  readonly name = "die";
  private tick = 0;
  enter(p: Player, g: Game): void {
    p.body.vx = 0;
    p.body.vy = -2.5;
    p.activeAttack = null;
    audio.play("die");
    g.camera.addShake(0.6);
  }
  update(p: Player, g: Game): PlayerState | null {
    p.applyGravity(g);
    if (p.body.onGround) p.body.vx = 0;
    this.tick++;
    if (this.tick >= 150) g.respawn();
    return null;
  }
}
