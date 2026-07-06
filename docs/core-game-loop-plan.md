# Implementation Plan for #2 — Core Game Loop

## Overview

Wire together a fully playable moment-to-moment game loop: a Three.js scene renders the
procedural station, a player controller handles WASD movement with collision against walls and
entities, health/oxygen/energy/inventory systems tick inside the deterministic sim, and a
diegetic HUD surfaces all of it to the player.

---

## Current State Assessment

The codebase already contains substantial scaffolding. A complete inventory of what exists vs.
what needs building/refining is critical before assigning tasks.

### What Already Exists

| Layer | File | Status |
|-------|------|--------|
| **Sim core** | `src/sim/world.ts` | Full `Sim` class implementing `IWorld`: 20Hz tick, movement, abilities, combat, status effects, hazards, enemy AI, loot, XP, save/load, zone transitions. **Missing: oxygen, wall/room collision, energy regen.** |
| **Sim API** | `src/world_api.ts` | Complete `IWorld` interface + all types (Entity, Stats, Item, Zone, etc.). **Missing: oxygen field on Stats, oxygen drain/regen in commands.** |
| **RNG** | `src/sim/rng.ts` | Complete seeded mulberry32 — done. |
| **Content** | `src/sim/content/{classes,zones,enemies,items,abilities}.ts` | All 4 classes, 7 zones, 5 enemy templates, 12 abilities, item generation — done. |
| **Renderer** | `src/render/renderer.ts` | Full `Renderer` with scene/camera setup, zone-change handling, entity interpolation, VFX dispatch. |
| **Station geometry** | `src/render/world/station_builder.ts` | Procedural floor/ceiling/walls/rooms/doors/hazards with animated decor. |
| **Character visuals** | `src/render/characters/character_visual.ts` | Procedural humanoid/drone/bot/mutant/turret/item models with keyframe animation. |
| **Lighting** | `src/render/effects/lighting.ts` | Ambient + hemisphere + flashlight + flickering emergency lights per biome. |
| **VFX** | `src/render/effects/vfx.ts` | Damage numbers, projectiles, hit flashes, death bursts, sparks. |
| **Ambient** | `src/render/effects/ambient.ts` | Dust motes, steam puffs, CSS scanline/vignette overlay. |
| **Input** | `src/game/input.ts` | WASD poll @20Hz, 1-4 abilities, E interact, F pickup, I/Tab/Esc hooks, mouse drag/zoom. |
| **Camera** | `src/game/camera.ts` | Third-person orbit follow, drag/yaw/pitch/zoom, smoothed lerp. |
| **Audio** | `src/game/audio.ts` | Procedural Web Audio: zap, hit, explosion, UI blip, ability, level-up, ambient drone. |
| **HUD** | `src/ui/hud.ts` | Vitals bars (HP/EN/XP), ability bar w/ cooldowns, minimap, status effects, cast bar, damage flash, zone label, event log. |
| **Menus** | `src/ui/menus.ts` | Main menu, character creation, pause, game over, victory. |
| **Tooltips** | `src/ui/tooltips.ts` | Ability + item tooltips. |
| **Boot** | `src/main.ts` | `GameBootstrap` wires sim+renderer+HUD+menus+input+camera+audio, runs sim@20Hz + render@60fps loops. |
| **Tests** | `tests/{sim,architecture}.test.ts` | RNG determinism, sim determinism, combat, leveling, save/load, events, architecture isolation guards. |
| **GameBlocks** | `GameBlocks/gameblocks/` | Reference modules for character motion, camera rigs, collision, HUD, combat — useful patterns to port. |

### Gaps for Issue #2 (Core Game Loop)

1. **No oxygen system** — `Stats` has no `oxygen`/`maxOxygen`; no drain-on-tick or suffocation damage.
2. **No wall/room collision** — `applyMovement` only clamps to zone AABB bounds; player clips through all interior walls and room partitions.
3. **No entity-vs-entity collision** — player and enemies can overlap freely; only distance-based melee range exists.
4. **No energy regeneration** — energy only depletes (abilities) and is restored by consumables/level-up; no passive regen tick.
5. **No passive health regen** — health only changes via damage/heal/level-up.
6. **Inventory UI is a stub** — `toggleInventory` and `toggleCharacterSheet` in `main.ts` only play an audio blip; no panel.
7. **No cursor raycast** — `cursorWorldPos()` in input.ts returns `null`; abilities with no enemy in range fire "forward" but cannot target a mouse point.
8. **No door visuals as interactables** — doors exist in sim data but are not spawned as `Prop` entities for the input handler to find; `findNearestInteractable` will never find a door.
9. **Zone transition is one-way and linear** — `tryZoneTransition` advances along `ZONE_ORDER` but doesn't check for a specific interactable/airlock target; any interact call triggers it.
10. **No "interaction prompt" UI** — player has no feedback on what's interactable/pickupable nearby.
11. **Movement is camera-relative-ish but not truly** — WASD maps to world dx/dz directly; no camera-yaw-relative steering.

---

## Acceptance Criteria

- [ ] Player can spawn into the Airlock zone, see the 3D station, and move with WASD.
- [ ] Player movement is blocked by walls and room partitions (no clipping through geometry).
- [ ] Player and enemies collide radially (cannot occupy the same point).
- [ ] Camera follows player in third person; mouse drag orbits, scroll zooms.
- [ ] Health, oxygen, and energy bars are visible and update in real time.
- [ ] Oxygen drains while in vacuum hazard zones and regenerates in safe zones; reaching zero causes suffocation damage.
- [ ] Energy passively regenerates at a class-appropriate rate when not casting.
- [ ] Player can use abilities (1-4) that consume energy and respect cooldowns.
- [ ] Player can pick up items (F) and they appear in an inventory panel (I).
- [ ] Inventory panel shows items with rarity, stats, and use/equip buttons.
- [ ] Player can interact (E) with doors and zone-transition props; an on-screen prompt shows the interactable name.
- [ ] Player takes damage from hazards and enemies; death triggers Game Over screen.
- [ ] Killing enemies awards XP; leveling up restores health/energy and unlocks abilities.
- [ ] Save/load round-trips oxygen, inventory, and position correctly.
- [ ] `npm test` passes; architecture isolation tests still pass (sim has zero Three.js/DOM imports).
- [ ] `npm run dev` launches and the game is playable from main menu → character select → gameplay → death or victory.

---

## Architecture

### High-Level Design

The existing architecture is sound and must be preserved. The canonical seam is `IWorld`
(`src/world_api.ts`): the **sim** (`src/sim/`) is pure TypeScript with zero DOM/Three.js imports,
the **renderer** (`src/render/`) reads `IWorld` and never mutates sim state, and the **game/UI
layers** (`src/game/`, `src/ui/`) bridge input and display. The bootstrapper (`src/main.ts`)
owns the master loop (sim @ 20Hz via `setInterval`, render @ 60fps via `requestAnimationFrame`).

Issue #2 work stays within this seam. New sim mechanics (oxygen, energy regen, collision) live in
`src/sim/`. New renderer features (interaction prompt, inventory panel, cursor raycast) live in
`src/render/` or `src/ui/`. The `IWorld` interface gains a few read-only query methods but the
sim/render boundary is never crossed in the wrong direction.

```
┌─────────────────────────────────────────────────────────┐
│                      main.ts (GameBootstrap)            │
│   sim loop @20Hz ──── render loop @60fps ── audio tap   │
└──────┬───────────────────────┬──────────────────────┬───┘
       │ commands              │ reads IWorld          │ events
       ▼                        ▼                        ▼
┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐
│  src/sim/    │   │  src/render/     │   │  src/ui/         │
│  world.ts    │   │  renderer.ts     │   │  hud.ts          │
│  (pure)      │   │  station_builder │   │  menus.ts        │
│              │   │  vfx/lighting    │   │  inventory.ts ◀── │ NEW
│ +oxygen      │   │ +collision viz   │   │  interaction.ts ◀│ NEW
│ +regen       │   │  (debug only)    │   │                  │
│ +collision   │   └──────────────────┘   └──────────────────┘
│ +doors/props │
└──────────────┘
        ▲
        │ IWorld (the only seam)
        ▼
   src/world_api.ts  (+oxygen fields, +getNearestInteractable query)
```

### Key Components

1. **OxygenSystem (sim)** — adds `oxygen`/`maxOxygen` to `Stats`; drains in vacuum hazards, regens in safe zones; zero → suffocation damage.
2. **PassiveRegenSystem (sim)** — energy regen per tick when not casting; optional slow health regen out of combat.
3. **CollisionSystem (sim)** — wall/room AABB collision using room geometry from `Zone.rooms`; entity-vs-entity radial push-apart. Pure math, no Three.js.
4. **Door/Prop spawning (sim + zones)** — spawn `Prop` entities for doors and zone-transition airlocks so `findNearestInteractable` works and input can target them.
5. **InteractionPrompt (UI)** — DOM element showing "E — Open Door" / "F — Pickup Medkit" based on nearest interactable/item from a new `IWorld.getNearestInteractable()` query.
6. **InventoryPanel (UI)** — DOM overlay toggled by I; lists items with rarity color, stats, use/equip buttons; sends `useItem`/`equipItem` commands.
7. **CursorRaycaster (game)** — `THREE.Raycaster` from camera through cursor onto a ground plane; feeds `targetPos` to abilities.
8. **CameraRelativeMovement (game+sim)** — input rotates WASD by camera yaw before sending `MoveIntent`; sim stays direction-agnostic.

---

## Task Breakdown

Tasks are ordered by dependency. Each task lists the file(s) touched and an effort estimate
(S/M/L). Phases group tasks into reviewable chunks.

### Phase 1 — Sim Mechanics (deterministic, testable in isolation)

**Task 1 — Add oxygen to Stats and sim** `[S]`
- Files: `src/world_api.ts` (add `oxygen`, `maxOxygen` to `Stats`), `src/sim/content/classes.ts` (add `oxygen` to `BaseStats`/`createStartingStats`/`applyLevelUp`), `src/sim/world.ts` (drain in vacuum hazards via `updateHazards`, regen in `step`, suffocation damage when 0).
- Acceptance: oxygen bar moves; reaching 0 deals damage; save/load preserves oxygen.
- Test: `tests/oxygen.test.ts` — drain rate, regen rate, suffocation damage, save/load round-trip.

**Task 2 — Passive energy + out-of-combat health regen** `[S]`
- Files: `src/sim/world.ts` (`step` adds regen each tick), `src/sim/content/classes.ts` (per-class `energyRegen` and `healthRegen` fields).
- Acceptance: energy bar refills when idle; health slowly refills when no damage taken for N seconds.
- Test: extend `tests/sim.test.ts` — regen rates, pauses during ability cast, resets combat timer on damage.

**Task 3 — Wall and room collision in sim** `[M]`
- Files: `src/sim/world.ts` (`applyMovement` queries `Zone.rooms` for AABB collision; resolve X and Z axes separately for sliding), `src/sim/content/zones.ts` (ensure rooms carry wall thickness or derive from room dims).
- Approach: treat each room as an open AABB (interior is walkable, walls are the boundary). Build a list of "solid" wall segments from room perimeters and the zone outer bounds. Resolve movement by checking the player's proposed position against solid segments on each axis independently (classic AABB sweep). Keep it pure TypeScript — no Three.js.
- Acceptance: player cannot walk through walls; can slide along walls; doors (gaps) are passable.
- Test: `tests/collision.test.ts` — player blocked by wall, slides along wall, passes through door gap, corner cases.
- Note: The renderer's `station_builder.ts` already builds walls with `DOOR_WIDTH` gaps; the sim collision must use the same door-gap positions. Add a `getCollisionSegments(zone)` helper in `src/sim/collision.ts` (pure) that both the sim and (optionally) a debug renderer can use.

**Task 4 — Entity-vs-entity radial collision** `[S]`
- Files: `src/sim/world.ts` (in `step`, after movement, push apart overlapping entities by radius).
- Acceptance: player and enemies cannot occupy the same point; enemies form a loose crowd rather than stacking.
- Test: extend `tests/collision.test.ts` — two entities pushed apart, player can't walk through an enemy.

**Task 5 — Spawn doors and zone-transition props as entities** `[M]`
- Files: `src/sim/content/zones.ts` (emit `Prop` entities for each `Door` and one `Prop` per zone connection labeled as an airlock/transition), `src/sim/world.ts` (register them in the zone entity map; `interact` resolves door by `Prop` entity id; `tryZoneTransition` reads which connection the prop represents).
- Acceptance: `findNearestInteractable` finds doors; pressing E opens/closes/unlocks; pressing E on a transition prop moves to the connected zone.
- Test: `tests/interactable.test.ts` — door toggle, locked-door requires key, zone transition moves player.

**Task 6 — Camera-relative movement** `[S]`
- Files: `src/game/input.ts` (`flushMovement` reads camera yaw from a callback/field and rotates `(dx,dz)` by yaw before sending `MoveIntent`), `src/game/camera.ts` (expose `yaw` getter), `src/main.ts` (wire camera yaw into input).
- Acceptance: pressing W moves the player "into the screen" regardless of camera orbit; A/D strafe relative to view.
- Test: manual (visual); optionally a unit test verifying the rotation math with a known yaw.

### Phase 2 — UI & Interaction (render/UI layer, no sim changes)

**Task 7 — Cursor raycast for ability targeting** `[M]`
- Files: `src/game/input.ts` (`cursorWorldPos` uses `THREE.Raycaster` against a ground plane at y=0, needs camera reference), `src/main.ts` (pass camera to InputHandler or set a callback).
- Acceptance: abilities with no enemy in range fire toward the cursor's world position.
- Test: manual; optionally a headless ray-math test.

**Task 8 — Interaction prompt UI** `[S]`
- Files: `src/world_api.ts` (add `getNearestInteractable(pos): { id, name, kind } | null` to `IWorld`), `src/sim/world.ts` (implement), `src/ui/interaction_prompt.ts` (NEW — DOM element showing "E — {name}" / "F — {name}"), `src/ui/hud.ts` or `src/main.ts` (instantiate and update each frame).
- Acceptance: prompt appears when near a door/item/NPC; disappears when out of range.
- Test: manual; unit-test `getNearestInteractable` in sim.

**Task 9 — Inventory panel** `[M]`
- Files: `src/ui/inventory.ts` (NEW — DOM panel, item slots, rarity-colored borders, use/equip/drop buttons, stack count), `src/main.ts` (wire `toggleInventory` to show/hide; pass tooltip system), `src/ui/styles.css` (panel styles).
- Acceptance: pressing I opens a panel listing all inventory items; clicking "Use" on a consumable applies it; clicking "Equip" on a weapon/armor swaps gear; tooltips on hover.
- Test: manual; optionally a DOM test with jsdom.

**Task 10 — Character sheet panel** `[S]`
- Files: `src/ui/character_sheet.ts` (NEW — shows level, XP, attack/defense/speed/crit, equipped weapon/armor, current abilities), `src/main.ts` (wire `toggleCharacterSheet`).
- Acceptance: Tab opens a stats summary; pressing Tab again closes it.
- Test: manual.

### Phase 3 — Polish & Integration

**Task 11 — Save/load round-trip for new fields** `[S]`
- Files: `src/sim/world.ts` (`serialize`/`deserialize` include `oxygen`, `combatTimer` for health regen, and any new prop entities), `src/world_api.ts` (`SerializedPlayer` gains `oxygen`).
- Acceptance: save → load produces identical oxygen and regen-timer state.
- Test: extend `tests/sim.test.ts` save/load case.

**Task 12 — Architecture test updates** `[S]`
- Files: `tests/architecture.test.ts` (ensure new `src/sim/collision.ts` and any new sim files pass isolation guards; ensure no new `three`/DOM imports in sim).
- Acceptance: `npm test` green; isolation invariants hold.
- Test: self (the architecture test is the test).

**Task 13 — End-to-end manual playthrough + dev server smoke** `[S]`
- Files: none (verification).
- Acceptance: `npm run dev` launches; full loop playable: menu → class select → move → fight → loot → level → zone transition → die or win.
- Test: manual checklist matching acceptance criteria.

---

## Detailed Design Notes

### 1. Three.js Scene Setup (already implemented — verify only)

The scene is already set up in `src/render/renderer.ts`:

- `WebGLRenderer` with antialiasing, device-pixel-ratio capped at 2, clear color `0x050608`.
- `THREE.Scene` with `FogExp2(0x050608, 0.025)` for atmospheric depth.
- `PerspectiveCamera` (60° FOV, near 0.1, far 200) initially at `(0,6,8)`, added to scene so the flashlight spotlight can be parented to it.
- `THREE.Clock` for frame deltas.
- Subsystems constructed in constructor: `LightingSystem` (ambient+hemisphere+flashlight+emergency lights), `StationBuilder`, `VfxSystem`, `AmbientSystem`.
- `render(dt)` updates ambient + lighting always; if `world.isRunning && phase===Playing`, also runs `updateGame(dt)` which handles zone-change detection, interpolation, entity sync, camera follow, event→VFX dispatch, death timers, VFX/station update; finally `webgl.render(scene, camera)`.
- `resize(w,h)` updates camera aspect + projection + renderer size.

**Issue #2 work here is minimal:** no new scene setup needed. The only renderer-side additions are
optional (debug collision visualization) and the cursor raycaster (lives in `src/game/`, not
`src/render/`). Verify the existing setup compiles and runs.

### 2. Player Controller Architecture

#### Movement (sim-side, deterministic)

`Sim.applyMovement(dt)` in `src/sim/world.ts` currently:
- Reads `moveIntent { dx, dz, running }`.
- Computes speed = `running ? speed*2.5 : speed`.
- Normalizes direction, multiplies by `speed*dt`.
- Clamps to zone AABB bounds only.
- Sets `rotation = atan2(dx, dz)` and `animState = Walk`.

**Planned changes:**
- Replace the AABB-only clamp with a collision resolver (`src/sim/collision.ts`):
  - Build per-zone collision segments from room perimeters and zone outer walls, respecting `DOOR_WIDTH` gaps (same constants as `station_builder.ts`).
  - Resolve X and Z independently: propose `newX = pos.x + dx`, check against solid segments on the X axis only (keeping Z), then propose `newZ` similarly. This gives wall sliding.
  - Entity-vs-entity: after movement, iterate entities and push apart any pair whose distance < `r1 + r2` by moving each half the overlap along the separating axis.
- Camera-relative direction is applied in `src/game/input.ts` before sending `MoveIntent` (rotate `(dx,dz)` by `-cameraYaw`), so the sim receives world-space intent and stays camera-agnostic.

#### Camera (game-side, already implemented)

`CameraController` in `src/game/camera.ts`:
- Yaw/pitch/distance orbit state; `applyDrag`/`applyZoom` from input.
- `update(dt)`: smooths player position via lerp, computes spherical→cartesian offset, positions camera, `lookAt` player + 1.0.
- **Change:** expose `getYaw()` so input can rotate movement vectors. Already has `yaw` private — make read-only getter.

#### Collision (sim-side, pure TS)

New `src/sim/collision.ts`:
- `getCollisionSegments(zone: Zone, doorWidth: number): Segment[]` — returns line segments representing solid walls (room perimeters minus door gaps + zone outer bounds).
- `resolveMovement(pos: Vec3, proposed: Vec3, radius: number, segments: Segment[]): Vec3` — returns adjusted position after axis-separated AABB-vs-segment resolution.
- `resolveEntityCollision(entities: Entity[]): void` — mutates positions to push apart overlapping pairs.
- All pure functions, no imports outside `world_api` types. Fully unit-testable.

### 3. Health / Oxygen / Inventory System Design

#### Health
- Already in `Stats.health`/`maxHealth`.
- **New:** out-of-combat regen — track `lastDamageTick` on the player; if `tick - lastDamageTick > REGEN_GRACE_TICKS` (e.g. 100 ticks = 5s), regen `healthRegenPerTick` (class-based, e.g. 0.5/tick).
- Death at `health <= 0` already triggers `GamePhase.GameOver`.

#### Oxygen
- **New fields on `Stats`:** `oxygen: number`, `maxOxygen: number` (default 100).
- **New in `BaseStats`/`createStartingStats`:** `oxygen: 100, maxOxygen: 100` for all classes (Scavenger could get +20 for "lung capacity" flavor).
- **Drain:** in `updateHazards`, if the entity is the player and the hazard type is `Vacuum`, drain `oxygen -= drainRate * dt` (e.g. 5/s). Also drain slowly in `Radiation` zones (reduced, e.g. 1/s) to represent suit strain.
- **Regen:** in `step`, if not in any vacuum/radiation hazard, `oxygen = min(maxOxygen, oxygen + regenRate * dt)` (e.g. 10/s).
- **Suffocation:** if `oxygen <= 0`, deal continuous damage (e.g. 3/s) as `Bio` school, emit `Damage` event.
- **Save/load:** add `oxygen` to `SerializedPlayer`.

#### Energy
- Already in `Stats.energy`/`maxEnergy`.
- **New:** passive regen — each tick, `energy = min(maxEnergy, energy + energyRegenPerTick)` where `energyRegenPerTick` is class-based (Engineer/Scientist ~2/tick = 40/s; Marine/Scavenger ~1.2/tick = 24/s). Pause regen for the tick an ability is cast (or for the cast duration if `castBar` active).
- Consumables (`consumable_energy_cell`) already restore energy via `useItem`.

#### Inventory
- Already on `Entity.inventory: Item[]` with `equippedWeapon`/`equippedArmor`.
- Sim already handles `pickup`/`useItem`/`equipItem` commands and stacking.
- **Missing:** the UI panel. `src/ui/inventory.ts` (NEW) renders the inventory as a DOM grid:
  - Each item slot: icon (glyph from `iconKey`), name, rarity-colored border, stack count.
  - Hover → `TooltipSystem.showItem`.
  - Buttons: "Use" (consumables), "Equip" (weapon/armor), "Drop" (future).
  - Sends `world.command({ type: 'useItem'|'equipItem', intent: { itemId } })`.
  - Toggled by I key via `main.ts` (replacing the current audio-blip stub).
- **Character sheet** (`src/ui/character_sheet.ts`, NEW) shows derived stats + equipped gear + abilities, toggled by Tab.

### 4. UI Layout for HUD

The HUD already exists (`src/ui/hud.ts`) with this layout:

```
┌─────────────────────────────────────────────────────────────┐
│  ┌────────────┐                          ┌────────────────┐ │
│  │ Vitals     │                          │   Minimap     │ │
│  │ ▓▓▓ HP      │                          │  (canvas)     │ │
│  │ ▓▓▓ EN      │                          │  ZONE NAME    │ │
│  │ LV 1        │                          └────────────────┘ │
│  │ ▓▓▓ XP      │                                              │
│  │ [status fx] │                                              │
│  └────────────┘                                              │
│                                                              │
│             [Cast Bar — appears when casting]                │
│                                                              │
│      ┌──────────────────────────────────────┐               │
│      │  [1] [2] [3] [4]   Ability Bar       │               │
│      └──────────────────────────────────────┘               │
│                                                              │
│  ┌──────────────────────┐    [Damage Flash overlay]         │
│  │ Event Log (5 lines)  │                                   │
│  └──────────────────────┘                                   │
│                                                              │
│             [Zone Label — fades in/out on entry]             │
└─────────────────────────────────────────────────────────────┘
```

**Additions for issue #2:**

- **Oxygen bar** — add to the Vitals panel, below energy, styled cyan. Driven by new `Stats.oxygen`/`maxOxygen`.
- **Interaction prompt** — new DOM element bottom-center above the ability bar: `src/ui/interaction_prompt.ts`. Shows `[E] Open Door` / `[F] Pickup Medkit` when `IWorld.getNearestInteractable()` returns something. Styled as a thin pill with a key glyph.
- **Inventory panel** — full-screen dimmed overlay with a centered grid panel (`src/ui/inventory.ts`). Toggled by I. Not part of the HUD; lives in `hud-root` like menus.
- **Character sheet** — right-side slide-in panel (`src/ui/character_sheet.ts`). Toggled by Tab.
- **Combat/health-regen indicator** — optional: pulse the HP bar when regen is active.

All new UI is DOM-based (consistent with existing HUD/menus/tooltips), styled via `src/ui/styles.css`,
and reads `IWorld` only. No Three.js in UI layer.

### 5. File Structure for New Code

```
src/
├── main.ts                      # MODIFIED — wire new UI panels, camera yaw into input, cursor raycast
├── world_api.ts                 # MODIFIED — +oxygen/maxOxygen on Stats, +getNearestInteractable on IWorld, +oxygen on SerializedPlayer
├── sim/
│   ├── world.ts                 # MODIFIED — oxygen drain/regen, energy regen, health regen, collision, prop doors
│   ├── rng.ts                   # unchanged
│   ├── collision.ts             # NEW — collision segment builder + movement resolver + entity push-apart
│   └── content/
│       ├── classes.ts           # MODIFIED — +oxygen/maxOxygen to BaseStats/createStartingStats/applyLevelUp, +energyRegen/healthRegen
│       ├── zones.ts             # MODIFIED — emit Prop entities for doors + zone transitions
│       ├── enemies.ts           # unchanged
│       ├── items.ts             # unchanged
│       └── abilities.ts         # unchanged
├── render/
│   ├── renderer.ts              # unchanged (verify)
│   ├── world/station_builder.ts # unchanged
│   ├── characters/character_visual.ts # unchanged
│   └── effects/{lighting,ambient,vfx}.ts # unchanged
├── game/
│   ├── input.ts                 # MODIFIED — camera-relative movement, cursor raycast, wire interactable prompt
│   ├── camera.ts                # MODIFIED — expose getYaw()
│   └── audio.ts                 # unchanged
└── ui/
    ├── hud.ts                   # MODIFIED — add oxygen bar, instantiate interaction prompt
    ├── menus.ts                  # unchanged
    ├── tooltips.ts               # unchanged
    ├── styles.css                # MODIFIED — add styles for oxygen bar, inventory, character sheet, interaction prompt
    ├── interaction_prompt.ts     # NEW — DOM prompt for nearby interactables/pickups
    ├── inventory.ts              # NEW — inventory panel with use/equip
    └── character_sheet.ts        # NEW — stats + gear + abilities panel

tests/
├── sim.test.ts                  # MODIFIED — extend for regen, save/load oxygen
├── architecture.test.ts         # MODIFIED — ensure new sim files pass isolation
├── oxygen.test.ts               # NEW — oxygen drain/regen/suffocation
├── collision.test.ts             # NEW — wall collision, sliding, entity push-apart
└── interactable.test.ts          # NEW — door toggle, zone transition via prop entity

docs/
└── core-game-loop-plan.md       # THIS FILE
```

### 6. Test Strategy

#### Unit Tests (Vitest, pure TS, no DOM/Three.js)

| File | Covers |
|------|-------|
| `tests/sim.test.ts` (extend) | Energy regen rate, health regen after combat grace, save/load includes oxygen + regen timers. |
| `tests/oxygen.test.ts` (NEW) | Oxygen starts at max; drains in vacuum hazard at expected rate; regens when safe; suffocation damage when 0; save/load round-trip. |
| `tests/collision.test.ts` (NEW) | `getCollisionSegments` returns expected segments for a simple zone; `resolveMovement` blocks player at wall; sliding along wall works; door gap is passable; entity push-apart separates two overlapping entities. |
| `tests/interactable.test.ts` (NEW) | Door prop toggles open on interact; locked door requires key item; zone-transition prop moves player to connected zone and emits `ZoneChange`. |
| `tests/architecture.test.ts` (extend) | All new `src/sim/*.ts` files (including `collision.ts`) pass the existing isolation guards: no `three` imports, no DOM types, no `Math.random` (except `world.ts` seed), no `Date.now`/`performance.now`. |

#### Integration Tests

- Sim determinism: same seed + same commands → same oxygen, energy, health, position after N ticks (extend existing determinism test).
- Full combat loop: spawn → take damage → regen → use consumable → kill enemy → level up → verify stats increased (extend `tests/sim.test.ts` combat block).

#### Manual / Visual Verification

- `npm run dev` launches without console errors.
- Playthrough checklist (matches acceptance criteria):
  1. Main menu → New Game → select Marine → Begin.
  2. Airlock zone renders; HUD shows HP/EN/O₂/XP bars and ability bar.
  3. WASD moves the player camera-relative; walls block movement; can slide along walls.
  4. Walk into a vacuum hazard → O₂ bar drains; leave → O₂ regens.
  5. Wait idle → EN bar refills; after 5s out of combat → HP slowly refills.
  6. Press 1 → ability fires toward nearest enemy or cursor; EN decreases; cooldown overlay appears.
  7. Kill an enemy → XP gained; level up → full HP/EN, ability unlocked, level-up chime.
  8. Walk over loot → press F → item picked up; event log shows "Looted: ...".
  9. Press I → inventory panel opens; item listed with rarity color; hover shows tooltip; click Use on a medkit → HP increases.
  10. Press Tab → character sheet opens showing stats and gear.
  11. Approach a door → interaction prompt "E — Door" appears; press E → door opens/closes.
  12. Approach zone-transition prop → prompt "E — Airlock"; press E → zone changes; zone label fades in.
  13. Die → Game Over screen; Restart → back to gameplay.
  14. Pause (Esc) → Save → reload page → Continue → state restored including oxygen and inventory.

#### Performance Thresholds

- Sim tick (20Hz) completes in < 2ms even with full collision resolution (validate via `performance.now()` in a stress test with max entities).
- Render frame (60fps) stays under 16ms budget with VFX active.
- No per-frame allocations in hot paths (collision resolver uses scratch objects like the renderer does).

---

## Dependencies

- **None blocking.** Issue #2 is self-contained; the existing codebase has the foundation (sim, renderer, input, HUD scaffolding). All work is additive or modifying existing files.
- **Related issues (speculative, not blocking):** Combat tuning, crafting, save scumming toggle, Godot migration — all separate.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Collision resolver disagrees with rendered wall geometry (player blocked by invisible wall or clips through visible wall) | Share constants (`DOOR_WIDTH`, `WALL_THICKNESS`) between `station_builder.ts` and `collision.ts`; add a debug toggle in renderer to visualize collision segments (lines) against geometry; manual visual QA in each zone. |
| Sim isolation violated by importing Three.js types into collision | `collision.ts` uses only `Vec3`/`Zone` from `world_api`; architecture test enforces no `three` import. |
| Oxygen feels like a chore (constant micromanagement) | Default drain rate slow (5s of O₂ per second of vacuum); regen fast (10s/s); vacuum hazards rare in early zones; suffocation damage modest. Tune in playtest. |
| Energy regen makes abilities free (spam) | Regen rate tuned per class (~24-40/s) vs ability costs (15-40); combat still depletes faster than regen. Add a "no regen during cast bar" guard. |
| Inventory panel and HUD both try to handle I key | `main.ts` owns the toggle; HUD doesn't listen for keys. Single source of truth. |
| Cursor raycast breaks in headless test env | Raycast lives in `src/game/input.ts` (game layer, not sim); tests don't exercise it. Fallback to forward-direction (existing behavior) when camera unavailable. |
| Zone transition via any interact call (current bug) makes doors also trigger zone change | Task 5 fixes this: `tryZoneTransition` only fires when the interacted prop is tagged as a transition; doors are a separate prop kind. |
| Save format break (new `oxygen` field) | `deserialize` defaults `oxygen` to `maxOxygen` if missing; bump `SAVE_VERSION` and add migration in `deserialize`. |

---

## Open Questions (for follow-up)

1. Should oxygen drain in all hazard types or only `Vacuum`/`Radiation`? (Current plan: those two only.)
2. Should the inventory have a weight/slot limit? (Out of scope for #2 — infinite for now.)
3. Should health regen require standing still, or just "out of combat"? (Current plan: out of combat, any movement.)
4. Do enemies need oxygen too (for vacuum zones)? (Current plan: no — enemies are assumed suit-equipped; only player drains for gameplay tension.)
5. Should the character sheet allow spending attribute points? (Out of scope — stats auto-grow on level up per `CLASS_DEFS.growth`.)

---

## Phase Summary

| Phase | Tasks | Deliverable |
|-------|-------|-------------|
| **Phase 1** | T1–T6 | Sim mechanics (oxygen, regen, collision, doors, camera-relative move) — all unit-tested. |
| **Phase 2** | T7–T10 | UI & interaction (cursor raycast, prompt, inventory, character sheet). |
| **Phase 3** | T11–T13 | Save/load, architecture guards, end-to-end playthrough. |

Each phase is independently reviewable and shippable. Phase 1 alone makes the game feel
substantially better (collision + oxygen + regen). Phase 2 closes the UI loop. Phase 3 hardens it.