import { Input } from "./engine/input";
import { Camera } from "./engine/camera";
import { VIEW_W, VIEW_H } from "./engine/renderer";
import { audio } from "./engine/audio";
import { rectsOverlap, type Rect } from "./engine/math";
import { PAL } from "./gfx/palette";
import { TILE, TileId } from "./gfx/tiles";
import { ParallaxBackground } from "./gfx/parallax";
import {
  canEnterThrone,
  nextWarp,
  ROOMS,
  START,
  WARP_CYCLE,
  type RoomDef,
} from "./world/rooms";
import type { Tilemap } from "./world/tilemap";
import { Player, type PlayerSave } from "./entities/player/player";
import {
  BatFormState,
  IdleState,
  MistFormState,
  WolfFormState,
} from "./entities/player/states";
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
  Npc,
  RelicPickup,
  SavePoint,
  setNpcQuestHint,
  Shopkeeper,
  WarpPad,
} from "./entities/interactables";
import { BoneColossus } from "./entities/enemies/boss";
import { ClockworkWraith } from "./entities/enemies/wraith";
import { Dracula } from "./entities/enemies/dracula";
import { Zombie } from "./entities/enemies/zombie";
import { SpearGuard } from "./entities/enemies/spearGuard";
import { FleaMan } from "./entities/enemies/fleaMan";
import { ShopUI } from "./ui/shop";
import { Minimap } from "./ui/minimap";
import { music } from "./engine/music";
import { Swing } from "./combat/hitbox";
import { computeDamage, noticeText, type FloatingText } from "./combat/damage";
import { defaultPlayerSave } from "./rpg/defaultSave";
import { writeSlot } from "./rpg/saveSlots";
import { SlotScreen } from "./ui/slots";
import { CutsceneUI } from "./ui/cutscene";
import { pickEnding, type EndingId } from "./data/endings";
import { SUBWEAPONS, type SubweaponId } from "./rpg/subweapons";
import { Hud } from "./ui/hud";
import { Menu } from "./ui/menu";
import { WarpUI } from "./ui/warp";
import { DialogueUI } from "./ui/dialogue";
import { VictoryUI } from "./ui/victory";

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

export interface SaveFile {
  version?: number;
  room: string;
  x: number;
  y: number;
  flags: string[];
  player: PlayerSave;
  playTicks?: number;
  deaths?: number;
  /** Epoch ms of the write — orders the slot list. Missing on legacy saves. */
  savedAt?: number;
}

/** Central game world: rooms, entities, simulation tick and frame drawing. */
export class Game {
  readonly input: Input;
  readonly player: Player;
  readonly parallax = new ParallaxBackground();
  readonly texts: FloatingText[] = [];
  /** Persistent world flags: broken walls, collected relics. */
  flags = new Set<string>();

  map!: Tilemap;
  camera!: Camera;
  private room!: RoomDef;
  private roomId = START.room;
  /** Public room id for map UI / debug. */
  get currentRoomId(): string {
    return this.roomId;
  }
  private lastEntry = { room: START.room, x: START.x, y: START.y };

  private enemies: Enemy[] = [];
  private candles: Candle[] = [];
  private pickups: Pickup[] = [];
  private projectiles: Projectile[] = [];
  private interactables: (RelicPickup | ItemPickup | WarpPad | SavePoint | Shopkeeper | Npc)[] = [];
  private particles: Particle[] = [];
  private hud = new Hud();
  private menu = new Menu();
  private shopUI = new ShopUI();
  private warpUI = new WarpUI();
  private dialogueUI = new DialogueUI();
  private victoryUI = new VictoryUI();
  private slotUI = new SlotScreen();
  private cutsceneUI = new CutsceneUI();
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
  /** Simulation ticks spent in active play (for victory timer). */
  playTicks = 0;
  deaths = 0;
  /** Slot this run reads/writes; null until the player picks one. */
  currentSlot: number | null = null;
  /** Set by the results screen; the App swaps back to the title next tick. */
  exitToTitle = false;

  /**
   * `init` restores a save; omitting it starts a fresh run. The Game never
   * touches localStorage on its own — the App decides what to load.
   */
  constructor(input: Input, init?: SaveFile | null, slot: number | null = null) {
    this.input = input;
    this.currentSlot = slot;
    this.player = new Player(START.x, START.y);
    if (init) this.restoreFrom(init);
    else this.loadRoom(START.room, START.x, START.y);
  }

  private restoreFrom(data: SaveFile): void {
    this.flags = new Set(data.flags ?? []);
    this.player.restore(data.player);
    this.playTicks = data.playTicks ?? 0;
    this.deaths = data.deaths ?? 0;
    this.loadRoom(data.room, data.x, data.y);
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
        case "skeleton": this.enemies.push(new Skeleton(s.x, s.y, this.flags)); break;
        case "bat": this.enemies.push(new Bat(s.x, s.y, this.flags)); break;
        case "fishman": this.enemies.push(new Fishman(s.x, s.y, this.flags)); break;
        case "axeKnight": this.enemies.push(new AxeKnight(s.x, s.y, this.flags)); break;
        case "zombie": this.enemies.push(new Zombie(s.x, s.y, this.flags)); break;
        case "spearGuard": this.enemies.push(new SpearGuard(s.x, s.y, this.flags)); break;
        case "fleaMan": this.enemies.push(new FleaMan(s.x, s.y, this.flags)); break;
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
        case "npc":
          if (s.id) this.interactables.push(new Npc(s.id, s.x, s.y));
          break;
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
    // Final throne gate on the right of the Clockwork Spire.
    if (id === "towerTop") {
      const open = canEnterThrone(this.flags);
      for (let r = 8; r <= 10; r++) {
        this.map.setTile(31, r, open ? TileId.Door : TileId.Gate);
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
    // Keep transformation across doors (gates still block non-mist).
    const keptForm = p.form;
    p.body.vx = 0;
    p.body.vy = 0;
    p.activeAttack = null;
    p.sonicRun = false;
    if (keptForm === "bat") p.setHitboxSize(18, 14);
    else if (keptForm === "wolf") p.setHitboxSize(28, 16);
    else if (keptForm === "mist") p.setHitboxSize(12, 16);
    else p.setHitboxSize(12, 28);
    p.form = keptForm;
    p.body.phaseThrough = keptForm === "mist";
    p.body.x = x - p.body.w / 2;
    p.body.y = y - p.body.h;
    // Human always lands in Idle. Forms keep their state machine (no re-poof).
    if (keptForm === "human") {
      p.setState(new IdleState(), this);
    } else if (p.state.name !== keptForm) {
      // Safety: state and form out of sync (e.g. after hurt) — re-enter quietly.
      if (keptForm === "bat") p.setState(new BatFormState(), this);
      else if (keptForm === "wolf") p.setState(new WolfFormState(), this);
      else if (keptForm === "mist") p.setState(new MistFormState(), this);
    }
    this.lastEntry = { room: id, x, y };
    this.banner = { text: def.name, life: 170 };
    this.camera.snapTo(p.centerX, p.centerY);
  }

  private checkTransitions(): void {
    const p = this.player;
    const cx = p.centerX;
    const cy = p.centerY;
    // Edge thresholds use body extents so wide forms (wolf) can still cross doors.
    // (Outside map is solid Brick — centerX never gets past ~half-width otherwise.)
    const leftEdge = p.body.x <= 2;
    const rightEdge = p.body.x + p.body.w >= this.map.widthPx - 2;
    for (const exit of this.room.exits) {
      const hit =
        (exit.side === "right" && rightEdge && cy >= exit.min && cy <= exit.max) ||
        (exit.side === "left" && leftEdge && cy >= exit.min && cy <= exit.max) ||
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
    this.shopUI.open = true;
  }

  openDialogue(npcId: string): void {
    this.dialogueUI.startFromNpc(this, npcId);
  }

  /** Called by bosses on death: open gate, drop configured rewards. */
  onBossDefeated(bossId: string): void {
    this.flags.add(`boss:${bossId}`);
    const cx = this.boss?.centerX ?? this.player.centerX;
    const cy = this.boss?.body.y ?? this.player.body.y;
    this.boss = null;
    if (this.room.boss) {
      // Restore dark doorway tiles (not Empty — Empty would show outdoor sky).
      for (const [c, r] of this.room.boss.gateCells) {
        this.map.setTile(c, r, TileId.Door);
      }
    }
    music.setTrack("castle");
    this.camera.addShake(0.6);
    audio.play("levelup");
    this.offerBossRewards(this.room);
    for (let i = 0; i < 6; i++) {
      this.spawnPickup("gold", cx + (Math.random() * 60 - 30), cy + 10);
    }
    // Throne clear (Dracula) → ending cutscene, then the results screen.
    if (bossId === "dracula" || bossId === "sovereign") {
      const ending = pickEnding(this.flags);
      this.flags.add(`ending:${ending}`);
      this.cutsceneUI.play(this, ending);
    }
    // Unlock the spire's right gate if the player now qualifies.
    if (this.roomId === "towerTop" && canEnterThrone(this.flags)) {
      for (let r = 8; r <= 10; r++) this.map.setTile(31, r, TileId.Door);
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
      case "colossus": return new BoneColossus(x, y, "colossus", this.flags);
      case "sovereign": return new BoneColossus(x, y, "sovereign", this.flags);
      case "wraith": return new ClockworkWraith(x, y, this.flags);
      case "dracula": return new Dracula(x, y, this.flags);
      default: return null;
    }
  }

  /** Inject an enemy mid-room (e.g. boss summons). */
  spawnEnemy(enemy: Enemy): void {
    this.enemies.push(enemy);
  }

  warpFrom(_pad: WarpPad): void {
    // With 3+ pads, open the destination list; otherwise hop to the next pad.
    if (WARP_CYCLE.length >= 3) {
      this.warpUI.show(this.roomId);
      return;
    }
    const link = nextWarp(this.roomId);
    if (!link) return;
    audio.play("spell");
    this.loadRoom(link.room, link.x, link.y);
    this.camera.addShake(0.3);
    this.player.iframes = Math.max(this.player.iframes, 30);
  }

  /* ---------------------------- persistence ---------------------------- */

  /** Serialize the run as it stands right now. */
  snapshot(): SaveFile {
    const p = this.player;
    return {
      version: 1,
      room: this.roomId,
      x: p.centerX,
      y: p.body.y + p.body.h,
      flags: [...this.flags],
      player: p.serialize(),
      playTicks: this.playTicks,
      deaths: this.deaths,
      savedAt: Date.now(),
    };
  }

  /** Write to `slot` (default: the slot this run is bound to). */
  saveGame(slot?: number): boolean {
    const target = slot ?? this.currentSlot ?? 0;
    const ok = writeSlot(target, this.snapshot());
    if (ok) this.currentSlot = target;
    return ok;
  }

  /** Save pedestal → slot picker (heals only once a slot is written). */
  openSaveSlots(): void {
    this.slotUI.openPicker("save", (slot) => {
      const p = this.player;
      p.res.hp = p.res.maxHp;
      p.res.mp = p.res.maxMp;
      const ok = this.saveGame(slot);
      this.texts.push(
        noticeText(
          p.centerX,
          p.body.y - 10,
          ok ? `Saved to slot ${slot + 1}` : "Save failed",
          ok ? PAL.textGold : PAL.dmgPlayer,
        ),
      );
      audio.play(ok ? "heart" : "hurt");
    });
  }

  /** Results screen → back to the title (the App picks this up). */
  requestExitToTitle(): void {
    this.exitToTitle = true;
  }

  /** Fresh run at the entrance (keeps nothing; leaves save slots alone). */
  startFreshRun(): void {
    this.flags = new Set();
    this.playTicks = 0;
    this.deaths = 0;
    this.player.restore(defaultPlayerSave());
    this.loadRoom(START.room, START.x, START.y);
  }

  /** NG+: keep player power, mark harder enemies, soft at entrance. */
  startNewGamePlus(): void {
    this.flags.add("ng+:1");
    // Clear visit/boss progress but keep relics + items + quests done.
    for (const f of [...this.flags]) {
      if (f.startsWith("visited:") || f.startsWith("boss:") || f.startsWith("wall:")) {
        this.flags.delete(f);
      }
    }
    this.flags.add("ng+:1");
    this.playTicks = 0;
    this.deaths = 0;
    this.player.res.hp = this.player.res.maxHp;
    this.player.res.mp = this.player.res.maxMp;
    this.loadRoom(START.room, START.x, START.y);
    this.saveGame();
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

  /** Bat form fireball — flat, dies on hit/wall (SotN-style). */
  spawnBatFire(p: Player): void {
    const attrs = p.inventory.effectiveAttributes(p.attrs);
    const power = 10 + Math.floor(attrs.int * 1.2);
    this.projectiles.push(
      new Projectile("batFire", p.centerX + p.facing * 12, p.centerY - 2, p.facing, power),
    );
  }

  /** Enemy-fired projectile (bones, spit, thrown axes, blood, …). */
  spawnHostile(
    kind: "bone" | "spit" | "axeThrow" | "blood",
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
    this.deaths++;
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

  /** Called by CutsceneUI when the last panel closes. */
  showResults(ending: EndingId): void {
    this.victoryUI.show(ending);
  }

  update(): void {
    // NOTE: input.beginTick() is driven by the App (one call per tick for
    // the whole app), not here — calling it again would double-fire presses.
    this.tick++;

    // Cutscene, results, dialogue, shop, pickers and pause menu freeze the world.
    setNpcQuestHint(!this.flags.has("quest:coral:done"));
    if (this.cutsceneUI.open) {
      this.cutsceneUI.update(this);
      return;
    }
    if (this.victoryUI.open) {
      this.victoryUI.update(this);
      return;
    }
    if (this.slotUI.open) {
      this.slotUI.update(this.input);
      return;
    }
    if (this.dialogueUI.open) {
      this.dialogueUI.update(this);
      return;
    }
    if (this.shopUI.open) {
      this.shopUI.update(this);
      return;
    }
    if (this.warpUI.open) {
      this.warpUI.update(this);
      return;
    }
    if (this.menu.open) {
      this.menu.update(this);
      return;
    }

    this.playTicks++;
    if (this.input.pressed("menu")) {
      this.input.consume("menu");
      this.menu.toggle();
      return;
    }

    // Quick sub-weapon cycle (dagger ↔ axe); persists via PlayerSave.subweapon.
    if (this.input.pressed("swapSub")) {
      this.input.consume("swapSub");
      const p = this.player;
      p.subweapon = p.subweapon === "dagger" ? "axe" : "dagger";
      audio.play("pickup");
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
    // Medusa Heads petrify (SotN) instead of a normal knockback hurt.
    // Wolf sonic run: player body damages enemies (and takes no contact hit).
    // Contact also unlocks the enemy book entry (you've met this foe).
    const body = this.player.body;
    if (this.player.form !== "mist") {
      for (const e of this.enemies) {
        if (e.dead || !rectsOverlap(e.body, body)) continue;
        if (e.bestiaryId) this.flags.add(`bestiary:${e.bestiaryId}`);
        if (this.player.sonicRun) {
          // Body-ram: once per enemy until sonic ends (iframes on enemy via hurt flash)
          if (e.hurtFlash === 0) {
            const power = 14 + Math.floor(this.player.combatStats().attack * 0.35);
            e.takeDamage(this, computeDamage(power, e.stats.defense, 0), this.player.centerX);
            this.camera.addShake(0.15);
          }
          continue; // invulnerable while sonic
        }
        if (e instanceof MedusaHead) {
          this.player.petrify(this, e.stats.touchPower, e.centerX);
        } else {
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
    this.enemies.push(new MedusaHead(sp.x, sp.y, sp.dir, this.flags));
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

  /** Red draped backdrop for the Throne of Night (SotN-inspired). */
  private drawThroneCurtains(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const mapH = this.map.heightPx;
    const mapW = this.map.widthPx;
    // Deep crimson wall wash
    ctx.fillStyle = "#3a0a14";
    ctx.fillRect(Math.round(-camX), Math.round(-camY), mapW, mapH);
    // Vertical curtain folds across the back
    for (let i = 0; i < 14; i++) {
      const x = 24 + i * 52;
      const wave = Math.sin(i * 1.7) * 6;
      ctx.fillStyle = i % 2 === 0 ? "#6a1020" : "#501018";
      ctx.fillRect(Math.round(x - camX + wave), Math.round(8 - camY), 28, mapH - 48);
      ctx.fillStyle = "#8a1830";
      ctx.fillRect(Math.round(x + 4 - camX + wave), Math.round(8 - camY), 4, mapH - 48);
      ctx.fillStyle = "#2a0810";
      ctx.fillRect(Math.round(x + 22 - camX + wave), Math.round(8 - camY), 3, mapH - 48);
    }
    // Red carpet strip on the floor path
    ctx.fillStyle = "#5a1018";
    ctx.fillRect(Math.round(80 - camX), Math.round(mapH - 56 - camY), mapW - 120, 20);
    ctx.fillStyle = "#7a1828";
    ctx.fillRect(Math.round(80 - camX), Math.round(mapH - 54 - camY), mapW - 120, 4);
    // Dark upper valence
    ctx.fillStyle = "#1a0408";
    ctx.fillRect(Math.round(-camX), Math.round(-camY), mapW, 20);
  }

  draw(ctx: CanvasRenderingContext2D, alpha: number): void {
    const camX = this.camera.renderX(alpha);
    const camY = this.camera.renderY(alpha);

    this.parallax.draw(ctx, camX);
    // SotN-style red curtains behind the throne hall.
    if (this.roomId === "throne") {
      this.drawThroneCurtains(ctx, camX, camY);
    }
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

    // Low-HP heartbeat vignette pulse below 20%.
    const hpFrac = this.player.res.hp / Math.max(1, this.player.res.maxHp);
    if (hpFrac > 0 && hpFrac < 0.2 && this.player.state.name !== "die") {
      const pulse = 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(this.tick * 0.18));
      const g = ctx.createRadialGradient(
        VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35,
        VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85,
      );
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(120, 10, 24, ${pulse.toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

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
    if (this.warpUI.open) this.warpUI.draw(ctx);
    if (this.dialogueUI.open) this.dialogueUI.draw(ctx);
    if (this.slotUI.open) this.slotUI.draw(ctx);
    if (this.victoryUI.open) this.victoryUI.draw(ctx, this);
    if (this.cutsceneUI.open) this.cutsceneUI.draw(ctx);
  }
}
