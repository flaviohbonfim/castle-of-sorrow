# Castle of Sorrow — Development Roadmap (Phases 4–9)

> Execution plan for the next milestones. Written so that any developer or
> AI model can pick up a phase independently. **Prerequisite reading:**
> [`ARCHITECTURE.md`](ARCHITECTURE.md) — especially §14 (testing workflow)
> and §15 (invariants). Phases are ordered by dependency; within a phase,
> steps are ordered. Finish a phase's acceptance tests before moving on.

Legend used below:
- **Create** — new file. **Modify** — existing file, keep current behavior.
- "Feet position" = bottom-center of an entity (see ARCHITECTURE §6).

---

## Phase 4 — Water, the Underground Lake & Water Walking

**Goal:** a flooded zone with swim physics and the Water Walking relic,
completing the relic list from the original design brief.

### 4.1 Water tiles
- **Modify `src/gfx/tiles.ts`:** add `TileId.Water` (non-solid) and
  `TileId.WaterTop` (non-solid; animated surface — draw 2 variants with a
  lighter ripple line and alternate them by `(c + tick)` in `Tilemap.draw`
  is NOT possible (draw has no tick) — instead give WaterTop 2 variants and
  pick by `c % 2`; animation polish can come from a shimmer overlay drawn in
  the lighting pass). Palette: add `waterDeep`, `waterMid`, `waterHi` to
  `PAL` (blue-teal ramp fitting the gothic palette).
- **Modify `src/world/tilemap.ts`:** add `isWater(col, row)` returning true
  for both water tiles. They are NOT solid and NOT one-way.
- Water tiles render semi-transparent OVER entities ideally; acceptable
  simplification: render normally (entities behind water read as submerged
  because of the lighting pass).

### 4.2 Swim physics
- **Modify `src/entities/player/player.ts`:** add helper
  `inWater(game): boolean` — probe `isWater` at body center.
- **Modify `src/entities/player/states.ts`:**
  - In `applyGravity` (player.ts): when in water, gravity ×0.35 and clamp
    fall speed to 1.2 (sink slowly).
  - In `tryJump`: when in water, always allow a jump ("swim stroke",
    vy = jumpVel × 0.75, no ground/coyote requirement, doesn't consume
    `airJumpsLeft`); play a new `splash` SFX.
  - Walking speed in water ×0.6 (apply in `steer` via a multiplier arg or
    check inside).
  - Bat form over water: unchanged (flies). Wolf: same water rules as human.
    Mist: unchanged (drifts through).
- **Water Walking relic** (`waterWalk`): when owned AND player is human/wolf
  AND falling onto a `WaterTop` tile, treat the water surface as a one-way
  platform: in `world/collision.ts` `moveBody` accepts an optional
  `walkOnWater` flag on Body (mirror the `dropThrough` pattern); the player
  sets `body.walkOnWater = relics.has("waterWalk") && !input.held("down")`
  each tick (holding ↓ lets you sink on purpose).
- Splash particles + `splash` SFX (add to `SfxName`) on entering water.

### 4.3 The Underground Lake zone (2 new rooms)
- **Modify `src/world/rooms.ts`:**
  - `lake` (56x20, "Sunken Gallery"): entered from `cavern` via a new left-
    bottom door (punch cavern's left wall rows 13–15 is TAKEN by nothing —
    cavern's left door rows 3–5 goes to entrance; add a NEW door on
    cavern's **bottom-left**: floor hole at cols 2–3 → `lake` top entry).
    Layout: upper dry ledge walkway, lower half flooded (`Water` fill with
    `WaterTop` surface row), submerged treasure alcoves, candles on dry
    ledges. Exits: top hole back is impossible (falling entry) — instead
    give the lake a **right door** leading back up into `cavern`'s lower
    floor via a platform stair, and a **left sealed alcove** behind a
    Cracked wall containing the `waterWalk` relic pickup (reachable by
    swimming; the relic itself sits on a dry pedestal ledge).
  - `lakeDepths` (optional 2nd room, 40x16): below/right of lake, fully
    flooded, denser enemies, a treasure chest area (gold pickups + a new
    accessory item, see 4.5). Connect lake ↔ lakeDepths with left/right
    doors.
  - Add `mapRect`s that extend the grid downward (rows gy 4+); do not
    overlap existing rects.
- Remember: every exit needs its mirror exit; test all transitions both ways.

### 4.4 Water enemies
- **Create `src/entities/enemies/fishman.ts`:** classic merman — walks on
  the bottom underwater, swims up in a sine when the player is above, spits
  a projectile (reuse `spawnHostile` with a new `"spit"` kind: flat, slow,
  small). Stats ~ hp 18, touch 12, exp 16.
- **Modify `src/entities/projectile.ts`:** add `"spit"` kind (hostile, flat
  trajectory, dies on walls). Keep the table in ARCHITECTURE §9 updated.
- Spawn kind `"fishman"` in rooms.ts + Game.loadRoom switch.

### 4.5 Items & glue
- **Modify `src/rpg/items.ts`:** add `coralRing` (accessory, lck +2,
  found in lakeDepths as a pickup — add a `"chest"`-style one-off: simplest
  is a `relic`-flagged unique Pickup; alternative: reuse RelicPickup with a
  non-ability id and route to inventory — prefer adding an `ItemPickup`
  interactable with flag `item:<roomId>:<n>` so it doesn't respawn).
- **Modify `interactables.ts`:** `RELIC_NAMES.waterWalk = "Mermaid Statue"`,
  desc "Water Walking!".
- Music: lake can reuse `castle` track (a third `lake` track is optional
  polish — pattern arrays are cheap; do it if time allows).

### Acceptance tests (pump-driven, see ARCHITECTURE §14)
1. Player sinks slowly in water, swim-jump works repeatedly, movement slowed.
2. With `waterWalk` + not holding ↓: walking across WaterTop; holding ↓ sinks.
3. Fishman patrols, spits, dies to melee, grants EXP.
4. All new room transitions both ways; relic persists in save; typecheck clean.

---

## Phase 5 — Second Wing: Clock Tower zone + second boss

**Goal:** a vertically-oriented second wing with new enemy types, a zone
palette variation, and a second boss guarding a traversal relic upgrade.

### 5.1 Zone palette support
- **Modify `src/gfx/tiles.ts`:** `buildTileset(zone: "castle" | "tower" = "castle")`
  — tower swaps the stone ramp for a colder bronze/verdigris ramp (add the
  4 colors to PAL). **Modify `world/tilemap.ts`** to accept a zone in its
  constructor and use the right tileset. **Modify `rooms.ts`** `RoomDef`
  with optional `zone` field; `RoomBuilder`/`build()` pass it through.
- Parallax: `ParallaxBackground.draw` already only needs camX; add an
  optional zone tint — acceptable v1: same backdrop everywhere.

### 5.2 Rooms (3–4)
- Entered from `corridor` via a new **top exit** (vertical shaft): punch a
  hole in corridor's ceiling (cols 24–25) reachable with double jump;
  `towerShaft` (16x40! — tall room, camera already clamps fine) with
  platform ladder; `towerHall` (40x16) with gears/pillars; `towerTop`
  (32x14) boss room with Gate pattern copied from bossRoom (generalize:
  see 5.4). Map rects extend gy upward (negative gy is allowed — Minimap
  computes bounds from 0; **first normalize**: either shift all existing
  rects down or update Minimap to handle min gx/gy < 0. Prefer updating
  Minimap to compute min bounds).
- Add a warp pad in `towerHall`; extend `WARP_LINKS` — NOTE: current
  WARP_LINKS is a 1:1 pair keyed by room. With 3+ pads, refactor to a
  cycle: `warpTargets: string[]` ordered list, pad warps to the next room
  in the list that has a pad. Keep the shop/cavern pair working.

### 5.3 New enemies
- **`medusaHead.ts`** — flies in a sine wave across the screen, spawned by
  a spawner at room edge every ~90 ticks while the player is in the room
  (cap 3 alive). Classic knockback menace for the shaft climb.
- **`axeKnight.ts`** — armored walker, def 6, throws axes (reuse hostile
  arc `"bone"` kind with axe sprite or add `"axeThrow"` kind), hp ~40.

### 5.4 Boss #2 — "Clockwork Wraith"
- **Generalize boss gating:** extract from Game.loadRoom the hardcoded
  bossRoom/gate/colossus logic into data: `RoomDef.boss?: { id: string;
  gateCells: [c, r][]; make(x, y): Enemy }`-style factory or a switch by
  spawn id. Flags become `boss:<bossId>`. Keep `boss:colossus` working
  (append-only flags!).
- Wraith pattern: teleports (fade-out/in with particles), fires 3-way spit
  volleys, summons 1 medusa head at half HP. HP ~220. Reward: relic
  `highJump` ("Gravity Boots" — new relic: ↓ then jump = super jump vy
  −8.5; implement in states.tryJump analogous to double jump) + gold.
- Boss HP bar already generic (`displayName`, `maxHp`) — reuse.

### Acceptance tests
1. Tower reachable only with double jump; shaft climb works; medusa heads
   spawn/despawn correctly and knock the player off platforms.
2. Wraith: gate seals, teleport pattern works, enrage at half HP, defeat
   sets flag, drops Gravity Boots, gate opens, boss music switches.
3. High jump: ↓+jump charges a super jump; regression: normal/double jump
   heights unchanged.
4. Zone palette visibly different in tower rooms; minimap shows the new
   wing; save/reload mid-tower restores correctly.

---

## Phase 6 — Map screen, warp network & quality of life

**Goal:** full pause-map, better navigation, input comfort.

- **Map screen:** new panel inside `ui/menu.ts` (third column or a tab
  toggled with left/right at panel edges — simplest: add a `map` panel
  cycling equipment → items → map). Draw all `mapRect`s (visited) scaled
  ×3 of the minimap, with door connections (derive from exits: draw a 2px
  notch where rooms touch), current room blinking, save rooms marked ♦,
  warp rooms marked ▲.
- **Warp UI:** when using a pad with 3+ destinations, freeze world and show
  a destination list (reuse ShopUI interaction pattern).
- **Quick sub-weapon switch:** add input action `swapSub` (KeyV) cycling
  dagger→axe; HUD shows current sub-weapon glyph near hearts.
- **Gamepad support:** **Create `src/engine/gamepad.ts`** — poll
  `navigator.getGamepads()` inside `Input.beginTick()`; map standard pad
  (dpad/left-stick = directions, A=jump, X=attack, B=backdash, Y=subweapon,
  Start=menu, LB/RB/LT/RT=forms/potion). Buttons feed the SAME
  pending/pressed pipeline (call the same internal press/release paths, do
  not duplicate state). Stick deadzone 0.35.
- **Volume & pause:** add `music.setVolume(v)` / `audio` master gain; a
  tiny options row in the menu (music on/off is enough); `KeyP` or losing
  focus already pauses via hidden-tab behavior — add explicit pause on
  `menu` open (already the case).
- **HUD polish:** sub-weapon icon, boss bar shows damage-lag ghost bar
  (optional), "LOW HP" heartbeat vignette pulse below 20% (draw in lighting
  pass).

### Acceptance tests
Map screen shows exactly the visited set; warp list teleports correctly;
gamepad drives every action incl. menu; sub-weapon swap persists in save
(serialize `subweapon` — already in PlayerSave).

---

## Phase 7 — NPCs, dialogue & quests-lite

**Goal:** light narrative layer without a heavy dialogue engine.

- **Create `src/ui/dialogue.ts`:** modal textbox (world-freeze pattern):
  portrait square (pixelMap), name, 2–3 lines, advanced with X/attack.
  Data: `DIALOGUES: Record<string, string[][]>` — arrays of pages.
- **Modify `interactables.ts`:** generic `Npc` entity (sprite from a small
  registry, dialogue id, optional condition on flags — e.g. different lines
  after boss defeat). Convert Shopkeeper's greeting to: first ↑ press opens
  dialogue, second opens shop (or dialogue page with "…opens wares" then
  shop auto-opens on close).
- **Quest-lite:** flag-driven. Example quest: the Hermit asks for a
  `coralRing` from lakeDepths → reward `heartMax +10` and a discount flag
  (`quest:coral:done` → STOCK prices ×0.8 when set). Implement as dialogue
  conditions + an inventory check + flag write. No quest log needed; the
  map screen can show a "!" over the shop room while the quest is open.
- 2–3 flavor NPCs (a ghost in the gallery, a caged demon in the tower)
  with pure-flavor dialogue and one hint each about relic locations.

### Acceptance tests
Dialogue opens/closes without breaking world freeze; conditions switch
lines; quest completes exactly once; prices change; save persists quest
flags.

---

## Phase 8 — Balance, completion & endgame

**Goal:** make the loop feel like a game: difficulty curve, % completion,
final gate.

- **Difficulty pass:** tune enemy stats/spawn counts per zone using the
  damage formula (document target: entrance enemies die in 2–3 sword hits
  at LV1; tower enemies need ~5 or better gear). Table-driven: extract all
  enemy stats into `src/rpg/bestiary.ts` (single source; enemies read from
  it) so balancing is data-only.
- **Completion %:** count of flags in {visited rooms, relics, bosses,
  unique items} / total, shown on map screen + save file line.
- **Endgame:** final door in `towerTop`/new `throne` room that only opens
  with all 3 form relics + both bosses slain (check flags); behind it a
  final arena (reuse boss framework — a third boss or a Colossus+Wraith
  rematch is acceptable) → victory screen (world freeze, stats: time —
  count ticks in Game and serialize, deaths, completion %).
- **Save slots (optional):** keys `castle-of-sorrow-save:0..2` + a boot
  picker overlay; keep the legacy key as slot 0 migration.
- **New Game+ (optional):** on victory, offer restart keeping
  relics/equipment with enemy stats ×1.5 (flag `ng+:1` multiplier in
  bestiary lookups).

### Acceptance tests
Full playthrough from clean save to victory possible; completion reaches
100% when everything collected; NG+ multiplies enemy stats; old saves load.

---

## Phase 9 — Art/audio pipeline & release packaging

**Goal:** allow real hand-made assets WITHOUT breaking the procedural
fallback, then ship.

- **Asset override layer:** **Create `src/gfx/assets.ts`** — an async
  loader that, at boot, tries `fetch('/assets/manifest.json')`; if present,
  loads named PNG sprite sheets and REPLACES the corresponding procedural
  frames (same names/frame counts as the builders return — document the
  contract in the manifest: `{ "player.idle": {file, frameW, frameH, frames} }`).
  If absent (the default), everything stays procedural. Never make
  procedural generation depend on assets existing.
- Same for music: optional `.ogg` loop per track via an `<audio>` element
  with the sequencer as fallback.
- **Rendering polish:** optional CRT-ish scanline overlay toggle (draw a
  pre-made 2px-period alpha stripe canvas over the frame; menu option).
- **Packaging:** `vite build` output is static — deploy to any static host
  (GitHub Pages/itch.io zip). Add `npm run package` script producing a zip
  of `dist/`. PWA manifest (installable, offline cache via a minimal
  service worker) optional.
- Final QA: run the full regression checklist (ARCHITECTURE §14) plus a
  fresh-profile playthrough on Chromium and Firefox; verify localStorage
  save versioning (add `version: 1` to SaveFile now if not present when
  this phase starts — migrate by defaulting missing fields).

---

## Cross-phase rules (every phase)

1. Read ARCHITECTURE.md §14–15 before coding; run `npm run typecheck`
   before finishing; run `graphify update .` after code changes.
2. Any new persistent state = a new **flag namespace** or a new field with
   a default in the save-load path (append-only; old saves must load).
3. Any new room: exits both ways, mapRect, reachability check against jump
   heights (63px single / ~100px double / super jump after Phase 5).
4. Any new enemy: goes through `Enemy` base (drops/EXP/flash for free);
   stats into the bestiary once Phase 8 lands.
5. Any new UI overlay: world-freeze pattern (check `.open` early in
   `Game.update`, draw last in `Game.draw`).
6. Test with the synchronous `pump()` driver, and check `window.__errs`
   after every browser test session.
7. Update ARCHITECTURE.md sections you change, and keep the projectile
   table (§9) and controls table (README) current.
