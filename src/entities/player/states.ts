import type { Game } from "../../game";
import { audio } from "../../engine/audio";
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

    // Drop through one-way platforms: Down + Jump.
    if (g.input.pressed("jump")) {
      g.input.consume("jump");
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
    p.setHitboxSize(12, 10);
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

    if (++this.drain >= 30) {
      this.drain = 0;
      p.res.mp--;
    }
    if (p.res.mp <= 0) return tryRevert(p, g) ?? null;
    return null;
  }
}

export class WolfFormState extends PlayerState {
  readonly name = "wolf";
  enter(p: Player, g: Game): void {
    p.form = "wolf";
    p.setHitboxSize(22, 14);
    p.transformPoof(g);
    audio.play("spell");
  }
  update(p: Player, g: Game): PlayerState | null {
    const f = formPressed(p, g);
    if (f === "wolf") return tryRevert(p, g);
    if (f === "bat") return new BatFormState();
    if (f === "mist") return new MistFormState();

    p.applyGravity(g);
    steer(p, g, 0.5, 2.7); // fast lope (water speed handled inside steer)
    if (g.input.pressed("jump")) {
      if (p.body.onGround || p.coyote > 0) {
        g.input.consume("jump");
        p.body.vy = PHYS.jumpVel;
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
    p.setHitboxSize(12, 16);
    p.transformPoof(g);
    audio.play("spell");
  }
  update(p: Player, g: Game): PlayerState | null {
    const f = formPressed(p, g);
    if (f === "mist") return tryRevert(p, g);
    if (f === "bat") return new BatFormState();
    if (f === "wolf") return new WolfFormState();

    // Slow intangible drift.
    const dx = (g.input.held("right") ? 1 : 0) - (g.input.held("left") ? 1 : 0);
    const dy = (g.input.held("down") ? 1 : 0) - (g.input.held("up") ? 1 : 0);
    p.body.vx += (dx * 1.0 - p.body.vx) * 0.15;
    p.body.vy += (dy * 1.0 - p.body.vy) * 0.15;

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
