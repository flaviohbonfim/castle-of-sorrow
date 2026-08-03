# Castle of Sorrow — SotN-style Metroidvania Prototype

> **Contributors / AI agents:** start with [AGENTS.md](AGENTS.md), then
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (full system reference) and
> [docs/ROADMAP.md](docs/ROADMAP.md) (phased plan for what to build next).

A 2D Action-RPG Metroidvania prototype inspired by *Castlevania: Symphony of the
Night*, built as a 16-bit "demaster": low-res pixel rendering (480×270,
integer-scaled), procedural sprite/tile art, parallax gothic backdrops, and
modern game-feel (fixed 60 Hz simulation, render interpolation, coyote time,
input buffering, hitstop, trauma-based screen shake).

## Run

```bash
npm install
npm run dev        # Vite dev server on http://localhost:5173
npm run typecheck  # strict TS check
```

## Controls

| Input | Action |
| --- | --- |
| ← → / A D | Walk |
| ↓ / S | Crouch |
| Z / Space | Jump (variable height — release early for a short hop) |
| X / J | Attack (hold ↑ for upward slash; works crouched and airborne) |
| C / K | Sub-weapon (selected); hold ↑ + C still forces axe — costs Hearts |
| V | Cycle sub-weapon (dagger ↔ axe) |
| Shift / L | Backdash (i-frames on startup, jump-cancellable) |
| ↓, ↑ + X | Command spell "Soul Lance" — costs 10 MP |
| ↓ + Z | Drop through one-way platforms |
| Q | Drink potion |
| Tab / E / Esc | Pause menu: Equip / Items / Map panels (← →) |
| ↑ (on pads/NPCs) | Warp list / save / talk (Hermit, ghost, caged imp) |
| Z in mid-air | Double jump (after finding the Soul of the Gale relic) |
| ↑, ↓ + X | Command spell "Hellfire" — 3 fireballs, costs 16 MP |
| 1 / 2 / 3 | Transform: Bat / Wolf / Mist — each needs its relic |
| Gamepad | A jump · X attack · B backdash · Y sub · Start menu · LB/RB/LT forms · RT potion · Select swap sub |

## Architecture

- `src/engine/` — fixed-timestep loop, tick-buffered input with directional
  command detection, pixel-perfect renderer, deadzone camera with screen
  shake, WebAudio chiptune SFX synth.
- `src/gfx/` — palette, procedural sprite generation (part-based player
  poses, ASCII pixel maps for enemies/props), procedural tileset, parallax.
- `src/world/` — tilemap with solid/one-way flags, ASCII-free arena builder,
  axis-separated AABB collision.
- `src/entities/player/` — state machine (Idle, Walk, Crouch, Jump, Fall,
  Attack, Backdash, SpellCast, Hurt, Die) with per-weapon frame data
  (startup/active/recovery) driving melee hitboxes.
- `src/rpg/` — attributes (STR/CON/INT/LCK), HP/MP/Hearts, EXP curve with
  stat growth, item catalog, inventory + 7 equipment slots (Right/Left Hand,
  Head, Body, Cloak, 2 Accessories), sub-weapon definitions. Combat reads
  ATK/DEF through the equipment pipeline.
- `src/combat/` — damage formula (ATK−DEF, variance, LCK crits), one-hit-
  per-swing registry, hitstop, floating damage numbers.
- `src/game.ts` — world orchestration: entities, swing routing, contact
  damage, particles, lighting pass (candle glow + vignette), respawn.

## World (milestone 2)

Four connected rooms — **Entrance Hall** (right door → gallery, floor hole →
cavern), **Marble Gallery** (warp pad), **Sanctuary** (save pedestal that
heals + writes the localStorage save; breakable cracked wall hiding the
**Soul of the Gale** double-jump relic), and the **Underground Cavern**
(warp pad, a platform climb with one double-jump-gated hop back out).
Broken walls and collected relics persist in the save file; candles and
enemies respawn on room entry, classic style.

- `src/world/rooms.ts` — room registry: builder helpers, exits (side +
  px-range → target room/position), warp links, start point.
- `src/ui/menu.ts` — pause menu (Tab): stats, relics, 7 equipment slots,
  inventory with equip/use/unequip.
- `src/entities/interactables.ts` — relic pickups, warp pads, save points.

## Milestone 3

- **Transformations** — Bat (free flight, MP drain), Wolf (fast lope, can
  jump), Mist (intangible drift, MP drain). Getting hit knocks you back to
  human; reverting requires headroom.
- **Boss** — the Bone Colossus in the Hall of the Colossus (past the
  Hermit's Den, right of the cavern): bone volleys at range, telegraphed
  charge up close, enrages at half HP. A portcullis seals the arena; victory
  opens it and drops the Bat & Wolf relics plus a gold shower.
- **Shop** — the Hermit sells consumables, gear, and the Power of the Mist
  relic for the gold you loot.
- **Minimap** — SotN-style corner map of visited rooms (footprints defined
  per room in `rooms.ts`).
- **Second spell** — Hellfire (↑,↓+X): 3-fireball spread, INT-scaled.
- **Music** — procedural chiptune sequencer (`src/engine/music.ts`): castle
  theme + faster boss theme, square/triangle/noise voices, zero assets.

## Next milestones

See [docs/ROADMAP.md](docs/ROADMAP.md) — Phases 4–8 (through endgame / NG+)
are in. Next is **Phase 8.5**: title screen, 3 save slots (picked when
loading *and* saving), and an illustrated ending cutscene with two endings
by completeness. Phase 9 (real-asset pipeline + packaging) follows.
