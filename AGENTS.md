# Agent Guide — Castle of Sorrow

SotN-style Metroidvania in TypeScript + Canvas (no frameworks, no assets —
everything procedural). This file is the 60-second orientation for AI
agents; the real documentation lives in `docs/`.

## Read first

1. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — every system, its
   contracts, and §15 "Invariants — DO NOT BREAK".
2. **[docs/ROADMAP.md](docs/ROADMAP.md)** — the phased plan (4–9). Pick the
   next unfinished phase; each has steps + acceptance tests.
3. **[README.md](README.md)** — controls and player-facing feature list.

## Commands

```bash
npm run dev        # Vite dev server, http://localhost:5173
npm run typecheck  # tsc --noEmit — MUST be clean before you finish
```

## Hard rules

- Fixed 60Hz tick simulation; all gameplay values are per-tick. Never use
  wall-clock time in gameplay logic.
- All colors from `src/gfx/palette.ts` (PAL); all sprites generated in
  `src/gfx/sprites.ts`. No image/audio files (until Roadmap Phase 9).
- Save key `castle-of-sorrow-save` and the flag namespaces
  (`wall:` `relic:` `visited:` `boss:`) are append-only.
- After acting on `input.pressed(x)`, call `input.consume(x)`.
- Initialize sprite caches in constructors — never lazily in `update()`
  (draw can run before the first update; this has caused a real crash).
- Run `graphify update .` after modifying code (project convention).

## Testing (in the browser preview)

DEV builds expose `window.__game`; `index.html` traps uncaught loop errors
into `window.__errs` (they do NOT appear in console tools). The preview tab
suspends requestAnimationFrame when hidden, so never test with sleeps —
drive the simulation synchronously:

```js
const g = window.__game;
const down = c => window.dispatchEvent(new KeyboardEvent('keydown', {code: c}));
const up   = c => window.dispatchEvent(new KeyboardEvent('keyup',   {code: c}));
const pump = n => { for (let i = 0; i < n; i++) g.update(); };
const tap  = (c, held = 4) => { down(c); pump(held); up(c); pump(8); };
```

Reset progression: `localStorage.removeItem('castle-of-sorrow-save')` then
reload. The full regression checklist is in ARCHITECTURE.md §14.
