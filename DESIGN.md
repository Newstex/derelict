# DERELICT — Survive the Silence

## Concept

A sci-fi space station survival RPG. You are the sole survivor aboard a derelict space station orbiting a dead star. The station's AI has gone rogue, systems are failing, and something lurks in the dark corridors. Fight, scavenge, and repair your way through themed zones to reach the bridge and reclaim the station — or escape.

**Theme:** Sci-fi horror survival (think Dead Space meets System Shock, but solo/offline RPG)
**Tone:** Dark, atmospheric, lonely. Emergency lighting. Sparks. Humming machinery.

## Core Design

- **Solo/offline only** — no server, no multiplayer, localStorage saves
- **4 classes:** Engineer (drones/turrets), Marine (combat), Scientist (healing/bio), Scavenger (loot/speed)
- **7 station zones:** Command, Habitation, Engineering, Cargo, Medical, Hydroponics, Airlock
- **Procedural rooms** — each zone has generated room layouts with hazards, loot, and enemies
- **Combat:** Real-time with abilities, status effects, energy management
- **Progression:** Level up, find better gear, unlock abilities, craft consumables from materials
- **Win condition:** Reach the bridge (Command zone), defeat the rogue AI core
- **Death:** Permadeath with optional save scumming (player's choice)

## Visual Style

- Dark metallic corridors with emergency lighting (red/blue/green per biome)
- Procedural geometry — no shipped 3D assets (boxes, cylinders, planes composed into station interiors)
- Particle effects: sparks, steam, fire, dust motes
- Procedural lighting: flickering emergency lights, glowing panels
- Minimal HUD — diegetic-style (overlay frames, not immersive-breaking)

## Architecture

Follows the Browser RPG Engine skill pattern:
- `src/sim/` — deterministic game core (zero Three.js/DOM imports)
- `src/world_api.ts` — IWorld interface (the only seam)
- `src/render/` — Three.js renderer (reads IWorld, never mutates sim)
- `src/game/` — input, camera, audio
- `src/ui/` — HUD, menus, tooltips
- `src/main.ts` — entry point

## Content

### Classes
| Class | Resource | Role | Starting Abilities |
|-------|----------|------|-------------------|
| Engineer | Energy | Support/DPS | Deploy Turret, Repair, Overcharge |
| Marine | Energy | Tank/DPS | Power Shot, Combat Stim, Suppression Fire |
| Scientist | Energy | Healer/Control | Med-Nanites, Cryo Blast, Bio-Scan |
| Scavenger | Energy | DPS/Utility | Rapid Fire, Cloak, Scrap Grenade |

### Enemy Types
- Rogue Security Drones, Malfunctioning Maintenance Bots, Mutated Crew Members,
  Vent Crawlers, AI Core Turrets, Station Hazards (fire/steam/elec)

### Damage Schools
Kinetic, Energy, Fire, Cryo, Shock, Bio

### Progression
- Levels 1-20
- XP from kills, exploration, crafting
- Stat increases per level (class-weighted)
- Ability unlocks at levels 1, 3, 5, 8, 12, 16
- Item rarities: Common, Uncommon, Rare, Epic