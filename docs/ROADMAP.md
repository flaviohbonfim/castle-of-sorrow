# Castle of Sorrow — Development Roadmap (Phases 4–9)

> **Status:** Phases 4–8 are implemented. **Phase 8.5 (front end, save
> slots, ending cutscene) is the current work** and comes before Phase 9.

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

## Phase 8.5 — Front end, save slots & ending cutscene

**Goal:** give the game a real front door and a real ending. Today the app
boots straight into a loaded save, there is exactly one save file, and
beating the Sovereign flashes a stats box that the player's still-buffered
attack press dismisses instantly. This phase adds a title screen, three
save slots (chosen both when loading and when saving), and an illustrated
ending cutscene followed by results and a return to the title.

**Director's decisions (locked):** the cutscene is **illustrated full-screen
panels** (procedural art + typewriter narration + fades), not an in-engine
scripted scene. There are **two endings selected by completeness** — a short
one below 100% collection, and the full one when every relic and unique item
was found.

### 8.5.1 App shell — boot flow (do this first; everything else hangs off it)

Today `main.ts` does `new Game()` and the constructor auto-loads the save.
A title screen needs to exist *before* any Game does.

- **Create `src/app.ts`** — an `App` class owning the screen state machine:
  `"title" | "slots" | "playing"`. It holds `game: Game | null`, the shared
  `Input`, the `ParallaxBackground` used by the title, and the current UI
  screen. `update()` / `draw(ctx, alpha)` dispatch by screen.
  - `App` owns the single `Input` instance and calls `input.beginTick()`
    **exactly once per tick** — so `Game.update()` must stop calling it
    itself. Pass the Input into `Game` via its constructor. This is the one
    invasive change; get it right or inputs double-fire.
- **Modify `src/main.ts`**: build `App`, drive it from `startLoop`. Keep
  `window.__game` working by having `App` re-point it whenever a Game is
  created (and set it to `null` on the title). Add `window.__app` for tests.
- **Modify `src/game.ts`**:
  - Constructor becomes `constructor(input: Input, init?: SaveFile | null, slot?: number | null)`.
    With `init` → restore from it; without → fresh run. **No implicit
    localStorage read in the constructor** — the App decides.
  - Extract the starting loadout currently duplicated between the `Player`
    constructor and `startFreshRun()` into one exported
    `DEFAULT_PLAYER_SAVE` const (`src/rpg/defaultSave.ts`) and use it in
    both. Today they can silently drift apart.
  - Add `exitToTitle = false` plus `requestExitToTitle()`. `App` checks the
    flag each tick and switches screens (avoids a circular App↔Game import).
  - Track `currentSlot: number | null`.

### 8.5.2 Save slots

- **Create `src/rpg/saveSlots.ts`** — the only module allowed to touch
  localStorage for saves:
  - `SLOT_COUNT = 3`, `slotKey(i) = "castle-of-sorrow-save:" + i`.
  - `readSlot(i): SaveFile | null` (try/catch + `version` check → treat
    unreadable/newer as empty, never throw).
  - `writeSlot(i, data)`, `deleteSlot(i)`, `anySlotUsed(): boolean`,
    `mostRecentSlot(): number | null` (by `savedAt`).
  - `slotSummary(i): SlotSummary | null` → `{ roomName, level, percent,
    time, deaths, savedAt }`, derived from the existing `SaveFile` fields
    (`ROOMS[data.room].name`, `player.levelState.level`,
    `computeCompletion(new Set(data.flags))`, `formatPlayTime(playTicks)`).
  - `migrateLegacy()` — if the old single key `castle-of-sorrow-save`
    exists and slot 0 is empty, copy it into slot 0, then remove the legacy
    key. Call once at App boot. **Save keys are append-only: add the slot
    keys, migrate, never repurpose the old one.**
- **Modify `SaveFile`** (`src/game.ts`): add `savedAt: number` (Date.now()).
  Keep every existing field and keep `version: 1`; readers must tolerate a
  missing `savedAt` (default 0).
- **Modify `Game.saveGame(slot?: number)`**: writes through
  `writeSlot(slot ?? this.currentSlot ?? 0, data)` and updates
  `currentSlot`. Also update `startFreshRun()` / `startNewGamePlus()`,
  which currently poke `SAVE_KEY` directly.

### 8.5.3 Screens

All three follow the existing world-freeze overlay pattern (check `.open`
early in the host's update, draw last). UI font stays
`8px 'Courier New', monospace`; reset `ctx.textAlign` when done.

**`src/ui/title.ts` — `TitleScreen`**
- Animated backdrop: reuse `ParallaxBackground` with a slowly increasing
  fake `camX` so the castle drifts, plus the vignette and a few drifting
  mist particles. Draw a procedural logotype: "CASTLE OF SORROW" in large
  letters with a dark offset shadow and a thin gothic frame; subtitle below.
- Items: `New Game`, `Load Game`. `Load Game` is dimmed and unselectable
  when `anySlotUsed()` is false.
- Input: ↑↓ move, X/Z confirm. `audio.play("pickup")` on move,
  `"heart"` on confirm.
- Starts `music` on the first key (autoplay policy already handled this way
  in `main.ts`); add a `title` track to `src/engine/music.ts` — a slower,
  sparser pattern than `castle`.

**`src/ui/slots.ts` — `SlotScreen`** (shared by title-load and in-game-save)
- Written as a reusable component, not a Game-only overlay:
  `open(mode: "load" | "save" | "new", onPick: (slot) => void, onCancel: () => void)`.
  Both `App` (load / new game) and `Game` (save point) host an instance.
- Renders 3 rows: `SLOT 1 — Marble Gallery  LV 7  42%  0:38:12  ✝2`
  or `SLOT 1 — EMPTY`.
- Keys: ↑↓ navigate, X confirm, Z/Tab cancel, C delete (with a
  confirm line). In `"load"` mode an empty slot is not selectable; in
  `"save"`/`"new"` mode picking an occupied slot asks
  `Overwrite slot N? X = yes, Z = no`.
- **Modify `SavePoint`** (`src/entities/interactables.ts`): pressing ↑ now
  calls `game.openSaveSlots()` instead of `game.saveGame()` directly. Heal
  to full when the save is actually written (not on opening the picker).

**`src/ui/cutscene.ts` — `CutsceneUI`** (Game overlay)
- `play(endingId)` loads scenes from `src/data/endings.ts` and freezes the
  world; `update()` advances; when the last panel finishes it calls
  `game.showResults(endingId)`.
- Per panel: fade-in (≈20 ticks) → scene art animates while a **typewriter**
  reveals the narration (~1 char every 2 ticks) → wait for confirm →
  fade-out. Confirm while typing completes the line instantly instead of
  advancing (standard, prevents accidental skips).
- **Input lockout — this is the actual bug the player reported.** The
  Sovereign dies with `attack` still held/buffered, so the old victory box
  was dismissed on the same frame. On `play()`: call
  `input.clearCommands()`, `input.consume("attack")`, `input.consume("jump")`,
  and ignore all confirms for the first `LOCK_TICKS = 45`. Apply the same
  lockout when the results screen opens.
- **Create `src/gfx/scenes.ts`** — one exported draw function per panel,
  `(ctx, age: number) => void`, full-screen 480x270, colors from `PAL`:
  - `throneCollapse` — cracked throne silhouette, debris falling with `age`
  - `castleCrumbles` — castle skyline against the moon, towers sinking
  - `dawn` — horizon gradient warming, sun rising with `age`, lone hero
    silhouette walking right
  - `sealedGate` — closed portcullis seen from inside, hero silhouette,
    cold blue palette (short ending)
  Keep them pure drawing code (no game state) so they're trivially testable.

**Results screen** — evolve the existing `src/ui/victory.ts` (`VictoryUI`)
rather than replacing it: it already renders time / deaths / clear % /
rooms / relics / bosses. Changes:
- Shown *after* the cutscene, not on boss death.
- Add the ending name achieved and, for the short ending, one line hinting
  what was missed (e.g. `Relics 4/6 — the castle keeps its secrets`).
- Actions: **`X — Return to Title`** (primary; calls
  `game.requestExitToTitle()`), `C — New Game+` (keep the existing
  `startNewGamePlus()`), and apply the same input lockout.

### 8.5.4 Conditional endings

- **Create `src/data/endings.ts`**:
  - `type EndingId = "short" | "true"`.
  - `pickEnding(flags): EndingId` — `"true"` when
    `c.relics === c.relicsTotal && c.items === c.itemsTotal` (using
    `computeCompletion`), else `"short"`. The Sovereign kill is implied by
    reaching the cutscene at all.
  - `ENDINGS: Record<EndingId, { name: string; panels: { scene: SceneId; lines: string[] }[] }>`.
    Short ending ≈ 2 panels (`sealedGate`, then a terse closing line); true
    ending ≈ 4 panels (`throneCollapse` → `castleCrumbles` → `dawn` →
    closing card). Write the narration in `endings.ts` only — no strings
    baked into the UI code.
  - On completion, add the flag `ending:<id>` so future work (a gallery, or
    NG+ text variants) can tell what the player has seen.
- **Modify `Game.onBossDefeated`**: for `"sovereign"`, replace
  `this.victoryUI.show()` with the cutscene. Keep the gate/reward/gold
  logic that already runs before it.

### 8.5.5 Wiring order (suggested, each step leaves the game runnable)

1. `defaultSave.ts` extraction + `saveSlots.ts` + `savedAt` (no UI yet;
   `saveGame()` writes to slot 0, migration in place). Verify old saves load.
2. `app.ts` + `main.ts` + `Game` constructor/Input change, with the App
   booting straight into `"playing"` (no title UI yet). Verify the game
   still plays identically and inputs don't double-fire.
3. `TitleScreen` + `SlotScreen`, wire New Game / Load Game.
4. `SavePoint` → slot picker.
5. `scenes.ts` + `endings.ts` + `CutsceneUI`; hook the Sovereign kill.
6. Results screen rework + return-to-title.

### Acceptance tests

Drive everything with the synchronous `pump()` driver (ARCHITECTURE §14) —
remember the `up()`/`down()` same-tick gotcha.

1. **Boot:** app opens on the title, not in a room. `Load Game` is dimmed
   with no saves present. `New Game` starts at the Entrance with the
   default loadout.
2. **Slots:** save at a pedestal into slot 2 → title → Load → slot 2 shows
   the right room name / level / % / time → loading restores flags, relics,
   inventory and position. Slots 0 and 1 remain untouched and independent.
3. **Overwrite & delete:** saving onto an occupied slot asks first;
   cancelling leaves it unchanged. Delete empties only the chosen slot.
4. **Legacy migration:** write an old-format `castle-of-sorrow-save`, boot,
   and confirm it appears as slot 1 (index 0) and the legacy key is gone.
5. **Cutscene lockout (the reported bug):** kill the Sovereign while
   holding X — the first panel must stay up; confirm is ignored for
   ~45 ticks; the run cannot reach the results screen in under ~2 seconds.
6. **Endings:** with all relics + items → `"true"` (4 panels, dawn);
   missing any → `"short"` (2 panels, sealed gate). `ending:<id>` flag set.
7. **Return to title:** X on results returns to the title; starting a New
   Game from there begins a clean run (no leftover flags, `playTicks` and
   `deaths` reset), and the old game object is discarded.
8. `npm run typecheck` clean, `window.__validateMap()` returns `[]`,
   `window.__errs` empty after a full title → play → ending → title loop.

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
3. Any new room: exits both ways, mapRect on the 16-cols × 12-rows scale,
   reachability check against jump heights (63px single / ~100px double /
   super jump after Phase 5) — then **`__validateMap()` must return `[]`**
   (ARCHITECTURE.md §14.1). An exit's `side` has to match the minimap
   direction: put the room where the door actually leads.
4. Any new enemy: goes through `Enemy` base (drops/EXP/flash for free);
   stats into the bestiary once Phase 8 lands.
5. Any new UI overlay: world-freeze pattern (check `.open` early in
   `Game.update`, draw last in `Game.draw`).
6. Test with the synchronous `pump()` driver, and check `window.__errs`
   after every browser test session.
7. Update ARCHITECTURE.md sections you change, and keep the projectile
   table (§9) and controls table (README) current.
