/**
 * StationGenerator tests — procedural station layout correctness.
 *
 * Verifies that:
 *  - generation produces the requested number of rooms (or bails gracefully)
 *  - all rooms are connected to the bridge (room 0) via corridors
 *  - the same seed produces identical layouts (reproducibility)
 *  - room types are all from the valid set, with the bridge first
 *  - corridors are axis-aligned and link the correct rooms
 *
 * These tests exercise only the pure logical layout (rooms, corridors,
 * adjacency). The Three.js mesh building is exercised in a smoke test
 * that constructs meshes but does not render them.
 *
 * Addresses issue #5 (Procedural Station Generation).
 */

import { describe, it, expect } from 'vitest';
import { StationGenerator, type GeneratedStation } from '../src/world/StationGenerator';
import { Room, ROOM_TYPES, type RoomType } from '../src/world/Room';
import { Corridor } from '../src/world/Corridor';

/** BFS from room 0; returns the set of visited room indices. */
function reachableFrom(start: number, adjacency: Map<number, number[]>): Set<number> {
  const visited = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of adjacency.get(cur) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return visited;
}

/** Collect every room type used in a generated station. */
function usedRoomTypes(station: GeneratedStation): Set<RoomType> {
  return new Set(station.rooms.map(r => r.type));
}

describe('StationGenerator — room count', () => {
  it('generates the requested number of rooms', () => {
    const gen = new StationGenerator({ seed: 42, roomCount: 8 });
    const station = gen.generate();
    expect(station.rooms.length).toBe(8);
  });

  it('generates exactly one room when roomCount = 1', () => {
    const gen = new StationGenerator({ seed: 1, roomCount: 1 });
    const station = gen.generate();
    expect(station.rooms.length).toBe(1);
    expect(station.corridors.length).toBe(0);
  });

  it('throws for roomCount < 1', () => {
    expect(() => new StationGenerator({ seed: 1, roomCount: 0 })).toThrow();
  });

  it('produces N-1 corridors for N rooms (tree layout)', () => {
    const gen = new StationGenerator({ seed: 7, roomCount: 10 });
    const station = gen.generate();
    // A connected tree of N nodes has exactly N-1 edges.
    expect(station.corridors.length).toBe(station.rooms.length - 1);
  });

  it('honours different room counts', () => {
    for (const n of [2, 5, 12, 20]) {
      const gen = new StationGenerator({ seed: 99, roomCount: n });
      const station = gen.generate();
      expect(station.rooms.length).toBe(n);
    }
  });
});

describe('StationGenerator — connectivity', () => {
  it('all rooms are reachable from the bridge (room 0)', () => {
    const gen = new StationGenerator({ seed: 42, roomCount: 12 });
    const station = gen.generate();
    const visited = reachableFrom(0, station.adjacency);
    expect(visited.size).toBe(station.rooms.length);
  });

  it('the adjacency map has an entry for every room', () => {
    const gen = new StationGenerator({ seed: 3, roomCount: 8 });
    const station = gen.generate();
    for (let i = 0; i < station.rooms.length; i++) {
      expect(station.adjacency.has(i)).toBe(true);
    }
  });

  it('adjacency is symmetric', () => {
    const gen = new StationGenerator({ seed: 5, roomCount: 10 });
    const station = gen.generate();
    for (const [a, neighbours] of station.adjacency) {
      for (const b of neighbours) {
        expect(station.adjacency.get(b)).toContain(a);
      }
    }
  });

  it('every corridor connects two adjacent rooms in the adjacency map', () => {
    const gen = new StationGenerator({ seed: 11, roomCount: 9 });
    const station = gen.generate();
    // The corridor endpoints should be at the wall centres of connected
    // rooms. We check each corridor's endpoints lie on the boundaries of
    // two rooms that are listed as adjacent.
    for (const corridor of station.corridors) {
      // Find rooms whose boundary contains the corridor endpoints.
      const aRooms = station.rooms.filter(
        r => r.minX - 0.01 <= corridor.x1 && corridor.x1 <= r.maxX + 0.01 &&
             r.minZ - 0.01 <= corridor.z1 && corridor.z1 <= r.maxZ + 0.01,
      );
      const bRooms = station.rooms.filter(
        r => r.minX - 0.01 <= corridor.x2 && corridor.x2 <= r.maxX + 0.01 &&
             r.minZ - 0.01 <= corridor.z2 && corridor.z2 <= r.maxZ + 0.01,
      );
      expect(aRooms.length).toBeGreaterThan(0);
      expect(bRooms.length).toBeGreaterThan(0);
      // There must be at least one adjacent pair across these endpoint sets.
      const aIdx = aRooms.map(r => station.rooms.indexOf(r));
      const bIdx = bRooms.map(r => station.rooms.indexOf(r));
      const connected = aIdx.some(ai => bIdx.some(bi => station.adjacency.get(ai)?.includes(bi)));
      expect(connected).toBe(true);
    }
  });
});

describe('StationGenerator — seed reproducibility', () => {
  it('the same seed produces identical layouts', () => {
    const gen1 = new StationGenerator({ seed: 1234, roomCount: 10 });
    const gen2 = new StationGenerator({ seed: 1234, roomCount: 10 });
    const s1 = gen1.generate();
    const s2 = gen2.generate();
    expect(StationGenerator.layoutsEqual(s1, s2)).toBe(true);
  });

  it('different seeds produce different layouts', () => {
    const s1 = new StationGenerator({ seed: 1, roomCount: 10 }).generate();
    const s2 = new StationGenerator({ seed: 2, roomCount: 10 }).generate();
    // Very unlikely two different seeds collide on a multi-room layout.
    expect(StationGenerator.layoutsEqual(s1, s2)).toBe(false);
  });

  it('reproducibility holds across multiple seeds', () => {
    for (const seed of [7, 99, 2024, 0xffffffff]) {
      const s1 = new StationGenerator({ seed, roomCount: 6 }).generate();
      const s2 = new StationGenerator({ seed, roomCount: 6 }).generate();
      expect(StationGenerator.layoutsEqual(s1, s2)).toBe(true);
    }
  });
});

describe('StationGenerator — room types', () => {
  it('the first room is always the bridge', () => {
    const gen = new StationGenerator({ seed: 42, roomCount: 8 });
    const station = gen.generate();
    expect(station.rooms[0].type).toBe('bridge');
  });

  it('all room types are from the valid set', () => {
    const gen = new StationGenerator({ seed: 100, roomCount: 20 });
    const station = gen.generate();
    for (const room of station.rooms) {
      expect(ROOM_TYPES).toContain(room.type);
    }
  });

  it('a large station uses multiple room types', () => {
    const gen = new StationGenerator({ seed: 777, roomCount: 25 });
    const station = gen.generate();
    const types = usedRoomTypes(station);
    // With 25 rooms we expect at least 3 distinct types.
    expect(types.size).toBeGreaterThanOrEqual(3);
  });

  it('a single-room station is just the bridge', () => {
    const gen = new StationGenerator({ seed: 1, roomCount: 1 });
    const station = gen.generate();
    expect(station.rooms[0].type).toBe('bridge');
    expect(usedRoomTypes(station).size).toBe(1);
  });
});

describe('StationGenerator — geometry invariants', () => {
  it('rooms have positive width and depth', () => {
    const station = new StationGenerator({ seed: 5, roomCount: 10 }).generate();
    for (const room of station.rooms) {
      expect(room.width).toBeGreaterThan(0);
      expect(room.depth).toBeGreaterThan(0);
    }
  });

  it('corridors are axis-aligned (horizontal or vertical)', () => {
    const station = new StationGenerator({ seed: 5, roomCount: 10 }).generate();
    for (const corridor of station.corridors) {
      expect(corridor.isHorizontal || corridor.isVertical).toBe(true);
    }
  });

  it('corridors have positive length', () => {
    const station = new StationGenerator({ seed: 5, roomCount: 10 }).generate();
    for (const corridor of station.corridors) {
      expect(corridor.length).toBeGreaterThan(0);
    }
  });

  it('every room except the bridge has at least one door', () => {
    const station = new StationGenerator({ seed: 9, roomCount: 12 }).generate();
    for (let i = 0; i < station.rooms.length; i++) {
      if (i === 0) continue; // bridge may or may not have doors
      expect(station.rooms[i].doors.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('connected rooms share doors on facing walls', () => {
    const station = new StationGenerator({ seed: 33, roomCount: 8 }).generate();
    // For every corridor, the two endpoint rooms should each have at least
    // one door. (We already check rooms; this is a cross-check.)
    for (const corridor of station.corridors) {
      // The corridor connects rooms whose boundary contains its endpoints.
      const a = station.rooms.find(
        r => r.minX - 0.01 <= corridor.x1 && corridor.x1 <= r.maxX + 0.01 &&
             r.minZ - 0.01 <= corridor.z1 && corridor.z1 <= r.maxZ + 0.01,
      );
      const b = station.rooms.find(
        r => r.minX - 0.01 <= corridor.x2 && corridor.x2 <= r.maxX + 0.01 &&
             r.minZ - 0.01 <= corridor.z2 && r.maxZ + 0.01,
      );
      expect(a?.doors.length ?? 0).toBeGreaterThan(0);
      expect(b?.doors.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('StationGenerator — mesh smoke test', () => {
  it('building all room meshes does not throw', () => {
    const station = new StationGenerator({ seed: 8, roomCount: 6 }).generate();
    expect(() => {
      for (const room of station.rooms) {
        const mesh = room.buildMesh();
        expect(mesh).toBeDefined();
        room.disposeMesh();
      }
    }).not.toThrow();
  });

  it('building all corridor meshes does not throw', () => {
    const station = new StationGenerator({ seed: 8, roomCount: 6 }).generate();
    expect(() => {
      for (const corridor of station.corridors) {
        const mesh = corridor.buildMesh();
        expect(mesh).toBeDefined();
        corridor.disposeMesh();
      }
    }).not.toThrow();
  });
});

describe('Room', () => {
  it('addDoor clamps offset and width to the wall', () => {
    const room = new Room({ type: 'bridge', cx: 0, cz: 0, width: 8, depth: 8 });
    const door = room.addDoor('north', -5, 2);
    expect(door.offset).toBe(0);
    const door2 = room.addDoor('south', 100, 2);
    expect(door2.offset).toBeLessThanOrEqual(8);
    expect(door2.offset + door2.width).toBeLessThanOrEqual(8);
  });

  it('doorCenter returns a point on the wall boundary', () => {
    const room = new Room({ type: 'bridge', cx: 0, cz: 0, width: 8, depth: 8 });
    const door = room.addDoor('north', 3, 2);
    const c = room.doorCenter(door);
    expect(c.z).toBeCloseTo(4, 5); // maxZ
  });
});

describe('Corridor', () => {
  it('horizontal corridor has isHorizontal true', () => {
    const c = new Corridor({ x1: 0, z1: 0, x2: 10, z2: 0 });
    expect(c.isHorizontal).toBe(true);
    expect(c.isVertical).toBe(false);
    expect(c.length).toBeCloseTo(10, 5);
  });

  it('vertical corridor has isVertical true', () => {
    const c = new Corridor({ x1: 0, z1: 0, x2: 0, z2: 7 });
    expect(c.isVertical).toBe(true);
    expect(c.length).toBeCloseTo(7, 5);
  });

  it('startSide and endSide are consistent', () => {
    const c = new Corridor({ x1: 0, z1: 0, x2: 10, z2: 0 });
    expect(c.startSide).toBe('east');
    expect(c.endSide).toBe('west');
  });
});