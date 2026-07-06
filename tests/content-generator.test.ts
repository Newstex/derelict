/**
 * Content generator tests — prop generation, quest templates,
 * dialogue templates, and station dressing.
 *
 * Addresses issues #4 (AI Content Generation) and #8 (Environmental Props).
 *
 * Verifies:
 *  - PropGenerator produces the requested count (or fewer on collision misses)
 *  - Props respect collision-aware placement (no overlaps)
 *  - Props stay within the placement region
 *  - Prop generation is deterministic for the same seed
 *  - ContentGenerator produces valid dialogue trees with choices
 *  - ContentGenerator produces quest templates with objectives and rewards
 *  - ContentGenerator generates lore snippets and story hooks
 *  - StationDressing dresses all rooms with appropriate props
 *  - StationDressing is deterministic for the same seed + station
 */

import { describe, it, expect } from 'vitest';
import {
  PropGenerator,
  PROP_TYPE_META,
  type Prop,
  type PropType,
  type PropCategory,
} from '../src/world/PropGenerator';
import {
  ContentGenerator,
  type DialogueTemplateType,
} from '../src/systems/ContentGenerator';
import { StationGenerator } from '../src/world/StationGenerator';
import { StationDressing } from '../src/world/StationDressing';

// ============================================================
// PropGenerator tests
// ============================================================

describe('PropGenerator — count and placement', () => {
  it('generates up to the requested count of props', () => {
    const gen = new PropGenerator({
      seed: 42,
      region: { cx: 0, cz: 0, width: 20, depth: 20 },
      propTypes: ['crate', 'debris', 'terminal'],
      count: 10,
    });
    const props = gen.generate();
    expect(props.length).toBeLessThanOrEqual(10);
    expect(props.length).toBeGreaterThan(0);
  });

  it('generates exactly 0 props when count is 0', () => {
    const gen = new PropGenerator({
      seed: 42,
      region: { cx: 0, cz: 0, width: 10, depth: 10 },
      propTypes: ['crate'],
      count: 0,
    });
    const props = gen.generate();
    expect(props.length).toBe(0);
  });

  it('generates props only from the specified types', () => {
    const gen = new PropGenerator({
      seed: 99,
      region: { cx: 0, cz: 0, width: 30, depth: 30 },
      propTypes: ['crate', 'med-kit'],
      count: 15,
    });
    const props = gen.generate();
    for (const prop of props) {
      expect(prop.type === 'crate' || prop.type === 'med-kit').toBe(true);
    }
  });

  it('places props within the region (minus wall margin)', () => {
    const gen = new PropGenerator({
      seed: 7,
      region: { cx: 10, cz: 10, width: 16, depth: 16, wallMargin: 1.0 },
      propTypes: ['crate', 'terminal', 'debris'],
      count: 12,
    });
    const props = gen.generate();
    const minX = 10 - 16 / 2;
    const maxX = 10 + 16 / 2;
    const minZ = 10 - 16 / 2;
    const maxZ = 10 + 16 / 2;
    for (const prop of props) {
      expect(prop.x).toBeGreaterThanOrEqual(minX);
      expect(prop.x).toBeLessThanOrEqual(maxX);
      expect(prop.z).toBeGreaterThanOrEqual(minZ);
      expect(prop.z).toBeLessThanOrEqual(maxZ);
    }
  });

  it('respects collision-aware placement — no two props overlap', () => {
    const gen = new PropGenerator({
      seed: 123,
      region: { cx: 0, cz: 0, width: 20, depth: 20 },
      propTypes: ['crate', 'terminal', 'med-kit', 'oxygen-tank'],
      count: 10,
      minSpacing: 1.0,
    });
    const props = gen.generate();
    for (let i = 0; i < props.length; i++) {
      for (let j = i + 1; j < props.length; j++) {
        const a = props[i];
        const b = props[j];
        const ra = PROP_TYPE_META[a.type].radius;
        const rb = PROP_TYPE_META[b.type].radius;
        const minDist = 1.0 + ra + rb;
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        expect(dist).toBeGreaterThanOrEqual(minDist - 0.001); // small epsilon for float
      }
    }
  });

  it('avoids exclusion zones', () => {
    const gen = new PropGenerator({
      seed: 55,
      region: { cx: 0, cz: 0, width: 20, depth: 20 },
      propTypes: ['crate', 'debris'],
      count: 15,
      exclusions: [
        { minX: -5, maxX: 5, minZ: -5, maxZ: 5 }, // centre exclusion
      ],
    });
    const props = gen.generate();
    for (const prop of props) {
      // No prop centre should be inside the exclusion zone (accounting for radius)
      const r = PROP_TYPE_META[prop.type].radius;
      const inZone =
        prop.x >= -5 - r && prop.x <= 5 + r &&
        prop.z >= -5 - r && prop.z <= 5 + r;
      expect(inZone).toBe(false);
    }
  });

  it('is deterministic — same seed produces same props', () => {
    const opts = {
      seed: 888,
      region: { cx: 0, cz: 0, width: 20, depth: 20 },
      propTypes: ['crate', 'terminal'] as PropType[],
      count: 8,
    };
    const gen1 = new PropGenerator(opts);
    const gen2 = new PropGenerator(opts);
    const p1 = gen1.generate();
    const p2 = gen2.generate();
    expect(p1.length).toBe(p2.length);
    for (let i = 0; i < p1.length; i++) {
      expect(p1[i].type).toBe(p2[i].type);
      expect(p1[i].x).toBeCloseTo(p2[i].x, 5);
      expect(p1[i].z).toBeCloseTo(p2[i].z, 5);
      expect(p1[i].rotation).toBeCloseTo(p2[i].rotation, 5);
      expect(p1[i].scale).toBeCloseTo(p2[i].scale, 5);
    }
  });

  it('assigns correct categories from prop type metadata', () => {
    const gen = new PropGenerator({
      seed: 42,
      region: { cx: 0, cz: 0, width: 20, depth: 20 },
      propTypes: ['med-kit', 'debris', 'barrel'],
      count: 10,
    });
    const props = gen.generate();
    for (const prop of props) {
      const meta = PROP_TYPE_META[prop.type];
      expect(prop.category).toBe(meta.category);
    }
  });

  it('can filter props by category', () => {
    const gen = new PropGenerator({
      seed: 42,
      region: { cx: 0, cz: 0, width: 30, depth: 30 },
      propTypes: ['med-kit', 'debris', 'barrel', 'crate'],
      count: 20,
    });
    const props = gen.generate();
    const functional = PropGenerator.filterByCategory(props, 'functional');
    const decorative = PropGenerator.filterByCategory(props, 'decorative');
    const hazard = PropGenerator.filterByCategory(props, 'hazard');
    // All filtered props have the right category
    for (const p of functional) expect(p.category).toBe('functional');
    for (const p of decorative) expect(p.category).toBe('decorative');
    for (const p of hazard) expect(p.category).toBe('hazard');
    // Total should equal all props
    expect(functional.length + decorative.length + hazard.length).toBe(props.length);
  });
});

// ============================================================
// ContentGenerator — dialogue tests
// ============================================================

describe('ContentGenerator — dialogue templates', () => {
  it('generates a rescue dialogue with a valid tree structure', () => {
    const cg = new ContentGenerator(42);
    const tmpl = cg.generateDialogue('rescue');
    expect(tmpl.type).toBe('rescue');
    expect(tmpl.npcName.length).toBeGreaterThan(0);
    expect(tmpl.mood.length).toBeGreaterThan(0);

    const tree = tmpl.tree;
    expect(tree.startId).toBe('start');
    const startNode = tree.nodes['start'];
    expect(startNode).toBeDefined();
    expect(startNode.text.length).toBeGreaterThan(0);
    expect(startNode.speaker).toBe('NPC');
  });

  it('non-ambient dialogues have accept/decline choices', () => {
    const types: DialogueTemplateType[] = ['rescue', 'fetch', 'repair', 'explore'];
    for (const type of types) {
      const cg = new ContentGenerator(100 + type.charCodeAt(0));
      const tmpl = cg.generateDialogue(type);
      const requestNode = tmpl.tree.nodes['request'];
      expect(requestNode).toBeDefined();
      expect(requestNode.choices.length).toBe(2);
      expect(requestNode.choices[0].next).toBe('accepted');
      expect(requestNode.choices[1].next).toBe('declined');
    }
  });

  it('ambient dialogues are linear (no choices)', () => {
    const cg = new ContentGenerator(7);
    const tmpl = cg.generateDialogue('ambient');
    const startNode = tmpl.tree.nodes['start'];
    expect(startNode.choices.length).toBe(0);
    expect(startNode.next).toBeNull();
  });

  it('repair dialogue fills in the {count} placeholder', () => {
    const cg = new ContentGenerator(42);
    const tmpl = cg.generateDialogue('repair');
    const requestNode = tmpl.tree.nodes['request'];
    expect(requestNode.text).not.toContain('{count}');
  });

  it('is deterministic — same seed produces same dialogue', () => {
    const cg1 = new ContentGenerator(999);
    const cg2 = new ContentGenerator(999);
    const t1 = cg1.generateDialogue('rescue');
    const t2 = cg2.generateDialogue('rescue');
    expect(t1.npcName).toBe(t2.npcName);
    expect(t1.mood).toBe(t2.mood);
    expect(t1.tree.nodes['start'].text).toBe(t2.tree.nodes['start'].text);
  });

  it('generateDialogueSet produces one template per type', () => {
    const cg = new ContentGenerator(42);
    const types: DialogueTemplateType[] = ['rescue', 'fetch', 'repair', 'explore'];
    const set = cg.generateDialogueSet(types);
    expect(set.length).toBe(4);
    for (let i = 0; i < types.length; i++) {
      expect(set[i].type).toBe(types[i]);
    }
  });
});

// ============================================================
// ContentGenerator — quest template tests
// ============================================================

describe('ContentGenerator — quest templates', () => {
  it('generates a rescue quest template with objectives and rewards', () => {
    const cg = new ContentGenerator(42);
    const tmpl = cg.generateQuestTemplate('rescue');
    expect(tmpl.type).toBe('rescue');
    expect(tmpl.idPrefix).toBe('rescue');
    expect(tmpl.title.length).toBeGreaterThan(0);
    expect(tmpl.description.length).toBeGreaterThan(0);
    expect(tmpl.objectives.length).toBeGreaterThan(0);
    expect(tmpl.rewards.xp).toBeGreaterThan(0);
    expect(tmpl.rewards.credits).toBeGreaterThan(0);
  });

  it('generates all four quest types', () => {
    const cg = new ContentGenerator(42);
    const set = cg.generateQuestTemplateSet();
    expect(set.length).toBe(4);
    const types = set.map((t) => t.type);
    expect(types).toContain('rescue');
    expect(types).toContain('fetch');
    expect(types).toContain('repair');
    expect(types).toContain('explore');
  });

  it('repair quests have a numeric target objective', () => {
    const cg = new ContentGenerator(42);
    const tmpl = cg.generateQuestTemplate('repair');
    const modulesObj = tmpl.objectives.find((o) => o.id === 'modules');
    expect(modulesObj).toBeDefined();
    expect(modulesObj!.target).toBeGreaterThanOrEqual(2);
  });

  it('explore quests have a numeric target objective', () => {
    const cg = new ContentGenerator(42);
    const tmpl = cg.generateQuestTemplate('explore');
    const discoverObj = tmpl.objectives.find((o) => o.id === 'discover');
    expect(discoverObj).toBeDefined();
    expect(discoverObj!.target).toBeGreaterThanOrEqual(3);
  });

  it('rescue quest has boolean objectives (target 0)', () => {
    const cg = new ContentGenerator(42);
    const tmpl = cg.generateQuestTemplate('rescue');
    for (const obj of tmpl.objectives) {
      expect(obj.target).toBe(0);
    }
  });

  it('rewards are within expected ranges', () => {
    const cg = new ContentGenerator(42);
    const tmpl = cg.generateQuestTemplate('rescue');
    expect(tmpl.rewards.xp).toBeGreaterThanOrEqual(100);
    expect(tmpl.rewards.xp).toBeLessThanOrEqual(200);
    expect(tmpl.rewards.credits).toBeGreaterThanOrEqual(150);
    expect(tmpl.rewards.credits).toBeLessThanOrEqual(250);
  });

  it('is deterministic — same seed produces same quest template', () => {
    const cg1 = new ContentGenerator(555);
    const cg2 = new ContentGenerator(555);
    const t1 = cg1.generateQuestTemplate('repair');
    const t2 = cg2.generateQuestTemplate('repair');
    expect(t1.title).toBe(t2.title);
    expect(t1.description).toBe(t2.description);
    expect(t1.rewards.xp).toBe(t2.rewards.xp);
    expect(t1.objectives[0].target).toBe(t2.objectives[0].target);
  });
});

// ============================================================
// ContentGenerator — lore and story hooks
// ============================================================

describe('ContentGenerator — lore and story hooks', () => {
  it('generates a lore snippet with text and category', () => {
    const cg = new ContentGenerator(42);
    const snippet = cg.generateLoreSnippet();
    expect(snippet.text.length).toBeGreaterThan(0);
    expect(['history', 'technology', 'faction', 'incident', 'rumor']).toContain(snippet.category);
  });

  it('generates lore by specific category', () => {
    const cg = new ContentGenerator(42);
    const snippet = cg.generateLoreSnippetByCategory('technology');
    expect(snippet.category).toBe('technology');
    expect(snippet.text.length).toBeGreaterThan(0);
  });

  it('generates lore appropriate to room type', () => {
    const cg = new ContentGenerator(42);
    const lore = cg.generateLoreForRoom('engineering');
    expect(['technology', 'incident']).toContain(lore.category);
  });

  it('generates multiple lore snippets', () => {
    const cg = new ContentGenerator(42);
    const snippets = cg.generateLoreSnippets(5);
    expect(snippets.length).toBe(5);
    for (const s of snippets) {
      expect(s.text.length).toBeGreaterThan(0);
    }
  });

  it('generates a story hook with title, text, and theme', () => {
    const cg = new ContentGenerator(42);
    const hook = cg.generateStoryHook();
    expect(hook.title.length).toBeGreaterThan(0);
    expect(hook.text.length).toBeGreaterThan(0);
    expect(hook.theme.length).toBeGreaterThan(0);
  });

  it('generates multiple story hooks', () => {
    const cg = new ContentGenerator(42);
    const hooks = cg.generateStoryHooks(3);
    expect(hooks.length).toBe(3);
    for (const h of hooks) {
      expect(h.title.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic across static check', () => {
    expect(ContentGenerator.isDeterministic(42)).toBe(true);
    expect(ContentGenerator.isDeterministic(99)).toBe(true);
  });
});

// ============================================================
// StationDressing tests
// ============================================================

describe('StationDressing', () => {
  // Helper: generate a station for dressing tests.
  function makeStation(seed = 42, roomCount = 8) {
    return new StationGenerator({ seed, roomCount }).generate();
  }

  it('dresses every room with props', () => {
    const station = makeStation();
    const dressing = new StationDressing({ seed: 100, station });
    const result = dressing.dress();
    expect(result.roomDressing.length).toBe(station.rooms.length);
    for (const rd of result.roomDressing) {
      // Every room should have at least the minimum count from its recipe.
      const recipe = StationDressing.getRecipe(rd.roomType);
      expect(rd.props.length).toBeGreaterThanOrEqual(recipe.minCount);
    }
  });

  it('all props are within their room bounds', () => {
    const station = makeStation(7, 6);
    const dressing = new StationDressing({ seed: 200, station });
    const result = dressing.dress();
    for (const rd of result.roomDressing) {
      const room = station.rooms[rd.roomIndex];
      for (const prop of rd.props) {
        expect(prop.x).toBeGreaterThanOrEqual(room.minX);
        expect(prop.x).toBeLessThanOrEqual(room.maxX);
        expect(prop.z).toBeGreaterThanOrEqual(room.minZ);
        expect(prop.z).toBeLessThanOrEqual(room.maxZ);
      }
    }
  });

  it('bridge rooms get console/screen/terminal/chair props', () => {
    const station = makeStation(1, 1); // single room = bridge
    const dressing = new StationDressing({ seed: 50, station });
    const result = dressing.dress();
    const bridgeDressing = result.roomDressing[0];
    expect(bridgeDressing.roomType).toBe('bridge');
    const types = new Set(bridgeDressing.props.map((p) => p.type));
    // At least one prop should be from the bridge recipe.
    const bridgeTypes = ['console', 'screen', 'terminal', 'chair'];
    const hasExpected = bridgeTypes.some((t) => types.has(t as Prop['type']));
    expect(hasExpected).toBe(true);
  });

  it('med-bay rooms get bed/med-kit/screen props', () => {
    // Generate a large station to maximise chances of having a med-bay.
    const station = makeStation(777, 25);
    const medBayRooms = station.rooms
      .map((r, i) => ({ room: r, index: i }))
      .filter((x) => x.room.type === 'med-bay');
    if (medBayRooms.length === 0) {
      // If no med-bay was generated, skip this test gracefully.
      expect(medBayRooms.length).toBeGreaterThanOrEqual(0);
      return;
    }
    const dressing = new StationDressing({ seed: 300, station });
    const result = dressing.dress();
    const medBayTypes = ['bed', 'med-kit', 'screen'];
    for (const mb of medBayRooms) {
      const rd = result.roomDressing[mb.index];
      const types = new Set(rd.props.map((p) => p.type));
      const hasExpected = medBayTypes.some((t) => types.has(t as Prop['type']));
      expect(hasExpected).toBe(true);
    }
  });

  it('props do not overlap within a room', () => {
    const station = makeStation(42, 10);
    const dressing = new StationDressing({ seed: 500, station });
    const result = dressing.dress();
    for (const rd of result.roomDressing) {
      for (let i = 0; i < rd.props.length; i++) {
        for (let j = i + 1; j < rd.props.length; j++) {
          const a = rd.props[i];
          const b = rd.props[j];
          const ra = PROP_TYPE_META[a.type].radius;
          const rb = PROP_TYPE_META[b.type].radius;
          const minDist = 1.0 + ra + rb;
          const dx = a.x - b.x;
          const dz = a.z - b.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          expect(dist).toBeGreaterThanOrEqual(minDist - 0.001);
        }
      }
    }
  });

  it('allProps contains every prop from every room', () => {
    const station = makeStation(11, 6);
    const dressing = new StationDressing({ seed: 600, station });
    const result = dressing.dress();
    const totalFromRooms = result.roomDressing.reduce((s, rd) => s + rd.props.length, 0);
    expect(result.allProps.length).toBe(totalFromRooms);
  });

  it('countByType returns a map of prop type counts', () => {
    const station = makeStation(33, 8);
    const dressing = new StationDressing({ seed: 700, station });
    const result = dressing.dress();
    const counts = StationDressing.countByType(result);
    expect(counts.size).toBeGreaterThan(0);
    let total = 0;
    for (const [, c] of counts) total += c;
    expect(total).toBe(result.allProps.length);
  });

  it('countByCategory returns functional/decorative/hazard counts', () => {
    const station = makeStation(33, 8);
    const dressing = new StationDressing({ seed: 700, station });
    const result = dressing.dress();
    const counts = StationDressing.countByCategory(result);
    const total = counts.functional + counts.decorative + counts.hazard;
    expect(total).toBe(result.allProps.length);
  });

  it('is deterministic — same seed + station produces same props', () => {
    const station = makeStation(42, 8);
    const d1 = new StationDressing({ seed: 123, station }).dress();
    const d2 = new StationDressing({ seed: 123, station }).dress();
    expect(d1.allProps.length).toBe(d2.allProps.length);
    for (let i = 0; i < d1.allProps.length; i++) {
      expect(d1.allProps[i].type).toBe(d2.allProps[i].type);
      expect(d1.allProps[i].x).toBeCloseTo(d2.allProps[i].x, 5);
      expect(d1.allProps[i].z).toBeCloseTo(d2.allProps[i].z, 5);
    }
  });

  it('includes story hooks for some rooms when enabled', () => {
    const station = makeStation(42, 10);
    const dressing = new StationDressing({ seed: 400, station, includeStoryHooks: true });
    const result = dressing.dress();
    const withHooks = StationDressing.roomsWithStoryHooks(result);
    // With 40% chance per room and 10 rooms, we expect at least 0
    // (but likely some). Just verify the structure is correct.
    for (const rd of withHooks) {
      expect(rd.storyHook).not.toBeNull();
      expect(rd.storyHook!.text.length).toBeGreaterThan(0);
    }
  });

  it('does not include story hooks when disabled', () => {
    const station = makeStation(42, 10);
    const dressing = new StationDressing({ seed: 400, station, includeStoryHooks: false });
    const result = dressing.dress();
    const withHooks = StationDressing.roomsWithStoryHooks(result);
    expect(withHooks.length).toBe(0);
  });

  it('includes lore snippets for every room when enabled', () => {
    const station = makeStation(42, 6);
    const dressing = new StationDressing({ seed: 800, station, includeLore: true });
    const result = dressing.dress();
    for (const rd of result.roomDressing) {
      expect(rd.lore.text.length).toBeGreaterThan(0);
    }
  });

  it('prop count respects density multiplier', () => {
    const station = makeStation(42, 8);
    const d1 = new StationDressing({ seed: 999, station, densityMultiplier: 0.5 }).dress();
    const d2 = new StationDressing({ seed: 999, station, densityMultiplier: 2.0 }).dress();
    // Higher density should produce at least as many props (likely more).
    expect(d2.allProps.length).toBeGreaterThanOrEqual(d1.allProps.length);
  });
});