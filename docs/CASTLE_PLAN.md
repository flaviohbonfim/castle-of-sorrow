# Castle Master Plan

> Architectural source of truth for Castle of Sorrow.
> Code: [`src/world/castlePlan.ts`](../src/world/castlePlan.ts).
> Room geometry: [`src/world/rooms.ts`](../src/world/rooms.ts).

This document is the "map drawn as one castle" that later backdrop art
must follow. Design-first: constants first, art generated to match.

---

## 1. Topology

```
                 [towerHall]——[towerTop]——[approach]——[sovereignHall]——[throne]
                      |
                 [towerShaft]
                      |
  [chapel]——[entrance]——[corridor]——[library]——[saveRoom]
                 |           ^ hatch (dbl-jump)
                 v pit
  [lake]——[cavern]——[shop]——[bossRoom]
    |
    v dive shaft
  [lakeDepths]——[catacombs]
```

Minimap grid (`mapRect`): gx right, gy down. Negative gy = tower wing above.

---

## 2. Wings

| Wing id | Name | Zone | Floor datum (feet Y) | Rooms |
| --- | --- | --- | --- | --- |
| `upper` | Upper Gallery | castle | **176** (GALLERY) | chapel, entrance, corridor, library, saveRoom |
| `tower` | Clock Tower | tower | **176** (GALLERY) | towerShaft, towerHall, towerTop, approach, sovereignHall, throne |
| `under` | Undercroft | castle | **256** (CAVERN hub) | cavern, lake, shop, bossRoom |
| `depths` | Sunken Depths | castle | **208** (HALL) | lakeDepths, catacombs |

Continuous **side-door** runs share one feet-Y so painted walls and the
SotN slide transition can meet at the door seam. Documented steps handle
the rest (grand hall, flooded landings, ceremonial throne).

---

## 3. Architectural profiles

A profile is a reusable room kit (rows, floor row, 3-tile door, exit band).

| Profile | Rows | Floor row | Feet Y | Door rows | Side band (body Y) | Use |
| --- | --- | --- | --- | --- | --- | --- |
| `GALLERY` | 14 | 11 | **176** | 8–10 | 120–180 | Default horizontal corridor |
| `HALL` | 16 | 13 | **208** | 10–12 | 152–220 | Chapel, catacombs, throne, lake dry doors |
| `SANCTUM` | 12 | 9 | 144 | 6–8 | 88–148 | Legacy compact (prefer GALLERY for new rooms) |
| `GRAND` | 24 | 20 | **320** | 17–19 | 260–320 | Entrance Hall only |
| `CAVERN` | 20 | 16 | **256** | 13–15 | 200–260 | Underground hub |
| `FLOODED` | 18 | 16 seabed | 256 | 10–12 (dry) | 152–208 | Sunken Gallery |
| `SHAFT` | 40 | 37 | 592 | — | — | Clock Tower Shaft (vertical only) |

Door stack is always **3 tiles** tall. Feet stand on the top edge of
`FloorTop` (`floorRow * 16`).

---

## 4. Per-room plan

| Room | Wing | Profile | Cols×Rows | Px | Entry feet Y | Boss | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| chapel | upper | HALL | 28×16 | 448×256 | 208 | | Side chapel west of entrance |
| entrance | upper | GRAND | 64×24 | 1024×384 | 320 (step 288 east) | | Multi-level grand hall |
| corridor | upper | GALLERY | 48×14 | 768×224 | 176 | | Warp + shaft hatch |
| library | upper | GALLERY | 32×14 | 512×224 | 176 | | |
| saveRoom | upper | GALLERY | 20×14 | 320×224 | 176 | | Sanctuary + double-jump relic |
| towerShaft | tower | SHAFT | 16×40 | 256×640 | 592 | | Vertical only |
| towerHall | tower | GALLERY | 40×14 | 640×224 | 176 | | Warp; hole to shaft |
| towerTop | tower | GALLERY | 32×14 | 512×224 | 176 | wraith | |
| approach | tower | GALLERY | 36×14 | 576×224 | 176 | | Form-skill relics |
| sovereignHall | tower | GALLERY | 40×14 | 640×224 | 176 | sovereign | Step up into throne |
| throne | tower | HALL | 48×16 | 768×256 | 208 | dracula | Dais; see `throneLayout.ts` |
| cavern | under | CAVERN | 48×20 | 768×320 | 256 | | Hub; warp; ceiling shaft |
| lake | under | FLOODED | 48×18 | 768×288 | 208 dry | | Water + dry landings |
| shop | under | GALLERY | 20×14 | 320×224 | 176 | | Hermit annex |
| bossRoom | under | GALLERY | 40×14 | 640×224 | 176 | colossus | |
| lakeDepths | depths | HALL | 40×16 | 640×256 | 208 ledge | | Flooded + east ledge |
| catacombs | depths | HALL | 40×16 | 640×256 | 208 | | |

---

## 5. Documented steps (intentional height changes)

| From → To | Δ feet Y | Reason |
| --- | --- | --- |
| entrance → corridor | 288 → 176 (−112) | Raised east step drops into the Marble Gallery |
| entrance → chapel | 320 → 208 (−112) | Side chapel below grand hall |
| corridor → entrance | 176 → 288 (+112) | Climb onto the entrance step |
| sovereignHall → throne | 176 → 208 (+32) | Ceremonial step into final arena |
| cavern → lake | 256 → 208 (−48) | Onto lake dry landing |
| cavern → shop | 256 → 176 (−80) | Climb into hermit annex |
| shop → cavern | 176 → 256 (+80) | Drop back into the cavern |

All other side doors within a wing share the wing floor datum exactly
(corridor ↔ library ↔ saveRoom at 176; towerHall → … → sovereign at 176;
lakeDepths ↔ catacombs at 208; shop ↔ bossRoom at 176).

---

## 6. Continuous horizontal runs (backdrop priority)

These runs are the ones backdrop art must visually continue across:

1. **Upper spine:** corridor — library — saveRoom *(datum 176)*
2. **Tower run:** towerHall — towerTop — approach — sovereignHall *(datum 176)*
3. **Boss annex:** shop — bossRoom *(datum 176)*
4. **Depths:** lakeDepths — catacombs *(datum 208)*

Seam rule for art (Phase 2+): every side exit paints a **dark vestibule
arch** 16–32px deep at the door band. Neighboring rooms share the same
arch language so the slide transition reads as one wall.

---

## 7. How to add a room

1. Pick a **wing** in `castlePlan.ts` (`WINGS[*].rooms`).
2. Pick or extend an **ArchProfile** (prefer `GALLERY` / `HALL`).
3. Add a `ROOM_PLANS[id]` entry (cols, profile, entryFloorY, steps if any).
4. Build the room in `rooms.ts` using profile constants
   (`GALLERY.floorRow`, `GALLERY.doorRow0`, …) — never hard-code row numbers
   for floor/door when a profile applies.
5. Wire `exits` with `sideDoorBand(id)`, `leftEntry(id)`, `rightEntry(id)`.
6. Set `mapRect` on the ~16 cols × 12 rows per cell scale; keep adjacency.
7. Run `window.__validateMap()` → must return `[]`.
8. (Later) backdrop recipe `backdrop.<id>` + prompt from the wing style bible.

---

## 8. Geometry changes in Phase 0 (this pass)

| Room | Before | After | Why |
| --- | --- | --- | --- |
| saveRoom | 20×12, floor 144 | 20×14, floor **176** | Continuous with library |
| shop | 20×12, floor 144 | 20×14, floor **176** | Continuous with bossRoom |
| towerHall | 40×16, floor 208 | 40×14, floor **176** | Continuous with towerTop |

Exits, warp pads, boss gate cells, and reward feet-Y updated to match.
All other rooms kept their footprints; builders now reference profile
constants so future edits cannot drift.

---

## 9. Invariants

- `__validateMap()` must stay `[]` after any plan or room edit.
- Jump heights unchanged: single ≤63px, double ~100px.
- Flag namespaces append-only (`wall:`, `relic:`, …).
- Save keys append-only.
- New rooms: exits both ways + mapRect + plan entry.
