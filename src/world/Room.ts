/**
 * Room — a single room in a procedurally generated station.
 *
 * A room occupies an axis-aligned rectangle on the XZ plane, with a
 * configurable floor, four walls, and one or more doors that open onto
 * corridors. Each room is assigned one of a fixed set of RoomTypes which
 * influences its colour palette and (eventually) its contents.
 *
 * The Room class is Three.js-aware: `buildMesh()` constructs a Group of
 * floor + wall meshes that can be added to a scene. The logical room
 * data (type, position, dimensions, doors) is plain data that can be
 * inspected without a WebGL context, which keeps unit tests fast.
 *
 * Addresses issue #5 (Procedural Station Generation).
 */

import * as THREE from 'three';

/** The six canonical room types used in a DERELICT station. */
export type RoomType =
  | 'bridge'
  | 'engineering'
  | 'med-bay'
  | 'crew quarters'
  | 'airlock'
  | 'storage';

/** All valid room types, in priority order (rare/important first). */
export const ROOM_TYPES: readonly RoomType[] = [
  'bridge',
  'engineering',
  'med-bay',
  'crew quarters',
  'airlock',
  'storage',
] as const;

/** Side of a room rectangle a door sits on. */
export type DoorSide = 'north' | 'south' | 'east' | 'west';

/** A door opening in a wall, described as a side + offset along that wall. */
export interface DoorPosition {
  /** Which wall the door is on. */
  side: DoorSide;
  /**
   * Offset (in world units) along the wall from the wall's lower
   * coordinate. For north/south walls this is an X offset; for
   * east/west walls this is a Z offset. Must be within [0, wallLength].
   */
  offset: number;
  /** Door opening width in world units. */
  width: number;
}

/**
 * Colour palette per room type. Used for floor + wall tints so a player
 * can visually distinguish rooms at a glance.
 */
export const ROOM_COLORS: Record<RoomType, { floor: number; walls: number; accent: number }> = {
  bridge:        { floor: 0x203040, walls: 0x334455, accent: 0x00aaff },
  engineering:   { floor: 0x2a2218, walls: 0x443322, accent: 0xffaa00 },
  'med-bay':     { floor: 0x1a2a28, walls: 0x224444, accent: 0x44ffaa },
  'crew quarters': { floor: 0x222a3a, walls: 0x334466, accent: 0x88aaff },
  airlock:       { floor: 0x2a1a1a, walls: 0x443333, accent: 0xff4444 },
  storage:       { floor: 0x1a1a1a, walls: 0x2a2a2a, accent: 0x888888 },
};

export interface RoomOptions {
  type: RoomType;
  /** Centre X coordinate on the XZ plane. */
  cx: number;
  /** Centre Z coordinate on the XZ plane. */
  cz: number;
  /** Room width along X (interior dimension). */
  width: number;
  /** Room depth along Z (interior dimension). */
  depth: number;
  /** Wall height in world units. */
  wallHeight?: number;
  /** Wall thickness in world units. */
  wallThickness?: number;
  /** Doors in this room's walls. */
  doors?: DoorPosition[];
}

export class Room {
  readonly type: RoomType;
  /** Centre X. */
  readonly cx: number;
  /** Centre Z. */
  readonly cz: number;
  /** Interior width (along X). */
  readonly width: number;
  /** Interior depth (along Z). */
  readonly depth: number;
  readonly wallHeight: number;
  readonly wallThickness: number;
  readonly doors: DoorPosition[];

  /** Cached Three.js group (built on first call to buildMesh). */
  private _mesh: THREE.Group | null = null;

  constructor(opts: RoomOptions) {
    this.type = opts.type;
    this.cx = opts.cx;
    this.cz = opts.cz;
    this.width = opts.width;
    this.depth = opts.depth;
    this.wallHeight = opts.wallHeight ?? 3;
    this.wallThickness = opts.wallThickness ?? 0.2;
    this.doors = opts.doors ? opts.doors.slice() : [];
  }

  /** Left (min X), right (max X), front (min Z), back (max Z) edges. */
  get minX(): number { return this.cx - this.width / 2; }
  get maxX(): number { return this.cx + this.width / 2; }
  get minZ(): number { return this.cz - this.depth / 2; }
  get maxZ(): number { return this.cz + this.depth / 2; }

  /**
   * Add a door to the specified wall side. The offset is clamped to keep
   * the door opening within the wall, and the width is clamped to the
   * wall length.
   */
  addDoor(side: DoorSide, offset: number, width: number): DoorPosition {
    const len = this.wallLength(side);
    const w = Math.min(width, len);
    const o = Math.max(0, Math.min(offset, len - w));
    const door: DoorPosition = { side, offset: o, width: w };
    this.doors.push(door);
    return door;
  }

  /** Length of the wall on the given side (interior). */
  wallLength(side: DoorSide): number {
    return (side === 'north' || side === 'south') ? this.width : this.depth;
  }

  /** World position (x, z) of the centre of a door opening. */
  doorCenter(door: DoorPosition): { x: number; z: number } {
    const start = this.doorStart(door.side);
    const along = door.offset + door.width / 2;
    return { x: start.x + along * this.doorTangent(door.side).x,
             z: start.z + along * this.doorTangent(door.side).z };
  }

  /** Starting point (lower coordinate) of a wall. */
  private doorStart(side: DoorSide): { x: number; z: number } {
    switch (side) {
      case 'north': return { x: this.minX, z: this.maxZ };
      case 'south': return { x: this.minX, z: this.minZ };
      case 'east':  return { x: this.maxX, z: this.minZ };
      case 'west':  return { x: this.minX, z: this.minZ };
    }
  }

  /** Unit vector along the wall (in the increasing-coordinate direction). */
  private doorTangent(side: DoorSide): { x: number; z: number } {
    switch (side) {
      case 'north': return { x: 1, z: 0 };
      case 'south': return { x: 1, z: 0 };
      case 'east':  return { x: 0, z: 1 };
      case 'west':  return { x: 0, z: 1 };
    }
  }

  /** Outward-facing normal for a wall side. */
  doorNormal(side: DoorSide): { x: number; z: number } {
    switch (side) {
      case 'north': return { x: 0, z: 1 };
      case 'south': return { x: 0, z: -1 };
      case 'east':  return { x: 1, z: 0 };
      case 'west':  return { x: -1, z: 0 };
    }
  }

  /**
   * Build the Three.js mesh group for this room: a floor plane plus four
   * walls with door openings carved out as wall segments. The group is
   * cached and returned on subsequent calls. Meshes are positioned in
   * world space so the group origin is (0,0,0).
   */
  buildMesh(): THREE.Group {
    if (this._mesh) return this._mesh;

    const group = new THREE.Group();
    const colors = ROOM_COLORS[this.type];

    // --- Floor ---
    const floorGeo = new THREE.PlaneGeometry(this.width, this.depth);
    const floorMat = new THREE.MeshStandardMaterial({
      color: colors.floor,
      roughness: 0.85,
      metalness: 0.25,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(this.cx, 0, this.cz);
    group.add(floor);

    // --- Walls (with door gaps) ---
    const wallMat = new THREE.MeshStandardMaterial({
      color: colors.walls,
      roughness: 0.7,
      metalness: 0.3,
    });
    this.buildWall(group, 'north', wallMat);
    this.buildWall(group, 'south', wallMat);
    this.buildWall(group, 'east', wallMat);
    this.buildWall(group, 'west', wallMat);

    // --- Accent strip (thin emissive line near the floor, room-type colour) ---
    const accentMat = new THREE.MeshStandardMaterial({
      color: colors.accent,
      emissive: colors.accent,
      emissiveIntensity: 0.6,
    });
    const accentGeo = new THREE.BoxGeometry(this.width, 0.08, 0.04);
    const accent = new THREE.Mesh(accentGeo, accentMat);
    accent.position.set(this.cx, 0.15, this.minZ + 0.06);
    group.add(accent);

    this._mesh = group;
    return group;
  }

  /**
   * Build the wall segments for one side, leaving gaps for any doors on
   * that side. A wall with no doors is a single full-length box.
   */
  private buildWall(group: THREE.Group, side: DoorSide, mat: THREE.Material): void {
    const length = this.wallLength(side);
    const t = this.wallThickness;
    const h = this.wallHeight;
    const y = h / 2;

    // Door openings on this side, sorted by offset
    const doors = this.doors.filter(d => d.side === side).sort((a, b) => a.offset - b.offset);

    let cursor = 0; // position along the wall (in world units)
    for (const door of doors) {
      const segLen = door.offset - cursor;
      if (segLen > 0) this.addWallSegment(group, side, cursor, segLen, length, t, h, y, mat);
      cursor = door.offset + door.width;
    }
    // Final segment after the last door (or the whole wall if no doors)
    const segLen = length - cursor;
    if (segLen > 0) this.addWallSegment(group, side, cursor, segLen, length, t, h, y, mat);
  }

  /**
   * Add one wall segment as a box mesh. The segment starts at `along`
   * (units from the wall's lower coordinate) and extends `segLen` units.
   */
  private addWallSegment(
    group: THREE.Group,
    side: DoorSide,
    along: number,
    segLen: number,
    _fullLen: number,
    t: number,
    h: number,
    y: number,
    mat: THREE.Material,
  ): void {
    // Centre of this segment along the wall
    const start = this.doorStart(side);
    const tangent = this.doorTangent(side);
    const centerAlong = along + segLen / 2;
    const cx = start.x + centerAlong * tangent.x;
    const cz = start.z + centerAlong * tangent.z;

    // Outward offset so the wall's inner face sits on the room boundary
    const normal = this.doorNormal(side);
    const ox = cx + normal.x * (t / 2);
    const oz = cz + normal.z * (t / 2);

    // Geometry: a thin box. North/south walls run along X (depth = t), east/west along Z.
    const geo =
      side === 'north' || side === 'south'
        ? new THREE.BoxGeometry(segLen, h, t)
        : new THREE.BoxGeometry(t, h, segLen);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(ox, y, oz);
    group.add(mesh);
  }

  /** Dispose any GPU resources held by this room's mesh. */
  disposeMesh(): void {
    if (!this._mesh) return;
    this._mesh.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach(mm => mm.dispose());
      else if (m) m.dispose();
    });
    this._mesh = null;
  }
}