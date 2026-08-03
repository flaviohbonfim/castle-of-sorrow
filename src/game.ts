import { Input } from "./engine/input";
import { Camera } from "./engine/camera";
import { VIEW_W, VIEW_H } from "./engine/renderer";
import { audio } from "./engine/audio";
import { rectsOverlap, type Rect } from "./engine/math";
import { PAL } from "./gfx/palette";
import { TILE, TileId } from "./gfx/tiles";
import { ParallaxBackground } from "./gfx/parallax";
import { nextWarp, ROOMS, START, type RoomDef } from "./world/rooms";
import type { Tilemap } from "./world/tilemap";
import { Player, type PlayerSave } from "./entities/player/player";
import { IdleState } from "./entities/player/states";
import { Enemy } from "./entities/enemies/enemy";
import { Skeleton } from "./entities/enemies/skeleton";
import { Bat } from "./entities/enemies/bat";
import { Fishman } from "./entities/enemies/fishman";
import { AxeKnight } from "./entities/enemies/axeKnight";
import { MedusaHead } from "./entities/enemies/medusaHead";
import { Candle } from "./entities/candle";
import { Pickup, type PickupKind } from "./entities/pickup";
import { Projectile } from "./entities/projectile";
import {
  ItemPickup,
  RelicPickup,
  SavePoint,
  Shopkeeper,
  WarpPad,
} from "./entities/interactables";
import { BoneColossus } from "./entities/enemies/boss";
import { ClockworkWraith } from "./entities/enemies/wraith";
import { ShopUI } from "./ui/shop";
import { Minimap } from "./ui/minimap";
import { music } from "./engine/music";
import { Swing } from "./combat/hitbox";
import { computeDamage, type FloatingText } from "./combat/damage";
import { SUBWEAPONS, type SubweaponId } from "./rpg/subweapons";
import { Hud } from "./ui/hud";
import { Menu } from "./ui/menu";

export interface ParticleOpts {
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface Particle extends ParticleOpts {
  x: number;
  y: number;
  maxLife: number;
}

interface SaveFile {
  room: string;
  x: number;
  y: number;
  flags: string[];
  player: PlayerSave;
}

const SAVE_KEY = "castle-of-sorrow-save";

/** Central game world: rooms, entities, simulation tick and frame drawing. */
export class Game {
  readonly input = new Input();
  readonly player: Player;
  readonly parallax = new ParallaxBackground();
  readonly texts: FloatingText[] = [];
  /** Persistent world flags: broken walls, collected relics. */
  flags = new Set<string>();

  map!: Tilemap;
  camera!: Camera;
  private room!: RoomDef;
  private roomId = START.room;
  private lastEntry = { room: START.room, x: START.x, y: START.y };

  private enemies: Enemy[] = [];
  private candles: Candle[] = [];
  private pickups: Pickup[] = [];
  private projectiles: Projectile[] = [];
  private interactables: (RelicPickup | ItemPickup | WarpPad | SavePoint | Shopkeeper)[] = [];
  private particles: Particle[] = [];
  private hud = new Hud();
  private menu = new Menu();
  private shopUI = new ShopUI();
  private minimap = new Minimap();
  /** Active boss (any fight that shows the HP bar). */
  boss: (Enemy & { displayName: string; maxHp: number }) | null = null;
  private hitstopTicks = 0;
  private banner = { text: "", life: 0 };
  private vignette: CanvasGradient | null = null;
  /** Medusa Head edge spawners for the current room. */
  private medusaSpawners: { x: number; y: number; dir: 1 | -1 }[] = [];
  private medusaSpawnTimer = 0;
  tick = 0;

  constructor() {
    this.player = new Player(START.x, START.y);
    if (!this.tryLoadSave()) this.loadRoom(START.room, START.x, START.y);
  }

  /* ---------------------------- room loading ---------------------------- */

  loadRoom(id: string, x: number, y: number): void {
    const def = ROOMS[id];
    if (!def) throw new Error(`Unknown room: ${id}`);
    this.roomId = id;
    this.room = def;
    const built = def.build();
    this.map = built.map;
    this.camera = new Camera(this.map.widthPx, this.map.heightPx);

    this.enemies = [];
    this.candles = [];
    this.pickups = [];
    this.projectiles = [];
    this.interactables = [];
    this.particles = [];
    this.texts.length = 0;
    this.boss = null;
    this.medusaSpawners = [];
    this.medusaSpawnTimer = 45;

    for (const s of built.spawns) {
      switch (s.kind) {
        case "skeleton": this.enemies.push(new Skeleton(s.x, s.y)); break;
        case "bat": this.enemies.push(new Bat(s.x, s.y)); break;
        case "fishman": this.enemies.push(new Fishman(s.x, s.y)); break;
        case "axeKnight": this.enemies.push(new AxeKnight(s.x, s.y)); break;
        case "medusaSpawner":
          this.medusaSpawners.push({ x: s.x, y: s.y, dir: s.dir ?? 1 });
          break;
        case "candle": this.candles.push(new Candle(s.x, s.y)); break;
        case "relic":
          if (s.id && !this.flags.has(`relic:${s.id}`)) {
            this.interactables.push(new RelicPickup(s.id, s.x, s.y));
          }
          break;
        case "item": {
          if (!s.id) break;
          const n = s.n ?? 0;
          const flag = `item:${id}:${n}`;
          if (!this.flags.has(flag)) {
            this.interactables.push(new ItemPickup(s.id, flag, s.x, s.y));
          }
          break;
        }
        case "warp": this.interactables.push(new WarpPad(s.x, s.y)); break;
        case "save": this.interactables.push(new SavePoint(s.x, s.y)); break;
        case "shopkeeper": this.interactables.push(new Shopkeeper(s.x, s.y)); break;
        case "boss": {
          const bossId = s.id ?? def.boss?.id ?? "colossus";
          if (!this.flags.has(`boss:${bossId}`)) {
            const boss = this.makeBoss(bossId, s.x, s.y);
            if (boss) {
              this.boss = boss;
              this.enemies.push(boss);
            }
          } else {
            // Boss already slain: re-offer any uncollected reward relics.
            this.offerBossRewards(def);
          }
          break;
        }
        case "player": break; // start position comes from START/exits
      }
    }

    // Boss arena: portcullis seals configured gate cells while the boss lives.
    if (this.boss && def.boss) {
      for (const [c, r] of def.boss.gateCells) {
        this.map.setTile(c, r, TileId.Gate);
      }
    }
    this.flags.add(`visited:${id}`);
    music.setTrack(this.boss ? "boss" : "castle");

    // Re-apply broken walls.
    const prefix = `wall:${id}:`;
    for (const f of this.flags) {
      if (f.startsWith(prefix)) {
        const [, , c, r] = f.split(":");
        this.map.setTile(Number(c), Number(r), TileId.BgWall);
      }
    }

    const p = this.player;
    p.becomeHuman();
    p.body.x = x - p.body.w / 2;
    p.body.y = y - p.body.h;
    p.body.vx = 0;
    p.body.vy = 0;
    p.activeAttack = null;
    p.setState(new IdleState(), this);
    this.lastEntry = { room: id, x, y };
    this.banner = { text: def.name, life: 170 };
    this.camera.snapTo(p.centerX, p.centerY);
  }

  private checkTransitions(): void {
    const p = this.player;
    const cx = p.centerX;
    const cy = p.centerY;
    for (const exit of this.room.exits) {
      const hit =
        (exit.side === "right" && cx > this.map.widthPx - 8 && cy >= exit.min && cy <= exit.max) ||
        (exit.side === "left" && cx < 8 && cy >= exit.min && cy <= exit.max) ||
        (exit.side === "bottom" && p.body.y > this.map.heightPx && cx >= exit.min && cx <= exit.max) ||
        // Top: fire as soon as the hitbox crest crosses the ceiling (not only
        // when the whole body is above the room — that felt like a dead end).
        (exit.side === "top" && p.body.y < 0 && cx >= exit.min && cx <= exit.max);
      if (hit) {
        this.loadRoom(exit.target, exit.tx, exit.ty);
        return;
      }
    }
  }

  openShop(): void {
    this.shopUI.toggle();
  }

  /** Called by bosses on death: open gate, drop configured rewards. */
  onBossDefeated(bossId: string): void {
    this.flags.add(`boss:${bossId}`);
    const cx = this.boss?.centerX ?? this.player.centerX;
    const cy = this.boss?.body.y ?? this.player.body.y;
    this.boss = null;
    if (this.room.boss) {
      for (const [c, r] of this.room.boss.gateCells) {
        this.map.setTile(c, r, TileId.BgWall);
      }
    }
    music.setTrack("castle");
    this.camera.addShake(0.6);
    audio.play("levelup");
    this.offerBossRewards(this.room);
    for (let i = 0; i < 6; i++) {
      this.spawnPickup("gold", cx + (Math.random() * 60 - 30), cy + 10);
    }
  }

  private offerBossRewards(def: RoomDef): void {
    if (!def.boss) return;
    for (const r of def.boss.rewards) {
      if (!this.flags.has(`relic:${r.relic}`)) {
        this.interactables.push(new RelicPickup(r.relic, r.x, r.y));
      }
    }
  }

  private makeBoss(
    id: string,
    x: number,
    y: number,
  ): (Enemy & { displayName: string; maxHp: number }) | null {
    switch (id) {
      case "colossus": return new BoneColossus(x, y);
      case "wraith": return new ClockworkWraith(x, y);
      default: return null;
    }
  }

  /** Inject an enemy mid-room (e.g. boss summons). */
  spawnEnemy(enemy: Enemy): void {
    this.enemies.push(enemy);
  }

  warpFrom(_pad: WarpPad): void {
    const link = nextWarp(this.roomId);
    if (!link) return;
    audio.play("spell");
    this.loadRoom(link.room, link.x, link.y);
    this.camera.addShake(0.3);
    this.player.iframes = Math.max(this.player.iframes, 30);
  }

  /* ---------------------------- persistence ---------------------------- */

  saveGame(): void {
    const p = this.player;
    const data: SaveFile = {
      room: this.roomId,
      x: p.centerX,
      y: p.body.y + p.body.h,
      flags: [...this.flags],
      player: p.serialize(),
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // Storage unavailable (private mode) — play on without saving.
    }
  }

  private tryLoadSave(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw) as SaveFile;
      this.flags = new Set(data.flags);
      this.player.restore(data.player);
      this.loadRoom(data.room, data.x, data.y);
      return true;
    } catch {
      return false;
    }
  }

  /* --------------------------- spawning API --------------------------- */

  spawnParticle(x: number, y: number, opts: ParticleOpts): void {
    this.particles.push({ x, y, ...opts, maxLife: opts.life });
  }

  spawnPickup(kind: PickupKind, x: number, y: number): void {
    this.pickups.push(new Pickup(kind, x, y));
  }

  spawnSubweapon(p: Player, id: SubweaponId): void {
    const def = SUBWEAPONS[id];
    const attrs = p.inventory.effectiveAttributes(p.attrs);
    const power = def.power + Math.floor(attrs.str / 2);
    const y = id === "axe" ? p.body.y + 4 : p.body.y + 10;
    this.projectiles.push(new Projectile(id, p.centerX + p.facing * 8, y, p.facing, power));
  }

  spawnSpell(p: Player, spell: "soulLance" | "hellfire"): void {
    const attrs = p.inventory.effectiveAttributes(p.attrs);
    if (spell === "soulLance") {
      const power = 12 + attrs.int * 2;
      this.projectiles.push(new Projectile("spell", p.centerX + p.facing * 10, p.body.y + 10, p.facing, power));
    } else {
      // Hellfire: three fireballs in a spread arc.
      const power = 8 + Math.floor(attrs.int * 1.5);
      for (const boost of [-0.8, 0, 0.8]) {
        this.projectiles.push(
          new Projectile("fire", p.centerX + p.facing * 8, p.body.y + 6, p.facing, power, false, boost),
        );
      }
    }
  }

  /** Enemy-fired projectile (bones, spit, thrown axes, …). */
  spawnHostile(
    kind: "bone" | "spit" | "axeThrow",
    x: number,
    y: number,
    dir: 1 | -1,
    power: number,
    vyBoost = 0,
  ): void {
    this.projectiles.push(new Projectile(kind, x, y, dir, power, true, vyBoost));
  }

  /** Freeze the simulation briefly on impact for 16-bit crunch. */
  hitstop(ticks: number): void {
    this.hitstopTicks = Math.max(this.hitstopTicks, ticks);
  }

  respawn(): void {
    const p = this.player;
    p.res.hp = p.res.maxHp;
    p.res.mp = p.res.maxMp;
    this.loadRoom(this.lastEntry.room, this.lastEntry.x, this.lastEntry.y);
    p.iframes = 90;
  }

  /**
   * Route one attack swing (melee or projectile) against every damageable
   * thing it overlaps. Each target is hit at most once per swing.
   */
  applySwing(swing: Swing, rect: Rect, power: number, fromX: number, onFirstHit?: () => void): void {
    const critChance = this.player.combatStats().critChance;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      if (rectsOverlap(rect, enemy.body) && swing.register(enemy)) {
        enemy.takeDamage(this, computeDamage(power, enemy.stats.defense, critChance), fromX);
        onFirstHit?.();
      }
    }
    for (const candle of this.candles) {
      if (!candle.dead && rectsOverlap(rect, candle.body) && swing.register(candle)) {
        candle.smash(this);
        onFirstHit?.();
      }
    }
    this.breakWalls(rect);
  }

  /** Cracked tiles under an attack shatter permanently (per save flags). */
  private breakWalls(rect: Rect): void {
    const c0 = Math.floor(rect.x / TILE);
    const c1 = Math.floor((rect.x + rect.w - 1) / TILE);
    const r0 = Math.floor(rect.y / TILE);
    const r1 = Math.floor((rect.y + rect.h - 1) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.map.at(c, r) !== TileId.Cracked) continue;
        this.map.setTile(c, r, TileId.BgWall);
        this.flags.add(`wall:${this.roomId}:${c}:${r}`);
        audio.play("hit");
        this.camera.addShake(0.35);
        this.hitstop(3);
        for (let i = 0; i < 10; i++) {
          this.spawnParticle(c * TILE + 8, r * TILE + 8, {
            vx: Math.random() * 2.4 - 1.2,
            vy: -Math.random() * 2,
            life: 18 + Math.floor(Math.random() * 12),
            color: i % 2 === 0 ? PAL.stoneLight : PAL.stoneMid,
            size: i % 3 === 0 ? 2 : 1,
          });
        }
      }
    }
  }

  /* ------------------------------ update ------------------------------ */

  update(): void {
    this.input.beginTick();
    this.tick++;

    // Shop and pause menu freeze the world.
    if (this.shopUI.open) {
      this.shopUI.update(this);
      return;
    }
    if (this.menu.open) {
      this.menu.update(this);
      return;
    }
    if (this.input.pressed("menu")) {
      this.input.consume("menu");
      this.menu.toggle();
      return;
    }

    if (this.hitstopTicks > 0) {
      this.hitstopTicks--;
      return; // world frozen — impact crunch
    }

    this.parallax.update();
    this.player.update(this);
    this.checkTransitions();

    // Player melee hitbox vs world.
    const attack = this.player.activeAttack;
    if (attack) {
      const hb = attack.hitbox(this.player);
      if (hb) this.applySwing(attack.swing, hb, this.player.combatStats().attack, this.player.centerX);
    }

    for (const e of this.enemies) if (!e.dead) e.update(this);
    for (const c of this.candles) if (!c.dead) c.update(this);
    for (const p of this.pickups) if (!p.dead) p.update(this);
    for (const p of this.projectiles) if (!p.dead) p.update(this);
    for (const i of this.interactables) if (!i.dead) i.update(this);
    this.tickMedusaSpawners();

    // Enemy contact damage (mist form is intangible).
    const body = this.player.body;
    if (this.player.form !== "mist") {
      for (const e of this.enemies) {
        if (!e.dead && rectsOverlap(e.body, body)) {
          this.player.takeDamage(this, e.stats.touchPower, e.centerX);
        }
      }
    }

    // Particles & floating text.
    for (const pt of this.particles) {
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.vy += 0.06;
      pt.life--;
    }
    for (const t of this.texts) {
      t.y += t.vy;
      t.life--;
    }
    if (this.banner.life > 0) this.banner.life--;

    this.prune();
    this.camera.update(this.player.centerX, this.player.centerY);
  }

  /** Edge spawners: keep up to 3 Medusa Heads alive in the room. */
  private tickMedusaSpawners(): void {
    if (this.medusaSpawners.length === 0) return;
    if (this.player.state.name === "die") return;
    this.medusaSpawnTimer--;
    if (this.medusaSpawnTimer > 0) return;
    const alive = this.enemies.filter((e) => !e.dead && e instanceof MedusaHead).length;
    if (alive >= 3) {
      this.medusaSpawnTimer = 30;
      return;
    }
    const sp = this.medusaSpawners[Math.floor(Math.random() * this.medusaSpawners.length)];
    this.enemies.push(new MedusaHead(sp.x, sp.y, sp.dir));
    this.medusaSpawnTimer = 90;
  }

  private prune(): void {
    const drop = <T extends { dead?: boolean; life?: number }>(arr: T[]) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        const it = arr[i] as { dead?: boolean; life?: number };
        if (it.dead || (it.life !== undefined && it.life <= 0)) arr.splice(i, 1);
      }
    };
    drop(this.enemies);
    drop(this.pickups);
    drop(this.projectiles);
    drop(this.particles);
    drop(this.texts);
    drop(this.candles);
    drop(this.interactables);
  }

  /* ------------------------------- draw ------------------------------- */

  draw(ctx: CanvasRenderingContext2D, alpha: number): void {
    const camX = this.camera.renderX(alpha);
    const camY = this.camera.renderY(alpha);

    this.parallax.draw(ctx, camX);
    this.map.draw(ctx, camX, camY, VIEW_W, VIEW_H);

    for (const i of this.interactables) i.draw(ctx, camX, camY, alpha);
    for (const c of this.candles) c.draw(ctx, camX, camY, alpha);
    for (const p of this.pickups) p.draw(ctx, camX, camY, alpha);
    for (const e of this.enemies) e.draw(ctx, camX, camY, alpha);
    this.player.draw(ctx, camX, camY, alpha);
    for (const p of this.projectiles) p.draw(ctx, camX, camY, alpha);

    // Melee slash arc while active: additive crescent sweeping with the swing.
    const attack = this.player.activeAttack;
    if (attack) {
      const hb = attack.hitbox(this.player);
      if (hb) {
        const f = attack.weapon.frames;
        const t = Math.min(1, Math.max(0, (attack.tick - f.startup) / f.active));
        const p = this.player;
        const cx = p.centerX - camX;
        const cy = (attack.dir === "up" ? p.body.y + 4 : hb.y + hb.h / 2) - camY;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = PAL.slashFx;
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = (0.5 - i * 0.13) * (1 - t * 0.7);
          const r = attack.weapon.reach - i * 4;
          ctx.beginPath();
          if (attack.dir === "up") ctx.arc(cx, cy, r, -Math.PI * 0.75, -Math.PI * 0.25);
          else if (p.facing > 0) ctx.arc(cx, cy, r, -0.9 + t * 1.1, -0.15 + t * 1.1);
          else ctx.arc(cx, cy, r, Math.PI + 0.15 - t * 1.1, Math.PI + 0.9 - t * 1.1);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    for (const pt of this.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x - camX), Math.round(pt.y - camY), pt.size, pt.size);
    }
    ctx.globalAlpha = 1;

    // --- lighting pass: ambient dark + candle glow ---
    ctx.fillStyle = "rgba(8, 5, 18, 0.14)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const c of this.candles) if (!c.dead) c.drawGlow(ctx, camX, camY);
    ctx.restore();

    // Vignette
    if (!this.vignette) {
      this.vignette = ctx.createRadialGradient(
        VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45,
        VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.95,
      );
      this.vignette.addColorStop(0, "rgba(0,0,0,0)");
      this.vignette.addColorStop(1, "rgba(4,2,10,0.38)");
    }
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Floating text above the lighting so numbers stay readable.
    ctx.font = "8px 'Courier New', monospace";
    ctx.textAlign = "center";
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life / 15);
      ctx.fillStyle = "#000000";
      ctx.fillText(t.text, Math.round(t.x - camX) + 1, Math.round(t.y - camY) + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, Math.round(t.x - camX), Math.round(t.y - camY));
    }
    ctx.globalAlpha = 1;

    // Room name banner on entry.
    if (this.banner.life > 0) {
      ctx.globalAlpha = Math.min(1, this.banner.life / 40);
      ctx.font = "10px 'Courier New', monospace";
      ctx.fillStyle = "#000000";
      ctx.fillText(this.banner.text, VIEW_W / 2 + 1, 61);
      ctx.fillStyle = PAL.textGold;
      ctx.fillText(this.banner.text, VIEW_W / 2, 60);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = "left";

    this.hud.draw(ctx, this.player);
    this.minimap.draw(ctx, this.roomId, this.flags, this.tick);

    // Boss HP bar.
    if (this.boss && !this.boss.dead) {
      const w = 200;
      const x = (VIEW_W - w) / 2;
      const y = VIEW_H - 26;
      ctx.font = "8px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = PAL.textWhite;
      ctx.fillText(this.boss.displayName, VIEW_W / 2, y - 4);
      ctx.textAlign = "left";
      ctx.fillStyle = PAL.uiFrameDark;
      ctx.fillRect(x - 1, y - 1, w + 2, 7);
      ctx.fillStyle = PAL.barBack;
      ctx.fillRect(x, y, w, 5);
      const frac = Math.max(0, this.boss.hp / this.boss.maxHp);
      ctx.fillStyle = PAL.hpRed;
      ctx.fillRect(x, y, Math.round(w * frac), 5);
      ctx.fillStyle = PAL.hpRedHi;
      ctx.fillRect(x, y, Math.round(w * frac), 1);
    }

    if (this.menu.open) this.menu.draw(ctx, this);
    if (this.shopUI.open) this.shopUI.draw(ctx, this);
  }
}
