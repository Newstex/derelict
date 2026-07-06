/**
 * PropGenerator — procedural placement of environmental props.
 *
 * Addresses GitHub issue #8 (Environmental Props & Dressing).
 *
 * Overview
 * --------
 *  - A `Prop` is a single placed object in the world: a type id, a
 *    category, a world-space position, a rotation, and a scale.
 *  - `PropCategory` groups props into functional (interactable),
 *    decorative (visual only), and hazard (damaging/dangerous).
 *  - `PropGenerator` uses the seeded `Rng` to generate props within a
 *    rectangular region (typically a room's interior). Placement is
 *    collision-aware: props are kept a minimum distance apart and away
 *    from walls.
 *  - The generator is pure TypeScript (no Three.js), so it can be unit
 *    tested in isolation. A `buildMesh` helper is provided for rendering.
 *
 * Prop types are intentionally game-agnostic strings; the rendering and
 * gameplay layers interpret them. This keeps the generator reusable.
 */

import * as THREE from 'three';
import { Rng } from '../sim/rng.js';

// ============================================================
// Types
// ============================================================

/** Broad category of a prop, driving gameplay and rendering behaviour. */
export type PropCategory = 'functional' | 'decorative' | 'hazard';

/** Identifies a kind of prop. The set is extensible. */
export type PropType =
  | 'terminal'
  | 'crate'
  | 'med-kit'
  | 'oxygen-tank'
  | 'tool'
  | 'debris'
  | 'console'
  | 'screen'
  | 'bed'
  | 'machinery'
  | 'pipe'
  | 'chair'
  | 'table'
  | 'barrel'
  | 'wiring';

/** A single placed prop in the world. */
export interface Prop {
  /** Unique id within the generation run. */
  id: string;
  /** Kind of prop. */
  type: PropType;
  /** Broad category. */
  category: PropCategory;
  /** World-space X centre. */
  x: number;
  /** World-space Z centre. */
  z: number;
  /** Rotation around Y, in radians. */
  rotation: number;
  /** Uniform scale multiplier (default 1). */
  scale: number;
}

// ============================================================
// Prop type metadata
// ============================================================

/**
 * Metadata for each prop type: its category, default footprint radius
 * (used for collision-aware placement), and default scale range.
 */
export interface PropTypeMeta {
  category: PropCategory;
  /** Collision radius in world units. Props are kept at least this far apart. */
  radius: number;
  /** Min scale multiplier. */
  minScale: number;
  /** Max scale multiplier. */
  maxScale: number;
}

/** Built-in prop type definitions. Extensible by callers. */
export const PROP_TYPE_META: Record<PropType, PropTypeMeta> = {
  terminal:      { category: 'functional',  radius: 0.6, minScale: 0.9, maxScale: 1.1 },
  crate:         { category: 'functional',  radius: 0.5, minScale: 0.8, maxScale: 1.3 },
  'med-kit':     { category: 'functional',  radius: 0.3, minScale: 0.9, maxScale: 1.1 },
  'oxygen-tank': { category: 'functional',  radius: 0.4, minScale: 0.9, maxScale: 1.2 },
  tool:          { category: 'functional',  radius: 0.25, minScale: 0.8, maxScale: 1.2 },
  debris:        { category: 'decorative',  radius: 0.35, minScale: 0.5, maxScale: 1.5 },
  console:       { category: 'functional',  radius: 0.7, minScale: 0.9, maxScale: 1.1 },
  screen:        { category: 'decorative',  radius: 0.3, minScale: 0.9, maxScale: 1.1 },
  bed:           { category: 'decorative',  radius: 0.6, minScale: 0.9, maxScale: 1.1 },
  machinery:     { category: 'functional',  radius: 0.8, minScale: 0.9, maxScale: 1.2 },
  pipe:          { category: 'decorative',  radius: 0.2, minScale: 0.8, maxScale: 1.2 },
  chair:         { category: 'decorative',  radius: 0.3, minScale: 0.9, maxScale: 1.1 },
  table:         { category: 'decorative',  radius: 0.5, minScale: 0.9, maxScale: 1.1 },
  barrel:        { category: 'hazard',     radius: 0.4, minScale: 0.9, maxScale: 1.1 },
  wiring:        { category: 'hazard',     radius: 0.2, minScale: 0.8, maxScale: 1.2 },
};

// ============================================================
// Placement region
// ============================================================

/** An axis-aligned rectangular region for prop placement. */
export interface PlacementRegion {
  /** Centre X. */
  cx: number;
  /** Centre Z. */
  cz: number;
  /** Width along X (interior). */
  width: number;
  /** Depth along Z (interior). */
  depth: number;
  /** Margin to keep from the region's walls (default 0.8). */
  wallMargin?: number;
}

/** A rectangular exclusion zone where no props should be placed (e.g. a door). */
export interface ExclusionZone {
  /** Min X of the zone. */
  minX: number;
  /** Max X of the zone. */
  maxX: number;
  /** Min Z of the zone. */
  minZ: number;
  /** Max Z of the zone. */
  maxZ: number;
}

// ============================================================
// PropGenerator
// ============================================================

export interface PropGeneratorOptions {
  /** Seed for the RNG. */
  seed: number;
  /** Region to place props in. */
  region: PlacementRegion;
  /** Prop types to generate. */
  propTypes: PropType[];
  /** How many props to attempt to place. */
  count: number;
  /** Min distance between prop centres (default 1.0). */
  minSpacing?: number;
  /** Exclusion zones to avoid (doorways, etc.). */
  exclusions?: ExclusionZone[];
  /** Max placement attempts before giving up on a prop (default 30). */
  maxAttempts?: number;
}

/**
 * Procedural prop placement with collision-aware positioning.
 *
 * The generator attempts to place `count` props of the specified types
 * within the region. Each prop's position is checked against:
 *  - the region walls (minus `wallMargin`)
 *  - exclusion zones
 *  - previously placed props (at least `minSpacing` apart, plus the
 *    prop's collision radius)
 *
 * If a prop cannot be placed within `maxAttempts` tries, it is skipped.
 * The `placed` array contains only successfully placed props, so its
 * length may be less than `count`.
 */
export class PropGenerator {
  readonly seed: number;
  readonly region: PlacementRegion;
  readonly propTypes: PropType[];
  readonly count: number;
  readonly minSpacing: number;
  readonly exclusions: ExclusionZone[];
  readonly maxAttempts: number;

  /** Successfully placed props (populated by `generate()`). */
  readonly placed: Prop[] = [];

  constructor(opts: PropGeneratorOptions) {
    this.seed = opts.seed >>> 0;
    this.region = opts.region;
    this.propTypes = opts.propTypes;
    this.count = Math.max(0, opts.count);
    this.minSpacing = opts.minSpacing ?? 1.0;
    this.exclusions = opts.exclusions ?? [];
    this.maxAttempts = opts.maxAttempts ?? 30;
  }

  /**
   * Generate props. Populates `this.placed` and returns it.
   *
   * Deterministic: the same seed + options always produce the same props.
   */
  generate(): Prop[] {
    const rng = new Rng(this.seed);
    this.placed.length = 0;

    const wallMargin = this.region.wallMargin ?? 0.8;
    const minX = this.region.cx - this.region.width / 2 + wallMargin;
    const maxX = this.region.cx + this.region.width / 2 - wallMargin;
    const minZ = this.region.cz - this.region.depth / 2 + wallMargin;
    const maxZ = this.region.cz + this.region.depth / 2 - wallMargin;

    for (let i = 0; i < this.count; i++) {
      const type = this.propTypes.length > 0
        ? rng.pick(this.propTypes)
        : 'debris';
      const meta = PROP_TYPE_META[type] ?? PROP_TYPE_META.debris;

      let placed = false;
      for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
        const x = rng.range(minX, maxX);
        const z = rng.range(minZ, maxZ);

        if (!this.isPositionValid(x, z, meta.radius)) continue;

        const rotation = rng.range(0, Math.PI * 2);
        const scale = rng.range(meta.minScale, meta.maxScale);

        this.placed.push({
          id: `prop_${i}_${rng.nextInt(0, 0xffff).toString(36)}`,
          type,
          category: meta.category,
          x,
          z,
          rotation,
          scale,
        });
        placed = true;
        break;
      }
      // If we couldn't place after maxAttempts, skip this prop.
    }

    return this.placed;
  }

  /**
   * Check whether a position is valid: inside bounds, not in an
   * exclusion zone, and far enough from existing props.
   */
  private isPositionValid(x: number, z: number, radius: number): boolean {
    // Check exclusion zones
    for (const zone of this.exclusions) {
      if (x >= zone.minX - radius && x <= zone.maxX + radius &&
          z >= zone.minZ - radius && z <= zone.maxZ + radius) {
        return false;
      }
    }

    // Check distance to existing props
    for (const prop of this.placed) {
      const propMeta = PROP_TYPE_META[prop.type];
      const minDist = this.minSpacing + radius + (propMeta?.radius ?? 0.5);
      const dx = x - prop.x;
      const dz = z - prop.z;
      if (dx * dx + dz * dz < minDist * minDist) {
        return false;
      }
    }

    return true;
  }

  // ----------------------------------------------------------
  // Rendering helper
  // ----------------------------------------------------------

  /**
   * Build a Three.js Group containing simple placeholder meshes for
   * each prop. Each prop type gets a distinct colour. This is a
   * convenience for visualisation; the gameplay/rendering layer may
   * replace these with proper models.
   */
  buildMesh(): THREE.Group {
    const group = new THREE.Group();
    const colorPalette: Record<PropType, number> = {
      terminal: 0x00aaff,
      crate: 0x8a6a3a,
      'med-kit': 0xff4444,
      'oxygen-tank': 0x44ff88,
      tool: 0xffaa00,
      debris: 0x555555,
      console: 0x3388cc,
      screen: 0x1166ff,
      bed: 0xdddddd,
      machinery: 0x886622,
      pipe: 0x666688,
      chair: 0x444466,
      table: 0x665544,
      barrel: 0x884400,
      wiring: 0xff6600,
    };

    for (const prop of this.placed) {
      const meta = PROP_TYPE_META[prop.type] ?? PROP_TYPE_META.debris;
      const size = meta.radius * 2 * prop.scale;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshStandardMaterial({
        color: colorPalette[prop.type] ?? 0x888888,
        roughness: 0.6,
        metalness: 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(prop.x, size / 2, prop.z);
      mesh.rotation.y = prop.rotation;
      group.add(mesh);
    }

    return group;
  }

  /**
   * Dispose all mesh geometries/materials in the group built by
   * `buildMesh()`. Call this when the props are removed from the scene.
   */
  static disposeMesh(group: THREE.Group): void {
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else if (m) m.dispose();
    });
  }

  // ----------------------------------------------------------
  // Static helpers
  // ----------------------------------------------------------

  /**
   * Generate exclusion zones for a room's doors. Each door becomes a
   * small rectangle just inside the room so props don't block doorways.
   */
  static doorExclusions(
    room: {
      doors: Array<{ side: string; offset: number; width: number }>;
      cx: number; cz: number; width: number; depth: number;
      minX: number; maxX: number; minZ: number; maxZ: number;
    },
    depth = 1.5,
  ): ExclusionZone[] {
    const zones: ExclusionZone[] = [];
    for (const door of room.doors) {
      const halfW = door.width / 2;
      switch (door.side) {
        case 'north': {
          const cx = room.minX + door.offset + halfW;
          zones.push({
            minX: cx - halfW - 0.3,
            maxX: cx + halfW + 0.3,
            minZ: room.maxZ - depth,
            maxZ: room.maxZ + 0.3,
          });
          break;
        }
        case 'south': {
          const cx = room.minX + door.offset + halfW;
          zones.push({
            minX: cx - halfW - 0.3,
            maxX: cx + halfW + 0.3,
            minZ: room.minZ - 0.3,
            maxZ: room.minZ + depth,
          });
          break;
        }
        case 'east': {
          const cz = room.minZ + door.offset + halfW;
          zones.push({
            minX: room.maxX - depth,
            maxX: room.maxX + 0.3,
            minZ: cz - halfW - 0.3,
            maxZ: cz + halfW + 0.3,
          });
          break;
        }
        case 'west': {
          const cz = room.minZ + door.offset + halfW;
          zones.push({
            minX: room.minX - 0.3,
            maxX: room.minX + depth,
            minZ: cz - halfW - 0.3,
            maxZ: cz + halfW + 0.3,
          });
          break;
        }
      }
    }
    return zones;
  }

  /**
   * Filter placed props by category.
   */
  static filterByCategory(props: Prop[], category: PropCategory): Prop[] {
    return props.filter((p) => p.category === category);
  }

  /**
   * Filter placed props by type.
   */
  static filterByType(props: Prop[], type: PropType): Prop[] {
    return props.filter((p) => p.type === type);
  }
}