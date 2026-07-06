/**
 * StationDressing — adds props and decoration to a generated station.
 *
 * Addresses GitHub issue #8 (Environmental Props & Dressing).
 *
 * Overview
 * --------
 *  - Takes a `GeneratedStation` and populates each room with props
 *    appropriate to the room type:
 *      bridge       → consoles, screens, terminals, chairs
 *      med-bay      → beds, med-kits, screens
 *      engineering  → machinery, tools, pipes, barrels
 *      crew quarters→ beds, chairs, tables
 *      airlock      → oxygen-tanks, crates
 *      storage      → crates, barrels, debris
 *  - Uses `PropGenerator` for collision-aware, seedable placement.
 *  - Uses `ContentGenerator` to attach lore snippets and story hooks
 *    to rooms, adding narrative flavour alongside visual dressing.
 *  - The result is a `DressedStation` containing the original station
 *    plus all generated props and story elements.
 *
 * Pure TypeScript + Three.js (mesh building is optional and lazy).
 */

import * as THREE from 'three';
import type { GeneratedStation } from './StationGenerator.js';
import type { Room, RoomType } from './Room.js';
import {
  PropGenerator,
  type Prop,
  type PropType,
  type ExclusionZone,
} from './PropGenerator.js';
import { ContentGenerator, type StoryHook, type LoreSnippet } from '../systems/ContentGenerator.js';

// ============================================================
// Room-type prop recipes
// ============================================================

/**
 * Prop recipe for a room type: which prop types to place and a density
 * factor that determines how many props per unit of room area.
 */
interface RoomRecipe {
  /** Prop types to place in this room type. */
  propTypes: PropType[];
  /**
   * Density: props per square world-unit of room area. E.g. 0.02 means
   * roughly 1 prop per 50 sq units. The actual count is rounded and
   * clamped to [minCount, maxCount].
   */
  density: number;
  /** Minimum props per room. */
  minCount: number;
  /** Maximum props per room. */
  maxCount: number;
}

/** Per-room-type prop recipes. */
const ROOM_RECIPES: Record<RoomType, RoomRecipe> = {
  bridge: {
    propTypes: ['console', 'screen', 'terminal', 'chair'],
    density: 0.03,
    minCount: 3,
    maxCount: 8,
  },
  engineering: {
    propTypes: ['machinery', 'tool', 'pipe', 'barrel', 'wiring'],
    density: 0.04,
    minCount: 3,
    maxCount: 10,
  },
  'med-bay': {
    propTypes: ['bed', 'med-kit', 'screen'],
    density: 0.025,
    minCount: 2,
    maxCount: 6,
  },
  'crew quarters': {
    propTypes: ['bed', 'chair', 'table', 'screen'],
    density: 0.03,
    minCount: 2,
    maxCount: 7,
  },
  airlock: {
    propTypes: ['oxygen-tank', 'crate'],
    density: 0.02,
    minCount: 1,
    maxCount: 4,
  },
  storage: {
    propTypes: ['crate', 'barrel', 'debris'],
    density: 0.05,
    minCount: 2,
    maxCount: 12,
  },
};

// ============================================================
// DressedStation result
// ============================================================

/** Props placed in a specific room, indexed by room array index. */
export interface RoomDressing {
  /** Index into `GeneratedStation.rooms`. */
  roomIndex: number;
  /** The room type. */
  roomType: RoomType;
  /** Props placed in this room. */
  props: Prop[];
  /** Story hook for this room (may be null for plain rooms). */
  storyHook: StoryHook | null;
  /** Lore snippet for this room. */
  lore: LoreSnippet;
}

/** A station with all props and narrative dressing applied. */
export interface DressedStation {
  /** The original generated station. */
  station: GeneratedStation;
  /** Per-room dressing. */
  roomDressing: RoomDressing[];
  /** All props across all rooms, flattened. */
  allProps: Prop[];
  /** The seed used for dressing. */
  seed: number;
}

// ============================================================
// StationDressing
// ============================================================

export interface StationDressingOptions {
  /** Seed for prop and content generation. */
  seed: number;
  /** The station to dress. */
  station: GeneratedStation;
  /** Whether to include story hooks on rooms (default true). */
  includeStoryHooks?: boolean;
  /** Whether to include lore snippets (default true). */
  includeLore?: boolean;
  /** Global density multiplier (default 1.0). */
  densityMultiplier?: number;
}

/**
 * Takes a generated station and adds props/decoration to each room
 * based on room type. Also attaches narrative content (story hooks
 * and lore snippets) via ContentGenerator.
 *
 * The dressing is deterministic for a given seed + station.
 */
export class StationDressing {
  readonly seed: number;
  readonly station: GeneratedStation;
  readonly includeStoryHooks: boolean;
  readonly includeLore: boolean;
  readonly densityMultiplier: number;

  /** The dressed station result, populated by `dress()`. */
  result: DressedStation | null = null;

  constructor(opts: StationDressingOptions) {
    this.seed = opts.seed >>> 0;
    this.station = opts.station;
    this.includeStoryHooks = opts.includeStoryHooks ?? true;
    this.includeLore = opts.includeLore ?? true;
    this.densityMultiplier = opts.densityMultiplier ?? 1.0;
  }

  /**
   * Dress the station. Populates `this.result` and returns it.
   */
  dress(): DressedStation {
    const allProps: Prop[] = [];
    const roomDressing: RoomDressing[] = [];

    // Use separate derived RNG streams for props vs content so they
    // don't interfere with each other's determinism.
    const propRngSeed = this.seed;
    const contentRngSeed = (this.seed ^ 0x5a5a5a5a) >>> 0;
    const content = new ContentGenerator(contentRngSeed);

    for (let i = 0; i < this.station.rooms.length; i++) {
      const room = this.station.rooms[i];
      const recipe = ROOM_RECIPES[room.type];

      // Calculate prop count from room area and density.
      const area = room.width * room.depth;
      const rawCount = Math.round(area * recipe.density * this.densityMultiplier);
      const count = Math.max(recipe.minCount, Math.min(recipe.maxCount, rawCount));

      // Build exclusion zones for doorways.
      const exclusions = PropGenerator.doorExclusions(room);

      // Each room gets its own derived RNG seed so rooms are
      // independently deterministic.
      const roomSeed = (this.seed + i * 7919) >>> 0; // 7919 is prime

      const propGen = new PropGenerator({
        seed: roomSeed,
        region: {
          cx: room.cx,
          cz: room.cz,
          width: room.width,
          depth: room.depth,
        },
        propTypes: recipe.propTypes,
        count,
        exclusions,
      });

      const props = propGen.generate();
      allProps.push(...props);

      // Generate narrative content for this room.
      const storyHook = this.includeStoryHooks && this.rngChance(propRngSeed + i, 0.4)
        ? content.generateStoryHook()
        : null;

      const lore = this.includeLore
        ? content.generateLoreForRoom(room.type)
        : { category: 'history' as const, text: '' };

      roomDressing.push({
        roomIndex: i,
        roomType: room.type,
        props,
        storyHook,
        lore,
      });
    }

    this.result = {
      station: this.station,
      roomDressing,
      allProps,
      seed: this.seed,
    };
    return this.result;
  }

  /**
   * Simple seeded chance check used during dressing. This avoids
   * advancing the content generator's RNG stream for prop-vs-story
   * decisions, keeping prop generation fully deterministic.
   */
  private rngChance(seed: number, p: number): boolean {
    const r = new (class extends Rng {})(seed);
    return r.next() < p;
  }

  // ----------------------------------------------------------
  // Mesh building
  // ----------------------------------------------------------

  /**
   * Build a Three.js Group containing all prop meshes for the dressed
   * station. Each room's props are grouped under a sub-group.
   */
  buildPropMesh(): THREE.Group {
    if (!this.result) {
      throw new Error('StationDressing: call dress() before buildPropMesh()');
    }
    const group = new THREE.Group();
    for (const rd of this.result.roomDressing) {
      if (rd.props.length === 0) continue;
      const room = this.result.station.rooms[rd.roomIndex];
      const subGroup = new THREE.Group();
      const propGen = new PropGenerator({
        seed: 0, // seed doesn't matter; we use buildMesh on already-placed props
        region: { cx: room.cx, cz: room.cz, width: room.width, depth: room.depth },
        propTypes: [],
        count: 0,
      });
      // Re-populate placed props so buildMesh works.
      propGen.placed.push(...rd.props);
      const mesh = propGen.buildMesh();
      subGroup.add(mesh);
      group.add(subGroup);
    }
    return group;
  }

  // ----------------------------------------------------------
  // Static helpers
  // ----------------------------------------------------------

  /**
   * Get the prop recipe for a room type.
   */
  static getRecipe(roomType: RoomType): RoomRecipe {
    return ROOM_RECIPES[roomType];
  }

  /**
   * Count props by type across a dressed station.
   */
  static countByType(dressed: DressedStation): Map<PropType, number> {
    const counts = new Map<PropType, number>();
    for (const prop of dressed.allProps) {
      counts.set(prop.type, (counts.get(prop.type) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * Count props by category across a dressed station.
   */
  static countByCategory(dressed: DressedStation): Record<string, number> {
    const counts: Record<string, number> = { functional: 0, decorative: 0, hazard: 0 };
    for (const prop of dressed.allProps) {
      counts[prop.category] = (counts[prop.category] ?? 0) + 1;
    }
    return counts;
  }

  /**
   * Get rooms that have story hooks attached.
   */
  static roomsWithStoryHooks(dressed: DressedStation): RoomDressing[] {
    return dressed.roomDressing.filter((rd) => rd.storyHook !== null);
  }
}

// Re-export Rng for the internal use above.
import { Rng } from '../sim/rng.js';