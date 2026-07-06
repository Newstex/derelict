/**
 * Zone definitions and procedural generation.
 *
 * Each of the 7 station zones has its own biome, level range, bounds, and
 * generation parameters. The procedural generator uses a seeded Rng to create
 * rooms, corridors, doors, hazards, and enemy spawns.
 */

import {
  Door,
  Entity,
  EntityId,
  EntityKind,
  Hazard,
  HazardType,
  Room,
  RoomType,
  StationBiome,
  Vec3,
  Zone,
  ZoneId,
} from '../../world_api';
import { Rng } from '../rng';
import { scaledEnemyStats, ENEMY_TEMPLATES, EnemyTemplate } from './enemies';
import { generateItem } from './items';

// ============================================================
// Types
// ============================================================

export interface ZoneDef {
  id: ZoneId;
  name: string;
  description: string;
  biome: StationBiome;
  levelRange: [number, number];
  bounds: { width: number; depth: number };
  /** Room generation parameters. */
  roomCount: [number, number];
  roomSizeRange: [number, number];
  hazardTypes: HazardType[];
  hazardDensity: number; // 0..1
  /** Weighted enemy spawn table. */
  enemySpawnTable: { templateId: string; weight: number }[];
  /** Whether this zone contains the AI core (victory objective). */
  isFinalZone: boolean;
  /** Whether this is the starting zone. */
  isStartZone: boolean;
  /** Connecting zones (for transitions). */
  connectsTo: ZoneId[];
}

// ============================================================
// Zone Definitions
// ============================================================

export const ZONE_DEFS: ZoneDef[] = [
  {
    id: 'airlock',
    name: 'Airlock',
    description:
      'The emergency airlock where you awoke. Cold, dark, and filled with the hum of failing life support.',
    biome: StationBiome.Airlock,
    levelRange: [1, 2],
    bounds: { width: 40, depth: 40 },
    roomCount: [4, 6],
    roomSizeRange: [6, 10],
    hazardTypes: [HazardType.Vacuum],
    hazardDensity: 0.1,
    enemySpawnTable: [
      { templateId: 'maintenance_bot', weight: 3 },
      { templateId: 'vent_crawler', weight: 1 },
    ],
    isFinalZone: false,
    isStartZone: true,
    connectsTo: ['habitation'],
  },
  {
    id: 'habitation',
    name: 'Habitation Deck',
    description:
      'Crew quarters. Personal effects scattered. Emergency lighting casts long shadows down empty corridors.',
    biome: StationBiome.Habitation,
    levelRange: [2, 4],
    bounds: { width: 60, depth: 60 },
    roomCount: [6, 9],
    roomSizeRange: [6, 12],
    hazardTypes: [HazardType.Fire, HazardType.Steam],
    hazardDensity: 0.15,
    enemySpawnTable: [
      { templateId: 'maintenance_bot', weight: 2 },
      { templateId: 'mutated_crew_member', weight: 3 },
      { templateId: 'vent_crawler', weight: 2 },
    ],
    isFinalZone: false,
    isStartZone: false,
    connectsTo: ['airlock', 'engineering', 'medical', 'cargo'],
  },
  {
    id: 'engineering',
    name: 'Engineering',
    description:
      'Machinery and reactor systems. Sparks fly from exposed conduits. The air smells of ozone and coolant.',
    biome: StationBiome.Engineering,
    levelRange: [3, 6],
    bounds: { width: 70, depth: 70 },
    roomCount: [7, 10],
    roomSizeRange: [7, 14],
    hazardTypes: [HazardType.Electric, HazardType.Fire, HazardType.Steam],
    hazardDensity: 0.25,
    enemySpawnTable: [
      { templateId: 'rogue_security_drone', weight: 3 },
      { templateId: 'maintenance_bot', weight: 3 },
      { templateId: 'mutated_crew_member', weight: 1 },
    ],
    isFinalZone: false,
    isStartZone: false,
    connectsTo: ['habitation', 'hydroponics'],
  },
  {
    id: 'cargo',
    name: 'Cargo Bay',
    description:
      'Vast storage holds stacked with crates. Something skitters between the containers in the dark.',
    biome: StationBiome.Cargo,
    levelRange: [3, 6],
    bounds: { width: 65, depth: 65 },
    roomCount: [5, 8],
    roomSizeRange: [8, 16],
    hazardTypes: [HazardType.Fire],
    hazardDensity: 0.15,
    enemySpawnTable: [
      { templateId: 'vent_crawler', weight: 4 },
      { templateId: 'rogue_security_drone', weight: 2 },
      { templateId: 'maintenance_bot', weight: 1 },
    ],
    isFinalZone: false,
    isStartZone: false,
    connectsTo: ['habitation', 'hydroponics'],
  },
  {
    id: 'medical',
    name: 'Medical Bay',
    description:
      'Sterile corridors stained with old blood. Biomonitors flicker with fading vital signs. The nanite vats hum.',
    biome: StationBiome.Medical,
    levelRange: [4, 7],
    bounds: { width: 55, depth: 55 },
    roomCount: [6, 9],
    roomSizeRange: [6, 12],
    hazardTypes: [HazardType.Radiation, HazardType.Steam],
    hazardDensity: 0.2,
    enemySpawnTable: [
      { templateId: 'mutated_crew_member', weight: 4 },
      { templateId: 'vent_crawler', weight: 2 },
      { templateId: 'rogue_security_drone', weight: 1 },
    ],
    isFinalZone: false,
    isStartZone: false,
    connectsTo: ['habitation', 'hydroponics'],
  },
  {
    id: 'hydroponics',
    name: 'Hydroponics',
    description:
      'Overgrown planters and mutation-tinged algae tanks. The air is thick with spores and organic decay.',
    biome: StationBiome.Hydroponics,
    levelRange: [5, 9],
    bounds: { width: 60, depth: 60 },
    roomCount: [6, 9],
    roomSizeRange: [7, 14],
    hazardTypes: [HazardType.Radiation, HazardType.Fire],
    hazardDensity: 0.25,
    enemySpawnTable: [
      { templateId: 'mutated_crew_member', weight: 3 },
      { templateId: 'vent_crawler', weight: 3 },
      { templateId: 'rogue_security_drone', weight: 2 },
    ],
    isFinalZone: false,
    isStartZone: false,
    connectsTo: ['engineering', 'cargo', 'medical', 'command'],
  },
  {
    id: 'command',
    name: 'Command Bridge',
    description:
      'The bridge of the station. The rogue AI core pulses with hostile light. This is where it ends.',
    biome: StationBiome.Command,
    levelRange: [8, 12],
    bounds: { width: 50, depth: 50 },
    roomCount: [4, 6],
    roomSizeRange: [8, 14],
    hazardTypes: [HazardType.Electric, HazardType.Fire],
    hazardDensity: 0.3,
    enemySpawnTable: [
      { templateId: 'ai_core_turret', weight: 4 },
      { templateId: 'rogue_security_drone', weight: 3 },
    ],
    isFinalZone: true,
    isStartZone: false,
    connectsTo: ['hydroponics'],
  },
];

export const ZONE_DEF_MAP: Record<ZoneId, ZoneDef> = Object.fromEntries(
  ZONE_DEFS.map((z) => [z.id, z]),
);

/** The starting zone id. */
export const START_ZONE_ID: ZoneId = 'airlock';

// ============================================================
// Procedural Zone Generator
// ============================================================

/**
 * Generate a complete zone from a ZoneDef and seed.
 *
 * Produces rooms, corridors, doors, hazards, and enemy entities.
 * All randomness flows through the seeded Rng — fully deterministic.
 *
 * @param def The zone definition.
 * @param seed The zone seed.
 * @param nextEntityId Starting entity id counter (mutated and returned).
 * @returns The generated Zone plus updated entity id counter.
 */
export function generateZone(
  def: ZoneDef,
  seed: number,
  nextEntityId: EntityId,
): { zone: Zone; doors: Door[]; enemies: Entity[]; items: Entity[]; nextEntityId: EntityId } {
  const rng = new Rng(seed);
  let eid = nextEntityId;

  const rooms: Room[] = [];
  const doors: Door[] = [];
  const hazards: Hazard[] = [];
  const enemies: Entity[] = [];
  const items: Entity[] = [];
  const entityIds: EntityId[] = [];

  const roomCount = rng.nextInt(def.roomCount[0], def.roomCount[1]);
  const levelRange = def.levelRange;

  // --- Generate rooms ---
  // We use a simple grid-based placement: divide bounds into a grid and place rooms.
  const gridCols = 4;
  const gridRows = 4;
  const cellW = def.bounds.width / gridCols;
  const cellD = def.bounds.depth / gridRows;
  const occupied: boolean[] = new Array(gridCols * gridRows).fill(false);

  const roomTypes: RoomType[] = def.isFinalZone
    ? [RoomType.Bridge, RoomType.Armory, RoomType.Chamber, RoomType.Junction, RoomType.Corridor]
    : [RoomType.Chamber, RoomType.Storage, RoomType.Junction, RoomType.Corridor, RoomType.Medbay, RoomType.Armory];

  for (let i = 0; i < roomCount; i++) {
    // Find a free grid cell
    let cell = -1;
    for (let attempt = 0; attempt < 20; attempt++) {
      const c = rng.nextInt(0, gridCols * gridRows - 1);
      if (!occupied[c]) {
        cell = c;
        break;
      }
    }
    if (cell < 0) break;
    occupied[cell] = true;

    const col = cell % gridCols;
    const row = Math.floor(cell / gridCols);
    const roomW = rng.nextInt(def.roomSizeRange[0], def.roomSizeRange[1]);
    const roomD = rng.nextInt(def.roomSizeRange[0], def.roomSizeRange[1]);
    const cx = col * cellW + cellW / 2;
    const cz = row * cellD + cellD / 2;

    // Final zone gets a bridge room
    let roomType: RoomType;
    if (def.isFinalZone && i === 0) {
      roomType = RoomType.Bridge;
    } else {
      roomType = rng.pick(roomTypes);
    }

    const roomId = `room_${def.id}_${i}`;
    const hasLoot = rng.chance(0.4);
    rooms.push({
      id: roomId,
      name: roomTypeName(roomType),
      pos: { x: cx, y: 0, z: cz },
      width: roomW,
      depth: roomD,
      type: roomType,
      cleared: false,
      hasLoot,
      doorIds: [],
    });
  }

  // --- Generate corridors (as corridor rooms) connecting adjacent placed rooms ---
  // Connect rooms that are grid-adjacent.
  const placedCells: number[] = [];
  occupied.forEach((o, idx) => {
    if (o) placedCells.push(idx);
  });

  for (const cell of placedCells) {
    const col = cell % gridCols;
    const row = Math.floor(cell / gridCols);
    // Check right neighbor
    const rightCell = col + 1 < gridCols ? cell + 1 : -1;
    if (rightCell >= 0 && occupied[rightCell] && rng.chance(0.7)) {
      const doorPos: Vec3 = {
        x: (col + 1) * cellW,
        y: 0,
        z: row * cellD + cellD / 2,
      };
      const doorId = `door_${def.id}_${doors.length}`;
      const locked = rng.chance(0.1);
      doors.push({
        id: doorId,
        pos: doorPos,
        locked,
        open: !locked,
      });
      // Add door to adjacent rooms
      const roomA = rooms.find((r) => Math.abs(r.pos.x - col * cellW - cellW / 2) < 1 && Math.abs(r.pos.z - row * cellD - cellD / 2) < 1);
      const roomB = rooms.find((r) => Math.abs(r.pos.x - (col + 1) * cellW - cellW / 2) < 1 && Math.abs(r.pos.z - row * cellD - cellD / 2) < 1);
      if (roomA) roomA.doorIds.push(doorId);
      if (roomB) roomB.doorIds.push(doorId);
    }
    // Check bottom neighbor
    const bottomCell = row + 1 < gridRows ? cell + gridCols : -1;
    if (bottomCell >= 0 && occupied[bottomCell] && rng.chance(0.7)) {
      const doorPos: Vec3 = {
        x: col * cellW + cellW / 2,
        y: 0,
        z: (row + 1) * cellD,
      };
      const doorId = `door_${def.id}_${doors.length}`;
      const locked = rng.chance(0.1);
      doors.push({
        id: doorId,
        pos: doorPos,
        locked,
        open: !locked,
      });
      const roomA = rooms.find((r) => Math.abs(r.pos.x - col * cellW - cellW / 2) < 1 && Math.abs(r.pos.z - row * cellD - cellD / 2) < 1);
      const roomB = rooms.find((r) => Math.abs(r.pos.x - col * cellW - cellW / 2) < 1 && Math.abs(r.pos.z - (row + 1) * cellD - cellD / 2) < 1);
      if (roomA) roomA.doorIds.push(doorId);
      if (roomB) roomB.doorIds.push(doorId);
    }
  }

  // --- Generate hazards ---
  const hazardCount = Math.floor(rooms.length * def.hazardDensity);
  for (let i = 0; i < hazardCount; i++) {
    const room = rng.pick(rooms);
    const hazardType = rng.pick(def.hazardTypes);
    const hazardId = `hazard_${def.id}_${i}`;
    const pos: Vec3 = {
      x: room.pos.x + rng.range(-room.width / 3, room.width / 3),
      y: 0,
      z: room.pos.z + rng.range(-room.depth / 3, room.depth / 3),
    };
    hazards.push({
      id: hazardId,
      type: hazardType,
      pos,
      radius: rng.range(1.5, 3),
      damage: rng.nextInt(5, 15),
      school: hazardSchool(hazardType),
    });
  }

  // --- Generate enemy spawns ---
  for (const room of rooms) {
    if (room.type === RoomType.Corridor || room.type === RoomType.Junction) continue;
    if (def.isFinalZone && room.type === RoomType.Bridge) {
      // Bridge always has the AI core turret (final boss)
      const boss = createEnemyEntity(
        'ai_core_turret',
        def.levelRange[1],
        eid++,
        { x: room.pos.x, y: 0, z: room.pos.z },
        rng,
      );
      boss.name = 'Rogue AI Core';
      boss.visualKey = 'enemy_ai_core';
      enemies.push(boss);
      entityIds.push(boss.id);
      continue;
    }
    // Regular rooms get 0-3 enemies based on room size
    const spawnRoll = rng.next();
    const enemyCount = spawnRoll < 0.3 ? 0 : spawnRoll < 0.7 ? 1 : spawnRoll < 0.9 ? 2 : 3;
    for (let i = 0; i < enemyCount; i++) {
      const tmpl = pickWeighted(def.enemySpawnTable, rng);
      const level = rng.nextInt(levelRange[0], levelRange[1]);
      const pos: Vec3 = {
        x: room.pos.x + rng.range(-room.width / 3, room.width / 3),
        y: 0,
        z: room.pos.z + rng.range(-room.depth / 3, room.depth / 3),
      };
      const enemy = createEnemyEntity(tmpl, level, eid++, pos, rng);
      enemies.push(enemy);
      entityIds.push(enemy.id);
    }
  }

  // --- Generate loot items in rooms with hasLoot ---
  for (const room of rooms) {
    if (!room.hasLoot) continue;
    // Pick a random enemy template's loot table to draw from
    const tmplId = pickWeighted(def.enemySpawnTable, rng);
    const tmpl: EnemyTemplate = ENEMY_TEMPLATES[tmplId];
    if (!tmpl || tmpl.lootTable.length === 0) continue;
    const lootEntry = rng.pick(tmpl.lootTable);
    const item = generateItem(rng.fork(), lootEntry.itemTag, lootEntry.rarityBias ?? 0);
    const itemEntity: Entity = {
      id: eid++,
      kind: EntityKind.Item,
      name: item.name,
      pos: {
        x: room.pos.x + rng.range(-room.width / 4, room.width / 4),
        y: 0,
        z: room.pos.z + rng.range(-room.depth / 4, room.depth / 4),
      },
      rotation: 0,
      radius: 0.3,
      stats: emptyStats(),
      isAlive: true,
      visualKey: item.iconKey,
      animState: 'idle' as never,
      lastAttacked: 0,
      castBar: null,
    };
    // Attach the item to the entity (Sim reads this for pickup)
    (itemEntity as Entity & { item?: typeof item }).item = item;
    items.push(itemEntity);
    entityIds.push(itemEntity.id);
  }

  const zone: Zone = {
    id: def.id,
    name: def.name,
    description: def.description,
    levelRange: def.levelRange,
    bounds: def.bounds,
    entities: entityIds,
    seed,
    biome: def.biome,
    hazards,
    rooms,
  };

  return { zone, doors, enemies, items, nextEntityId: eid };
}

// ============================================================
// Helpers
// ============================================================

function roomTypeName(type: RoomType): string {
  switch (type) {
    case RoomType.Corridor: return 'Corridor';
    case RoomType.Chamber: return 'Chamber';
    case RoomType.Junction: return 'Junction';
    case RoomType.Storage: return 'Storage';
    case RoomType.Reactor: return 'Reactor';
    case RoomType.Medbay: return 'Medbay';
    case RoomType.Armory: return 'Armory';
    case RoomType.Bridge: return 'Bridge';
    case RoomType.Airlock: return 'Airlock';
  }
}

function hazardSchool(type: HazardType) {
  switch (type) {
    case HazardType.Fire: return 'fire' as never;
    case HazardType.Electric: return 'shock' as never;
    case HazardType.Radiation: return 'bio' as never;
    case HazardType.Vacuum: return 'cryo' as never;
    case HazardType.Steam: return 'fire' as never;
  }
}

function pickWeighted(table: { templateId: string; weight: number }[], rng: Rng): string {
  const total = table.reduce((s, e) => s + e.weight, 0);
  let r = rng.next() * total;
  for (const entry of table) {
    r -= entry.weight;
    if (r <= 0) return entry.templateId;
  }
  return table[0].templateId;
}

function emptyStats() {
  return {
    health: 0,
    maxHealth: 0,
    energy: 0,
    maxEnergy: 0,
    level: 1,
    xp: 0,
    xpToNext: 0,
    attack: 0,
    defense: 0,
    speed: 0,
    critChance: 0,
  };
}

function createEnemyEntity(
  templateId: string,
  level: number,
  id: EntityId,
  pos: Vec3,
  rng: Rng,
): Entity {
  const tmpl = ENEMY_TEMPLATES[templateId];
  if (!tmpl) throw new Error(`Unknown enemy template: ${templateId}`);
  const stats = scaledEnemyStats(templateId, level);

  return {
    id,
    kind: EntityKind.Enemy,
    name: tmpl.name,
    pos: { ...pos },
    rotation: rng.range(0, Math.PI * 2),
    radius: tmpl.radius,
    stats,
    enemyTemplateId: templateId,
    abilities: tmpl.abilities.map((a) => a.id),
    inventory: [],
    effects: [],
    isAlive: true,
    visualKey: tmpl.visualKey,
    animState: 'idle' as never,
    lastAttacked: 0,
    castBar: null,
  };
}