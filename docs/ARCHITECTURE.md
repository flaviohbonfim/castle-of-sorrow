# Castle of Sorrow — Architecture Reference

> Complete documentation of everything implemented through Milestone 3.
> Read this **before** changing any system. The companion file
> [`ROADMAP.md`](ROADMAP.md) describes what to build next.

## 1. Project overview

A SotN-inspired 2D Action-RPG Metroidvania, built as a 16-bit "demaster":
low-res pixel rendering with modern game-feel. **Zero external assets** — all
sprites, tiles, SFX and music are generated procedurally at boot.

- **Stack:** TypeScript (strict) + HTML5 Canvas 2D + Vite. No runtime
  dependencies. No framework, no physics engine.
- **Commands:**
  - `npm run dev` — Vite dev server on port 5173 (also via `.claude/launch.json` name `game-dev`)
  - `npm run typecheck` — `tsc --noEmit`; **must stay clean**
  - `npm run build` — typecheck + production build

## 2. Directory map

```
src/
├── main.ts                  # boot: Renderer + App + startLoop; DEV exposes __app / __game / __validateMap
├── app.ts                   # screen state machine (title | slots | playing); owns Input
├── dev/
│   └── validateMap.ts       # static castle-topology audit (see §14.1)
├── game.ts                  # Game class: world orchestration (THE central file)
├── engine/
│   ├── loop.ts              # fixed 60Hz timestep + render interpolation alpha
│   ├── input.ts             # action mapping, press buffering, command detection
│   ├── renderer.ts          # 480x270 backbuffer, integer scaling, makeSurface()
│   ├── camera.ts            # deadzone follow, bounds clamp, trauma shake
│   ├── audio.ts             # SFX synth (audio.play(name))
│   ├── music.ts             # chiptune sequencer + optional ogg override
│   ├── settings.ts          # localStorage prefs (language, scanlines)
│   └── math.ts              # Vec2/Rect, rectsOverlap, clamp, lerp, chance...
├── gfx/
│   ├── palette.ts           # PAL: every color in the game (single source of truth)
│   ├── sprites.ts           # ALL sprite generation (pixelMap ASCII art + part-based player)
│   ├── assets.ts            # optional PNG/ogg override loader (Phase 9)
│   ├── resolveSprites.ts    # getSheet override or procedural fallback
│   ├── scanlines.ts         # CRT overlay
│   ├── tiles.ts             # TILE=16, TileId enum, buildTileset()
│   └── parallax.ts          # pre-rendered background layers
├── world/
│   ├── tilemap.ts           # Tilemap: at/setTile/isSolid/isOneWay/draw
│   ├── collision.ts         # moveBody (axis-separated AABB), groundAhead
│   ├── rooms.ts             # RoomBuilder, ROOMS registry, exits, WARP_CYCLE, START
│   └── castlePlan.ts        # wings, floor datums, door profiles (see CASTLE_PLAN.md)
├── entities/
│   ├── entity.ts            # abstract Entity base (body, facing, savePrev, renderX/Y)
│   ├── player/
│   │   ├── player.ts        # Player, PHYS constants, forms, serialize/restore
│   │   ├── states.ts        # full FSM incl. transformation states
│   │   └── attacks.ts       # AttackInstance: frame-data-driven melee hitboxes
│   ├── enemies/
│   │   ├── enemy.ts         # Enemy base: takeDamage, drops, hurt flash
│   │   ├── skeleton.ts      # walker (patrols, turns at walls/ledges)
│   │   ├── bat.ts           # flyer (hover + swoop)
│   │   └── boss.ts          # BoneColossus (walk/windup/charge, enrage)
│   ├── candle.ts            # breakable candle + additive glow
│   ├── pickup.ts            # heart/bigHeart/gold/potion drops, magnetize
│   ├── projectile.ts        # dagger/axe/spell/fire/bone (hostile flag)
│   └── interactables.ts     # RelicPickup, WarpPad, SavePoint, Shopkeeper, RELIC_NAMES
├── rpg/
│   ├── stats.ts             # Attributes, Resources, deriveCombat()
│   ├── items.ts             # ITEMS catalog, WeaponDef frame data, EquipSlot
│   ├── inventory.ts         # Inventory: items, gold, 7 equip slots, equipmentTotals()
│   ├── leveling.ts          # expToNext(), grantExp() with stat growth
│   └── subweapons.ts        # SUBWEAPONS: dagger/axe, heart costs
└── ui/
    ├── hud.ts               # HP/MP bars, hearts, gold, level, weapon name
    ├── menu.ts              # pause menu: stats/equipment/inventory
    ├── shop.ts              # ShopUI + STOCK table
    └── minimap.ts           # corner minimap from RoomDef.mapRect
```

## 3. Core timing model

- `engine/loop.ts` runs a **fixed 60Hz simulation** (accumulator pattern).
  ALL gameplay values are per-tick: velocities in px/tick, durations in ticks.
- Rendering runs at display rate; `alpha` (0..1) interpolates between the
  previous and current tick positions. Every entity calls `savePrev()` at the
  top of `update()` and draws at `renderX(alpha)/renderY(alpha)`.
- `Game.hitstop(ticks)` freezes the whole simulation briefly on impacts.
- When the browser tab is hidden, rAF stops → the game pauses. This is
  intended behavior.

## 4. Input system (`engine/input.ts`)

- Physical keys map to abstract `Action`s (`KEY_MAP`). Current actions:
  `left right up down jump attack subweapon backdash potion menu formBat formWolf formMist`.
- `held(a)` — live key state. `pressed(a)` — edge-trigger with a **6-tick
  buffer** (jump buffering). **Always `consume(a)` after acting on a press**
  or it will re-trigger for up to 6 ticks.
- `command(seq)` — directional tap-sequence detection (e.g.
  `command(["down","up"])`) over a 30-tick window; used for spells.
  `clearCommands()` after a successful cast.
- `beginTick()` must be called exactly once per simulation tick (Game.update
  does this first thing).

## 5. Rendering pipeline (`Game.draw` — ORDER MATTERS)

1. Parallax background (`parallax.draw`, scrolls with camX only)
2. Room backdrop (`gfx/backdrop.ts`, Strategy C) — camera-culled blit of one
   continuous painted image per room; when present the tilemap skips
   BgWall/BgWindow (`skipDecor`)
3. Tilemap
4. Scenery props (`entities/prop.ts` — throne/banner/chandelier/column,
   draw-only, behind actors)
5. Interactables → candles → pickups → enemies → **player** → projectiles
6. Melee slash arc FX (additive crescents — never draw plain rects for FX)
7. Particles
8. **Lighting pass:** ambient dark overlay `rgba(8,5,18,0.14)` → additive
   candle glows + prop glows (chandeliers) → vignette
9. Floating texts (damage numbers) — above lighting so they stay readable
10. Room-name banner
11. HUD → minimap → boss HP bar
12. Menu / Shop overlays (only when open)

Pixel-perfect rules: `Math.round()` every draw coordinate; the backbuffer is
480x270 (`VIEW_W`/`VIEW_H`) integer-scaled to the window.

## 6. World model

### Tiles (`gfx/tiles.ts`, `world/tilemap.ts`)

`TILE = 16`. `TileId`: Empty, Brick, FloorTop, Platform (one-way),
PillarTop/Pillar/PillarBase, BgWall, BgWindow, Cracked (breakable, solid),
Gate (boss door, solid), Water/WaterTop (swimmable), Door (passage arch). Solidity lives in `Tilemap.isSolid`; one-way in
`isOneWay`. Outside the map: solid horizontally, **open below row max**
(rooms with floor holes let you fall out → bottom exits).

### Collision (`world/collision.ts`)

`moveBody(body, map)`: horizontal sweep then vertical sweep. One-way
platforms only collide when falling onto them from above and
`body.dropThrough` is false (the player sets `dropTimer=8` for ↓+jump).
`groundAhead(body, map, dir)` is used by walkers for ledge turns.

### Rooms (`world/rooms.ts` + `world/castlePlan.ts`)

- **`castlePlan.ts`** is the architectural source of truth: wings, floor
  datums, door profiles (`GALLERY`/`HALL`/`GRAND`/…). See
  [`docs/CASTLE_PLAN.md`](CASTLE_PLAN.md). Room builders and exits MUST use
  profile constants (`GALLERY.floorY`, `sideDoorBand(id)`, …) so painted
  backdrops can continue across doors. Continuous side-door runs share one
  feet-Y; intentional height changes are listed as steps in the plan.
- Rooms are built by `RoomBuilder` (helpers: `frame/hline/fill/pillar/
  windows/punch/at`). `punch` opens doorways in border walls.
- `Spawn` markers use **cell coordinates**; `at(kind, c, r)` resolves
  `y = (r+1)*TILE` = the walking surface below the marker cell. Spawn `x/y`
  are **feet/bottom-center** for grounded things, center for flyers.
- `RoomDef`: `{ id, name, exits, mapRect, build() }`.
  - `exits`: `{ side, min, max, target, tx, ty }` — min/max are a **pixel
    range on the perpendicular axis** (y-range for left/right doors, x-range
    for top/bottom holes); `tx/ty` = entry feet position in the target room.
  - `mapRect` `{gx,gy,gw,gh}`: minimap footprint in abstract grid cells.
- Current rooms & topology:

```
                 [towerHall]——[towerTop]——[approach]——[sovereign]——[throne]
                      |
                 [towerShaft]
                      |
  [chapel]——[entrance]——[corridor]——[library]——[saveRoom]
                 |           ^ (dbl-jump hatch)
                 v pit
  [lake]——[cavern]——[shop]——[bossRoom]
    |
    v dive shaft (flooded)
  [lakeDepths]——[catacombs]
```

**Rules — all machine-checked by `__validateMap()` (see §14.1):**
1. Each pair of adjacent rooms has exactly ONE link (door or shaft). No
   double entries (e.g. door + floor hole to the same room).
2. Every exit is reciprocal and on the opposite side of the target.
3. The exit's `side` must agree with the minimap direction: a `left` exit's
   target sits at a smaller `gx`, a `bottom` exit's target at a larger `gy`.
   (This is why lake→lakeDepths is a *bottom* dive shaft: the depths sit
   below on the map. A side door there was the old inconsistency.)
4. Entry points (`tx`,`ty`) must be free of solid tiles for the 12x28
   standing hitbox, supported by ground (side doors land flat), and must not
   re-trigger an exit on arrival (bounce loop).
5. Minimap scale: **one grid cell ≈ 16 columns × 12 rows**, rounded, so
   footprints reflect real room size. `mapRect`s may use negative `gx`/`gy`
   (tower wing above, lake wing left) — both map renderers normalize.

- `WARP_CYCLE` + `WARP_PADS` + `nextWarp(room)`: ordered pad cycle
  (corridor → cavern → towerHall → …).
- `START = { room: "entrance", x: 56, y: 320 }`.
- Jump tuning vs level design: single jump reaches **≤ 3.5 tiles (63px)**;
  double jump ~100px. The cavern climb intentionally has one 64px gap as a
  double-jump gate. Keep new rooms consistent with these numbers.

### Room loading (`Game.loadRoom(id, x, y)`)

Rebuilds map + entities from the RoomDef (candles/enemies respawn —
classic behavior), then:
- re-applies persistent state from `Game.flags` (broken walls, collected
  relics, slain boss),
- closes the boss gate if the boss is alive,
- resets the player to human form, positions feet at `(x, y)`,
- records `lastEntry` (used by `respawn()`), adds `visited:<id>` flag,
- switches the music track, snaps the camera, shows the room banner.

## 7. Persistence

- **Three slots**, keys `castle-of-sorrow-save:0..2`. `src/rpg/saveSlots.ts`
  is the ONLY module that touches localStorage for saves — go through
  `readSlot / writeSlot / deleteSlot / slotSummary / anySlotUsed`, all of
  which swallow their own errors (private mode must not crash the game).
  The pre-slot key `castle-of-sorrow-save` is migrated into slot 0 once by
  `migrateLegacy()` at App boot, then removed. **Keys are append-only.**
- Shape (`SaveFile`, exported from `game.ts`): `{ version, room, x, y,
  flags: string[], player: PlayerSave, playTicks, deaths, savedAt }` where
  `PlayerSave = { attrs, res, levelState, relics, subweapon,
  inventory: { items, gold, equipment } }`. Readers must tolerate missing
  `playTicks` / `deaths` / `savedAt` (legacy files).
- `Game.saveGame(slot?)` writes `Game.snapshot()` to `slot ?? currentSlot`.
  The SavePoint pedestal calls `Game.openSaveSlots()` — healing and the
  write happen only once a slot is actually chosen.
- The starting loadout lives in `src/rpg/defaultSave.ts`
  (`defaultPlayerSave()`), used by both the `Player` constructor and
  `startFreshRun()` — never re-inline it.
- **`Game.flags` namespaces** (extend, never repurpose):
  - `wall:<roomId>:<col>:<row>` — broken cracked tile
  - `relic:<relicId>` — collected/purchased relic (suppresses respawn)
  - `visited:<roomId>` — minimap reveal
  - `boss:<bossId>` — boss slain (no respawn, no gate)
  - `item:<roomId>:<n>` — unique world item taken
  - `quest:<id>:done` — quest resolved
  - `ending:<id>` — ending the player has seen
  - `ng+:1` — New Game+ multiplier active
- Death → `respawn()`: full heal + reload `lastEntry` room/position.

### 7.1 App shell & screens (Phase 8.5)

`src/app.ts` owns a screen state machine — `"title" | "slots" | "playing"` —
plus the single `Input` and the active `Game` (null on the title).

- **The App calls `input.beginTick()` exactly once per tick for the whole
  application.** `Game.update()` must never call it again or every press
  fires twice. This is the easiest thing to break here.
- `new Game(input, init?, slot?)` — `init` is a `SaveFile` to restore, or
  omitted for a fresh run. The Game never reads localStorage itself.
- Returning to the title: the results screen calls
  `Game.requestExitToTitle()`, which sets `exitToTitle`; the App polls it
  and swaps screens (keeps App and Game free of a circular import).
- `src/ui/title.ts` — parallax backdrop + logotype + New Game / Load Game
  (Load is dimmed when no slot is used).
- `src/ui/slots.ts` — one `SlotScreen` reused by the App (load / new) and
  the Game (save pedestal): `openPicker(mode, onPick, onCancel)`, with
  overwrite and delete confirmations.

### 7.2 Ending cutscene (Phase 8.5)

- `src/gfx/scenes.ts` — full-screen procedural panels, each a pure
  `(ctx, age) => void`. **Compose above `STAGE_FLOOR`**: the cutscene
  letterboxes the top 18px and everything below `VIEW_H - 62`, so anything
  drawn lower is hidden behind the narration box.
- `src/data/endings.ts` — all ending prose plus `pickEnding(flags)`.
  Two endings: `"true"` when every relic and unique item was collected,
  else `"short"`. Never bake narration into UI code.
- `src/ui/cutscene.ts` — fades, typewriter narration, one panel at a time;
  calls `Game.showResults(ending)` at the end.
- **Input lockout (`LOCK_TICKS = 45`)**: the final boss dies with `attack`
  still buffered, which used to dismiss the whole ending on the same frame.
  Both `CutsceneUI` and the results screen clear the buffer on open and
  ignore confirms for the lockout. A confirm during typing completes the
  line instead of skipping the panel. Keep both behaviors.

## 8. Player

### Physics (`PHYS` in player.ts — tuning table, edit values not code)

walkSpeed 1.7 · gravity 0.26 · jumpVel −5.6 · shortHopGravityMult 2.3 ·
coyoteTicks 5 · backdashSpeed 3.8 / 16 ticks / 10 i-frame ticks ·
knockback (2.0, −2.6) · hurtIframes 60. Hitbox: 12x28 standing, 12x18
crouched (feet-anchored resizes via `setHitboxSize`).

### State machine (`states.ts`)

States: Idle, Walk, Crouch, Jump, Fall, Attack, Backdash, SpellCast, Hurt,
Die, BatForm, WolfForm, MistForm. Each state has `enter/update/exit`;
`update` returns the next state or null. Shared helpers: `tryJump` (incl.
swim stroke when `inWater`, double jump via `doubleJump` relic +
`airJumpsLeft`), `tryBackdash`, `tryAttack` (spells first, then melee),
`trySubweapon`, `tryForm`, `steer` (×0.6 max speed in water).

Cancel rules (SotN-authentic, preserve them):
- Backdash → jump-cancellable at any point; i-frames on startup.
- Grounded attacks plant the feet; air attacks keep momentum.
- Variable jump: releasing jump while rising multiplies gravity.
- Crouch + jump = drop through one-way platforms.
- Water: gravity ×0.35, terminal 1.2, free swim-jump (no air-jump spend).
  `waterWalk` relic + `body.walkOnWater` makes `WaterTop` one-way (hold ↓ to
  sink). Splash SFX/particles on water entry.
- High jump (`highJump` / Gravity Boots): crouch + jump on solid ground
  launches `vy = -8.5`. On one-way platforms, crouch+jump still drops through.

### Transformations

`player.form: "human" | "bat" | "wolf" | "mist"`. Keys 1/2/3 gated by
relics `batForm/wolfForm/mistForm`. Bat: 8-way flight, no gravity, 1 MP per
30 ticks. Wolf: ground physics, speed 2.7, can jump, no drain. Mist:
slow 8-way drift, **intangible** (Game skips contact damage; `takeDamage`
early-returns; hostile projectiles check `form !== "mist"`), 1 MP per 15
ticks. MP exhausted or same key → revert, but **only if `canStandHuman()`**
(headroom probe). Taking damage force-reverts to human. `loadRoom` always
calls `becomeHuman()`.

### Spells (directional commands + attack)

- Soul Lance — `↓,↑ + X`, 10 MP, piercing bolt, power `12 + INT*2`.
- Hellfire — `↑,↓ + X`, 16 MP, 3 arcing fireballs, power `8 + INT*1.5`.

## 9. Combat

- **Damage formula** (`combat/damage.ts`): `max(1, (ATK − DEF) * rand(0.9..1.1))`,
  crit ×1.5 with chance `min(0.35, 0.03 + LCK*0.008)`.
- **Swing registry** (`combat/hitbox.ts`): each attack instance owns a
  `Swing`; `swing.register(target)` guarantees one hit per target per swing
  even though hitboxes persist across active frames.
- **Melee**: `AttackInstance` reads the equipped weapon's frame data
  (`startup/active/recovery` ticks) and `reach`. Hitbox exists only during
  the active phase. Game applies it each tick via `applySwing`.
- **`Game.applySwing(swing, rect, power, fromX, onFirstHit?)`** routes any
  player-owned rect against enemies, candles AND cracked walls
  (`breakWalls`). Player attack power = `combatStats().attack`
  (weapon + STR via the equipment pipeline — never hardcode).
- **Projectiles** (one class, `kind` + `hostile` flag):

  | kind   | owner  | motion              | terrain | notes |
  |--------|--------|---------------------|---------|-------|
  | dagger | player | flat, fast          | stops   | dies on first hit |
  | axe    | player | arc + spin          | pierces | 2 hearts |
  | spell  | player | flat bolt           | pierces | Soul Lance |
  | fire   | player | shallow arc         | pierces | Hellfire (3x spread) |
  | bone   | enemy  | arc                 | pierces | hurts player on touch |
  | spit   | enemy  | flat, slow          | stops   | Fishman blob |
  | axeThrow | enemy | arc + spin        | pierces | Axe Knight |

  Enemy shots: `Game.spawnHostile("bone"|"spit"|"axeThrow", x, y, dir, power, vyBoost?)`.
- **Enemy base** (`enemies/enemy.ts`): `takeDamage(game, DamageResult, fromX)`
  handles flash/knockback/hitstop/shake/floating number/death; `die()` grants
  EXP + rolls gold/heart drops. Override `onHit` (knockback) and `die`.
- **Bosses** are data-driven via `RoomDef.boss: { id, gateCells, rewards }`.
  Spawn `kind:"boss"` + `id` builds the fight; flag `boss:<id>` is append-only.
  On death: `game.onBossDefeated(bossId)` opens gate cells, spawns rewards,
  gold shower, music back to castle.
  - Colossus (`boss.ts`): walk → windup → bone volley / charge; enrage <50%.
  - Wraith (`wraith.ts`): teleport fade, 3-way spit, summons Medusa at half HP.
- **Zone palettes**: `buildTileset("castle"|"tower")`; tower uses bronze/
  verdigris stone ramp. `RoomDef.zone` flows through `RoomBuilder` → `Tilemap`.

## 10. RPG layer

- **Attributes** STR/CON/INT/LCK + Resources HP/MP/Hearts.
  `deriveCombat(attrs, weaponAtk, gearDef)` → `{attack, defense, critChance}`.
- **Items** (`rpg/items.ts`): typed catalog `ITEMS`. Weapons carry class
  (sword/whip/rapier), atk, **frame data**, reach, optional stat bonus.
  Armor has a slot; shields go to leftHand; consumables restore HP/MP.
- **Inventory** (`rpg/inventory.ts`): stacked `items`, `gold`, and
  `equipment` — 7 slots (rightHand, leftHand, head, body, cloak,
  accessory1, accessory2). `equipmentTotals()` sums ATK/DEF/bonuses;
  `effectiveAttributes(base)` applies gear bonuses. The combat engine reads
  everything through this — equipping instantly changes damage math.
- **Leveling** (`rpg/leveling.ts`): `expToNext(level) = 20 + level²*8`;
  level-up grows stats deterministically and refills HP/MP.
- **Sub-weapons**: dagger (1 heart), axe (2 hearts); power scales with STR/2.
  Throw = C; hold ↑+C for axe.

## 11. Graphics generation (`gfx/sprites.ts`)

Two techniques, both drawing into offscreen canvases at boot:
1. **ASCII pixel maps** — `pixelMap(rows, legend)`; a string grid where each
   char is a palette color. Used for enemies, props, forms, boss, NPCs.
2. **Part-based composition** — the human player is drawn from
   parameterized parts (`drawPlayerPose`); poses vary legs/arm/lean/bob.

`SpriteSet = { right, left }` (left is auto-mirrored). All colors MUST come
from `PAL` (`gfx/palette.ts`). Entity sprites are cached in
module/static fields — **initialize them in constructors, never lazily in
`update()`** (draw can run before the first update; this caused a real
first-frame crash once — see §14).

## 12. Audio

- **SFX** (`engine/audio.ts`): `audio.play(name)` — envelope-shaped
  oscillator bursts + noise. Add new names to the `SfxName` union + switch.
- **Assets** (`gfx/assets.ts`): optional `public/assets/manifest.json` overrides
  for sprite sheets and music; boot awaits `loadAssets()` before the loop.
- **Music** (`engine/music.ts`): chiptune lookahead scheduler; optional ogg
  from the manifest silences the sequencer for that track. Lookahead (setInterval 40ms,
  0.15s horizon) placing square bass / triangle lead / noise hats on an
  8th-note grid from midi-note pattern arrays. Tracks: `castle`, `boss`.
  `music.start()` must be called from a user gesture (main.ts does this on
  first keydown). `music.setTrack()` switches loops.

## 13. UI

- **Hud**: bars + counters, reads Player directly.
- **Menu** (Tab/E/Esc): freezes world (Game.update early-returns). Panels:
  equipment / inventory; X equips/uses/unequips; relics listed.
- **ShopUI**: same freeze pattern; `STOCK` table in ui/shop.ts; relic
  entries filtered out once owned (via `relic:` flag).
- **WarpUI** (`ui/warp.ts`): destination list when `WARP_CYCLE.length ≥ 3`;
  freezes world like the shop.
- **Menu panels**: Equip / Items / Map (←→). Map draws visited `mapRect`s
  ×3 minimap scale, door notches from exits, ♦ save / ▲ warp markers;
  X toggles music mute.
- **Input**: keyboard + `GamepadAdapter` (`engine/gamepad.ts`) inject into
  the same pending/released queues. Action `swapSub` (KeyV / Select)
  cycles dagger↔axe.
- **Music**: `music.setVolume` / `setMuted` / `toggleMuted`.
- **Dialogue** (`ui/dialogue.ts` + `data/dialogues.ts`): world-freeze textbox
  with portrait, name, multi-page lines. NPCs resolve lines from flags/
  inventory (`NPC_DEFS.pickDialogue`). Hermit: talk → dialogue → shop.
  Quest-lite example: `quest:coral:offered` / `quest:coral:done` — deliver
  Coral Ring for +10 max HP and shop prices ×0.8. Map shows `!` on shop
  while the quest is open. Flavor NPCs: Pale Knight (gallery), Caged Imp
  (tower hall).
- **Bestiary** (`rpg/bestiary.ts`): all enemy stats; NG+ multiplies via
  `statsFor(id, flags)` when `ng+:1` is set.
- **Completion** (`rpg/completion.ts`): rooms + relics + bosses + unique
  items → % on map panel and victory screen.
- **Endgame**: `canEnterThrone` (3 forms + colossus + wraith) opens the
  right gate in Clockwork Spire → Throne of Night → Eternal Sovereign →
  victory UI (time/deaths/clear %, NG+ or fresh run).
- **Minimap**: draws visited rooms from `RoomDef.mapRect` — every new room
  MUST define a non-overlapping `mapRect`.
- UI font is always `8px 'Courier New', monospace`; remember
  `ctx.textAlign` resets (save/restore or set back to "left").

## 14. Testing workflow (IMPORTANT for AI agents)

- `main.ts` exposes **`window.__game`** in DEV. TS-private fields are
  reachable from the console (privacy is compile-time only).
- `index.html` traps uncaught errors into **`window.__errs`** — rAF-loop
  exceptions do NOT show in console-message tools; always check `__errs`.
- The browser preview tab may be `visibility: hidden` between tool calls →
  rAF (and thus the game loop) suspends. **Never rely on wall-clock sleeps
  for gameplay tests.** Drive the sim synchronously:

  ```js
  const app = window.__app;                 // drives the whole app
  const down = c => window.dispatchEvent(new KeyboardEvent('keydown', {code: c}));
  const up   = c => window.dispatchEvent(new KeyboardEvent('keyup',   {code: c}));
  const pump = n => { for (let i = 0; i < n; i++) app.update(); };
  const tap  = (c, held = 4) => { down(c); pump(held); up(c); pump(8); };
  // e.g.: tap('KeyX'); pump(30); check app.game.player / .enemies / .flags ...
  ```

  **Pump the App, not the Game.** Since Phase 8.5 the App owns the tick and
  calls `input.beginTick()`; `game.update()` no longer does. Looping on
  `game.update()` advances the world with frozen input, so nothing you type
  registers. `window.__game` still points at the live Game (null on the
  title screen) for inspecting state.

  **Gotcha:** never `up(key)` and `down(key)` without a `pump()` between
  them. `beginTick` applies presses before releases, so both landing in the
  same tick cancel out and the key ends up *not* held. To walk a long
  distance, press once and pump in a loop, then release.

- Reset progression: `localStorage.removeItem('castle-of-sorrow-save')` + reload.

### 14.1 Map validator — run after ANY room change

`src/dev/validateMap.ts` mechanically checks the castle topology; DEV builds
expose it as **`__validateMap()`** (logs a report, returns the issue array).
It must return `[]` before any map work is considered done:

```js
window.__validateMap()   // [] === healthy
```

It verifies, for every exit: target exists, reciprocity, opposite side,
entry inside bounds, entry not embedded in solids, entry supported by
ground (side doors) or landing within a sane fall (shafts), no arrival
bounce-loop, the trigger band lines up with actually passable tiles
(`Gate` counts as open — boss portcullises are conditional), and minimap
adjacency + direction. It also checks every grounded spawn (candles,
NPCs, relics, bosses…) is not inside a wall or floating, that warp pads
match `WARP_PADS` and sit on solid ground, that no two `mapRect`s overlap,
and that all rooms are reachable from the start.

What it does **not** check: whether the player can physically *reach* an
exit (jump-height reachability). For that, drive the player with `pump()`
through the transition — the four boss-room exits are expected to fail
while their boss lives (the portcullis seals the arena).
- Regression checklist (run after any gameplay change): walk/jump heights
  (full ~63px, short ~35px, double ~100px), backdash i-frames, candle →
  drop → magnetize, skeleton kill → EXP, hurt knockback + i-frames, potion
  Q, menu equip changes ATK, all 6 room transitions, warp pads, save/reload
  restore, cracked wall break persists, boss gate + defeat + relic drops,
  three forms + MP drains + mist intangibility, both spells.

## 15. Invariants — DO NOT BREAK

1. `npm run typecheck` stays clean (strict, noUnusedLocals).
2. Fixed 60Hz tick; never use wall-clock time in gameplay logic.
3. All art/colors procedural via `PAL`; no external asset files (until the
   dedicated art-pipeline phase).
4. Entities: `savePrev()` first line of update; draw with `renderX/Y(alpha)`
   + `Math.round`; sprite caches initialized in constructors.
5. `input.consume()` after every acted-on `pressed()`.
6. Damage always flows through `computeDamage` + the inventory-derived
   stats; drops/EXP through `Enemy.die`.
7. Save key & flag namespaces are append-only.
8. Spawn markers are feet-anchored; exits are px-ranges (see §6).
9. New rooms need: RoomDef + exits both ways + mapRect + reachability with
   ≤63px single jumps (or an explicit relic gate).
10. World-freezing UIs follow the menu pattern (check `.open` at the top of
    `Game.update`, draw last).
11. After code changes run `graphify update .` (project convention).
