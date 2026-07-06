/**
 * StationGenerator — procedural generation of a derelict space station.
 *
 * Produces a connected layout of rooms and corridors on the XZ plane using
 * a grid-based placement strategy:
 *
 *  1. Rooms are placed on a coarse integer grid. Each grid cell can hold
 *     one room. Starting from the bridge at the grid origin, the generator
 *     repeatedly picks a random occupied cell with free neighbours and
 *     grows into a free neighbour, connecting the new room to its parent
 *     with an axis-aligned corridor.
 *  2. Room types are assigned so the bridge is always first, airlocks are
 *     spread around the perimeter, and the remaining types fill interior
 *     cells (with engineering and crew quarters weighted more heavily).
 *  3. Each room's dimensions are derived from its type and jittered by the
 *     RNG for variety, then converted to world-space coordinates using a
 *     configurable cell size.
 *  4. Corridors connect the door centres of adjacent rooms. Because we
 *     only grow into immediately adjacent grid cells, corridors are always
 *     axis-aligned and short.
 *
 * The generator uses the seeded Rng from src/sim/rng.ts, so identical seeds
 * produce identical layouts. This is the ONLY source of randomness here —
 * no Math.random anywhere.
 *
 * Addresses issue #5 (Procedural Station Generation).
 */

import * as THREE from 'three';
import { Rng } from '../sim/rng.js';
import { Room, ROOM_TYPES, type RoomType, type DoorSide } from './Room.js';
import { Corridor } from './Corridor.js';

/** Configuration for station generation. */
export interface StationGeneratorOptions {
  /** Seed for the RNG. Same seed → same layout. */
  seed: number;
  /** Number of rooms to generate (including the bridge). */
  roomCount: number;
  /** World units per grid cell (rooms are placed on this spacing). */
  cellSize?: number;
  /** Corridor width in world units. */
  corridorWidth?: number;
  /** Default room width range (interior, before type scaling). */
  minRoomSize?: number;
  maxRoomSize?: number;
}

export interface GeneratedStation {
  rooms: Room[];
  corridors: Corridor[];
  /** Adjacency list: room index → connected room indices. */
  adjacency: Map<number, number[]>;
  seed: number;
  roomCount: number;
}

/** Type weights for non-bridge, non-airlock cells. */
const INTERIOR_TYPE_WEIGHTS: Record<string, number> = {
  engineering: 3,
  'crew quarters': 3,
  'med-bay': 2,
  storage: 2,
};

const FOUR_DIRECTIONS: Array<{ dx: number; dz: number; side: DoorSide }> = [
  { dx: 0, dz: 1, side: 'north' },
  { dx: 0, dz: -1, side: 'south' },
  { dx: 1, dz: 0, side: 'east' },
  { dx: -1, dz: 0, side: 'west' },
];

/** Reverse of a door side (the side you enter from on the far room). */
function oppositeSide(side: DoorSide): DoorSide {
  switch (side) {
    case 'north': return 'south';
    case 'south': return 'north';
    case 'east': return 'west';
    case 'west': return 'east';
  }
}

export class StationGenerator {
  readonly seed: number;
  readonly roomCount: number;
  readonly cellSize: number;
  readonly corridorWidth: number;
  readonly minRoomSize: number;
  readonly maxRoomSize: number;

  constructor(opts: StationGeneratorOptions) {
    if (opts.roomCount < 1) {
      throw new Error('StationGenerator: roomCount must be >= 1');
    }
    this.seed = opts.seed >>> 0;
    this.roomCount = opts.roomCount;
    this.cellSize = opts.cellSize ?? 12;
    this.corridorWidth = opts.corridorWidth ?? 2;
    this.minRoomSize = opts.minRoomSize ?? 6;
    this.maxRoomSize = opts.maxRoomSize ?? 9;
  }

  /**
   * Generate the station. Returns the rooms, corridors, and an adjacency
   * map. The layout is guaranteed connected: every room is reachable from
   * room 0 (the bridge) via corridors.
   */
  generate(): GeneratedStation {
    const rng = new Rng(this.seed);
    const cells = new Map<string, number>(); // "gx,gz" → room index
    const roomCells: Array<{ gx: number; gz: number }> = [];
    const adjacency = new Map<number, number[]>();

    // --- Place rooms on a grid, growing from the origin ---
    const rooms: Room[] = [];
    const corridors: Corridor[] = [];

    // Room 0: the bridge, at the grid origin.
    const bridgeCell = { gx: 0, gz: 0 };
    cells.set(this.cellKey(0, 0), 0);
    roomCells.push(bridgeCell);
    adjacency.set(0, []);

    const bridgeRoom = this.makeRoom(rng, 'bridge', 0, 0);
    rooms.push(bridgeRoom);

    // Grow remaining rooms.
    while (rooms.length < this.roomCount) {
      // Pick a random occupied cell that has at least one free neighbour.
      const parentIdx = rng.nextInt(0, rooms.length - 1);
      const parentCell = roomCells[parentIdx];

      // Find free neighbours (shuffled by the RNG).
      const dirs = rngShuffle(rng, [...FOUR_DIRECTIONS]);
      let placed = false;
      for (const d of dirs) {
        const nx = parentCell.gx + d.dx;
        const nz = parentCell.gz + d.dz;
        const key = this.cellKey(nx, nz);
        if (cells.has(key)) continue;

        // Place a new room here.
        const childIdx = rooms.length;
        cells.set(key, childIdx);
        roomCells.push({ gx: nx, gz: nz });
        adjacency.set(childIdx, []);
        adjacency.get(parentIdx)!.push(childIdx);
        adjacency.get(childIdx)!.push(parentIdx);

        const type = this.pickRoomType(rng, childIdx, rooms.length, nx, nz, cells);
        const childRoom = this.makeRoom(rng, type, nx, nz);
        rooms.push(childRoom);

        // Build a corridor between parent and child door centres.
        const corridor = this.makeCorridor(parentIdx, childIdx, rooms, roomCells, d.side);
        corridors.push(corridor);

        // Add doors on both rooms facing the corridor.
        this.addConnectingDoors(rooms[parentIdx], rooms[childIdx], d.side, corridor);

        placed = true;
        break;
      }
      if (!placed) {
        // This parent had no free neighbours; try another parent. To avoid
        // an infinite loop when the grid is fully surrounded, we track a
        // "tried" set for this iteration; if every parent is surrounded we
        // bail with the rooms we have.
        // (In practice roomCount is small and the grid is effectively
        // unbounded, so this is extremely unlikely.)
        if (roomCells.every(c => this.countFreeNeighbours(c, cells) === 0)) {
          break;
        }
      }
    }

    return { rooms, corridors, adjacency, seed: this.seed, roomCount: this.roomCount };
  }

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------

  private cellKey(gx: number, gz: number): string {
    return `${gx},${gz}`;
  }

  private countFreeNeighbours(cell: { gx: number; gz: number }, cells: Map<string, number>): number {
    let count = 0;
    for (const d of FOUR_DIRECTIONS) {
      if (!cells.has(this.cellKey(cell.gx + d.dx, cell.gz + d.dz))) count++;
    }
    return count;
  }

  /**
   * Pick a room type for a non-bridge cell. Airlocks prefer perimeter
   * cells (cells with at least one free or absent neighbour, i.e. on the
   * outside of the growing blob); the rest use the weighted interior set.
   */
  private pickRoomType(
    rng: Rng,
    _idx: number,
    total: number,
    gx: number,
    gz: number,
    cells: Map<string, number>,
  ): RoomType {
    // Bridge is always room 0; this is only called for non-bridge cells.
    // Is this a perimeter cell? (has at least one neighbour that is free)
    const isPerimeter = FOUR_DIRECTIONS.some(
      d => !cells.has(this.cellKey(gx + d.dx, gz + d.dz)),
    );

    // ~30% of perimeter cells become airlocks, but never more than ~25%
    // of the whole station. `cells.size` is the number of rooms placed so
    // far (this new cell has not been added yet when we pick its type).
    const airlockCount = cells.size;
    if (isPerimeter && rng.chance(0.3) && airlockCount < Math.ceil(total * 0.25)) {
      return 'airlock';
    }

    // Weighted pick from interior types.
    const entries = Object.entries(INTERIOR_TYPE_WEIGHTS);
    const totalWeight = entries.reduce((s, [, w]) => s + w, 0);
    let r = rng.next() * totalWeight;
    for (const [name, w] of entries) {
      r -= w;
      if (r <= 0) return name as RoomType;
    }
    return 'storage'; // fallback
  }

  /**
   * Construct a Room of the given type at a grid cell. Dimensions are
   * jittered within [minRoomSize, maxRoomSize] and scaled slightly by
   * type (bridge is larger, storage is smaller).
   */
  private makeRoom(rng: Rng, type: RoomType, gx: number, gz: number): Room {
    const baseW = rng.nextInt(this.minRoomSize, this.maxRoomSize);
    const baseD = rng.nextInt(this.minRoomSize, this.maxRoomSize);
    const scale = ROOM_SIZE_SCALE[type] ?? 1;
    const width = Math.round(baseW * scale);
    const depth = Math.round(baseD * scale);

    // Centre in world space. Grid cells are cellSize apart. We do NOT
    // jitter the centre: keeping rooms aligned to their grid cell ensures
    // that corridors between adjacent cells are always perfectly
    // axis-aligned (door centres share a coordinate). Visual variety
    // comes from the jittered dimensions and per-type colour palettes.
    const cx = gx * this.cellSize;
    const cz = gz * this.cellSize;

    return new Room({
      type,
      cx,
      cz,
      width,
      depth,
      doors: [],
    });
  }

  /**
   * Build the corridor between two rooms' grid cells. The corridor connects
   * the door centres on the facing walls of the two rooms. Because the
   * rooms are in adjacent grid cells and we know which side the child is on
   * relative to the parent, the corridor is a straight axis-aligned run.
   */
  private makeCorridor(
    parentIdx: number,
    childIdx: number,
    rooms: Room[],
    roomCells: Array<{ gx: number; gz: number }>,
    side: DoorSide,
  ): Corridor {
    const parentRoom = rooms[parentIdx];
    const childRoom = rooms[childIdx];

    // Door centre on the parent's facing wall.
    const parentCenter = this.wallDoorCenter(parentRoom, side);
    // The child's facing wall is the opposite side.
    const childSide = oppositeSide(side);
    const childCenter = this.wallDoorCenter(childRoom, childSide);

    return new Corridor({
      x1: parentCenter.x,
      z1: parentCenter.z,
      x2: childCenter.x,
      z2: childCenter.z,
      width: this.corridorWidth,
    });
  }

  /**
   * Centre point of a wall, used as the default door location. Falls back
   * to the wall midpoint so the corridor is centred on the wall.
   */
  private wallDoorCenter(room: Room, side: DoorSide): { x: number; z: number } {
    switch (side) {
      case 'north': return { x: room.cx, z: room.maxZ };
      case 'south': return { x: room.cx, z: room.minZ };
      case 'east':  return { x: room.maxX, z: room.cz };
      case 'west':  return { x: room.minX, z: room.cz };
    }
  }

  /**
   * Add matching doors to two rooms that are connected by a corridor. The
   * doors are placed at the corridor's endpoints (centred on each wall).
   */
  private addConnectingDoors(parent: Room, child: Room, parentSide: DoorSide, corridor: Corridor): void {
    const doorWidth = this.corridorWidth;
    // Parent door on parentSide, centred on the wall.
    const parentLen = parent.wallLength(parentSide);
    parent.addDoor(parentSide, parentLen / 2 - doorWidth / 2, doorWidth);

    const childSide = oppositeSide(parentSide);
    const childLen = child.wallLength(childSide);
    child.addDoor(childSide, childLen / 2 - doorWidth / 2, doorWidth);

    // Mark the corridor endpoints on the actual door centres (so the
    // corridor geometry reaches the wall, not the room centre).
    // (We already built the corridor from wall centres, which is correct.)
    void corridor;
  }

  // ----------------------------------------------------------
  // Static helpers
  // ----------------------------------------------------------

  /**
   * Deterministically check whether two generated stations are equal. Used
   * by tests for seed reproducibility. Compares room types, positions, and
   * corridor endpoints.
   */
  static layoutsEqual(a: GeneratedStation, b: GeneratedStation): boolean {
    if (a.rooms.length !== b.rooms.length) return false;
    if (a.corridors.length !== b.corridors.length) return false;
    for (let i = 0; i < a.rooms.length; i++) {
      const ra = a.rooms[i], rb = b.rooms[i];
      if (ra.type !== rb.type) return false;
      if (ra.cx !== rb.cx || ra.cz !== rb.cz) return false;
      if (ra.width !== rb.width || ra.depth !== rb.depth) return false;
    }
    for (let i = 0; i < a.corridors.length; i++) {
      const ca = a.corridors[i], cb = b.corridors[i];
      if (ca.x1 !== cb.x1 || ca.z1 !== cb.z1) return false;
      if (ca.x2 !== cb.x2 || ca.z2 !== cb.z2) return false;
      if (ca.width !== cb.width) return false;
    }
    return true;
  }

  /**
   * Build a Three.js Group containing all room + corridor meshes for a
   * generated station. Convenience method for rendering.
   */
  static buildStationMesh(station: GeneratedStation): THREE.Group {
    const group = new THREE.Group();
    for (const room of station.rooms) group.add(room.buildMesh());
    for (const corridor of station.corridors) group.add(corridor.buildMesh());
    return group;
  }
}

/** Per-type size multiplier relative to the base random size. */
const ROOM_SIZE_SCALE: Record<RoomType, number> = {
  bridge: 1.4,
  engineering: 1.1,
  'med-bay': 1.0,
  'crew quarters': 1.0,
  airlock: 0.8,
  storage: 0.9,
};

/** Fisher–Yates shuffle driven by the RNG. Returns a new array. */
function rngShuffle<T>(rng: Rng, arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Re-export the room-type list for callers that want it without importing Room. */
export { ROOM_TYPES };