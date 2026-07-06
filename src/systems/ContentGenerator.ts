/**
 * ContentGenerator — AI-assisted procedural content generation.
 *
 * Addresses GitHub issue #4 (AI Content Generation).
 *
 * Overview
 * --------
 *  - Generates `DialogueTree` templates for the `DialogueSystem` using
 *    named patterns (rescue, fetch, repair, explore) with randomized
 *    text variations.
 *  - Generates `QuestTemplate` objects with randomized objectives and
 *    rewards that feed into the existing `QuestSystem`.
 *  - Produces environmental storytelling hooks and lore snippets that
 *    can be attached to props or rooms for atmospheric world-building.
 *
 * The generator uses the seeded `Rng` so all output is deterministic for
 * a given seed — essential for reproducible playthroughs and testing.
 *
 * Pure TypeScript: no Three.js or DOM dependencies.
 */

import { Rng } from '../sim/rng.js';
import type { DialogueTree, DialogueNode } from './DialogueSystem.js';
import type {
  QuestTemplate,
  QuestTemplateType,
  QuestReward,
} from './QuestSystem.js';

// ============================================================
// Types
// ============================================================

/** Template type for dialogue — mirrors quest template types. */
export type DialogueTemplateType = 'rescue' | 'fetch' | 'repair' | 'explore' | 'ambient';

/** A generated dialogue template: a tree plus metadata. */
export interface DialogueTemplate {
  type: DialogueTemplateType;
  /** NPC id prefix. */
  npcId: string;
  /** Display name for the NPC. */
  npcName: string;
  /** The dialogue tree. */
  tree: DialogueTree;
  /** Tone/mood tag for the dialogue. */
  mood: string;
}

/** An environmental storytelling hook attached to a prop or room. */
export interface StoryHook {
  /** A short title/label. */
  title: string;
  /** The narrative text (1-3 sentences). */
  text: string;
  /** Thematic tag. */
  theme: string;
}

/** A lore snippet — a short piece of world-building text. */
export interface LoreSnippet {
  /** Category of the lore. */
  category: 'history' | 'technology' | 'faction' | 'incident' | 'rumor';
  /** The lore text. */
  text: string;
}

// ============================================================
// Text banks — randomized phrases used to assemble content.
// ============================================================

/** NPC name fragments for generation. */
const NPC_FIRST_NAMES = [
  'Dr. Chen', 'Lt. Vex', 'Cmdr. Okoye', 'Sgt. Reyes', 'Ens. Petrov',
  'Dr. Sato', 'Cpt. Lindqvist', 'Ens. Mwangi', 'Lt. Vasquez', 'Dr. Halberg',
];

const NPC_ROLES = [
  'Chief Engineer', 'Medical Officer', 'Security Lead', 'Navigation Officer',
  'Systems Technician', 'Quartermaster', 'Bridge Officer', 'Research Lead',
];

/** Mood tags for dialogue. */
const MOODS = ['urgent', 'worried', 'hopeful', 'grim', 'determined', 'relieved', 'paranoid'];

// ---- Rescue dialogue text banks ----

const RESCUE_OPENINGS = [
  'Thank the stars you found me! I\'ve been trapped here for hours.',
  'You\'re the first face I\'ve seen since the hull breach. Listen, I need help.',
  'I heard your footsteps through the bulkhead — I knew someone was still alive.',
  'The structural damage spread so fast... I couldn\'t reach the escape pod.',
];

const RESCUE_REQUESTS = [
  'My colleague is pinned under a collapsed support beam three sections down. Can you get to them?',
  'There\'s a survivor in the lower deck, but the corridor is flooded with coolant gas. I need you to extract them.',
  'One of our engineers is trapped in the maintenance shaft behind a jammed blast door.',
];

const RESCUE_ACCEPT = [
  'I\'ll get them out. Hold tight.',
  'You can count on me. Stay here — I\'ll be back.',
  'On my way. Don\'t move until I return.',
];

const RESCUE_DECLINE = [
  'I can\'t risk it right now. I\'ll come back when I\'m better equipped.',
  'That\'s too dangerous for me alone. I need to find help first.',
  'I\'m sorry — I\'m not equipped for that kind of rescue.',
];

// ---- Fetch dialogue text banks ----

const FETCH_OPENINGS = [
  'I lost something critical in the chaos. I need it back.',
  'When the evacuation started, I had to leave behind something vital.',
  'There\'s a piece of equipment out there that could save all of us.',
];

const FETCH_REQUESTS = [
  'I need the data core from the server room — it contains the station\'s navigation logs.',
  'There\'s a coolant regulator in the storage bay. Without it, the reactor will overheat.',
  'I left a repair kit in the engine room. Grab it and bring it back to me.',
];

const FETCH_ACCEPT = [
  'I\'ll retrieve it. Where exactly?',
  'Consider it done. I\'ll be back shortly.',
  'On it. Keep the area secure while I\'m gone.',
];

const FETCH_DECLINE = [
  'That area is too dangerous right now.',
  'I can\'t — the route is blocked by debris.',
  'Not yet. I need to clear a path first.',
];

// ---- Repair dialogue text banks ----

const REPAIR_OPENINGS = [
  'The station is falling apart around us. We need to fix the critical systems.',
  'Half the station is dark. The power grid is failing section by section.',
  'I\'ve been trying to patch systems alone, but it\'s too much for one person.',
];

const REPAIR_REQUESTS = [
  'I need you to repair at least {count} power modules across the station. Without them, life support fails.',
  'The hull integrity modules are offline. Restore several of them or we lose atmosphere.',
  'The communication array is shattered. Fix the relay nodes so we can call for rescue.',
];

const REPAIR_ACCEPT = [
  'I\'ll get the systems back online. Show me where to start.',
  'I\'m on it. How many modules need repair?',
  'Understood. I\'ll prioritize the most critical ones.',
];

const REPAIR_DECLINE = [
  'I don\'t have the right tools for that yet.',
  'I need to find repair components first.',
  'That\'s a lot of ground to cover. Let me gear up first.',
];

// ---- Explore dialogue text banks ----

const EXPLORE_OPENINGS = [
  'There are parts of this station nobody has entered in years.',
  'The sensor grid is down — we don\'t know what\'s out there.',
  'I\'ve picked up strange readings from the unexplored sectors.',
];

const EXPLORE_REQUESTS = [
  'Survey the uncharted sectors and discover points of interest. We need to know what\'s out there.',
  'Map the dark sections of the station. There could be survivors — or worse.',
  'Explore the lower decks and catalogue anything you find. Knowledge is survival.',
];

const EXPLORE_ACCEPT = [
  'I\'ll map the area and report back.',
  'Consider it surveyed. I\'ll be thorough.',
  'On it. I\'ll tag anything worth noting.',
];

const EXPLORE_DECLINE = [
  'I\'m not ready to go that deep alone.',
  'Those corridors could be structurally unsound. Let me prepare.',
  'I need better equipment before I venture into unknown territory.',
];

// ---- Ambient dialogue text banks ----

const AMBIENT_LINES = [
  'Strange noises keep echoing through the ventilation system...',
  'I saw something move in the shadows over there. Probably nothing.',
  'The station used to be full of life, you know. Now it\'s just... silence.',
  'Every time the lights flicker, I wonder if the power will come back.',
  'I found a log entry from someone who didn\'t make it. I try not to think about it.',
  'Sometimes I hear the old crew calling out. It\'s just the pipes, I tell myself.',
];

// ---- Lore text banks ----

const LORE_HISTORY = [
  'The DERELICT station was commissioned in 2347 as a deep-space research outpost on the frontier of charted space.',
  'Originally crewed by 240 personnel, the station was designed to operate autonomously for up to five years between supply runs.',
  'Before the incident, the station had survived three near-catastrophic events — each one patched over but never fully resolved.',
  'The station\'s AI core, designated ATLAS-9, was last calibrated seven months before the evacuation order.',
];

const LORE_TECHNOLOGY = [
  'The station\'s fusion reactor runs on helium-3, a rare isotope mined from gas giant moons. Without regular refuelling, it enters safe mode within 72 hours.',
  'Emergency bulkheads are designed to seal automatically when atmospheric sensors detect a breach — but the system has been malfunctioning for months.',
  'The oxygen recyclers operate at 60% efficiency after years of neglected maintenance. Full capacity would support twice the current survivors.',
  'The station\'s communications array can reach the nearest relay beacon, but signal degradation makes every transmission a gamble.',
];

const LORE_FACTION = [
  'The Frontier Sciences Division funded the station as part of a classified xenobiology programme. Few crew members knew the full scope of the research.',
  'A splinter group of engineers once attempted a mutiny over working conditions. The logs are sealed, but the evidence is in the walls.',
  'The station\'s security contingent was understaffed from the beginning — a cost-cutting decision that proved fatal.',
];

const LORE_INCIDENT = [
  'The incident began with a cascade failure in sector 7 — a coolant leak that triggered an automated lockdown, trapping dozens of crew members.',
  'Officially, the evacuation was orderly. The logs tell a different story — panic, conflicting orders, and sealed doors that never should have been closed.',
  'The last transmission from the station was a single word: "Containment." Nobody knows what it referred to.',
];

const LORE_RUMOR = [
  'Some crew members swear they\'ve seen movement in the dark sections — not human, not machine. The logs are ambiguous.',
  'There are stories about a survivor who refused to leave, living in the ventilation system. Nobody has confirmed it.',
  'A few engineers claimed the station\'s AI was acting strangely in the weeks before the incident — making decisions on its own.',
  'Rumour has it there\'s a sealed laboratory in the station\'s core that was never logged on any official manifest.',
];

// ---- Story hook text banks ----

const STORY_HOOKS: StoryHook[] = [
  { title: 'Abandoned Workstation', text: 'A console still displays an unfinished log entry. The author never hit "send."', theme: 'abandonment' },
  { title: 'Scattered Possessions', text: 'Personal effects are strewn across the floor — as if someone left in a terrible hurry.', theme: 'panic' },
  { title: 'Makeshift Barricade', text: 'Furniture has been pushed against a door. Whatever was on the other side, someone didn\'t want it in.', theme: 'fear' },
  { title: 'Blood Trail', text: 'A dried trail leads toward the airlock and stops. No body, no note.', theme: 'mystery' },
  { title: 'Wall Messages', text: 'Scratched into the wall: "THEY LIED ABOUT THE COUNT." The meaning is unclear.', theme: 'conspiracy' },
  { title: 'Frozen Log', text: 'A data pad sits frozen mid-recording. The last frame shows a corridor — empty, except for a shadow at the edge.', theme: 'unknown' },
  { title: 'Ration Cache', text: 'Someone hoarded emergency rations here, far more than one person could eat. Were they planning to stay?', theme: 'survival' },
  { title: 'Child\'s Drawing', text: 'Taped to a locker: a child\'s drawing of the station with a big smile. No children were supposed to be aboard.', theme: 'mystery' },
  { title: 'Blocked Shaft', text: 'A maintenance shaft has been welded shut from the inside. Someone didn\'t want to be followed.', theme: 'isolation' },
  { title: 'Final Broadcast', text: 'A speaker crackles with a looping emergency signal, decades old. Nobody ever turned it off.', theme: 'decay' },
];

// ============================================================
// ContentGenerator
// ============================================================

/**
 * AI-assisted procedural content generator.
 *
 * All methods use a seeded `Rng` for deterministic output. The
 * "AI-assisted" aspect refers to the template-based generation
 * approach: structured text banks are combined with random selection
 * to produce varied, context-appropriate content that simulates
 * hand-authored writing at scale.
 */
export class ContentGenerator {
  private readonly rng: Rng;

  constructor(seed: number) {
    this.rng = new Rng(seed >>> 0);
  }

  /** Fork a new ContentGenerator with a derived seed. */
  fork(): ContentGenerator {
    return new ContentGenerator(this.rng.fork().nextInt(0, 0xffffffff));
  }

  // ----------------------------------------------------------
  // Dialogue template generation
  // ----------------------------------------------------------

  /**
   * Generate a dialogue tree for the given template type.
   *
   * The tree follows a consistent structure:
   *  - start node: NPC opening line
   *  - request node: NPC asks the player to do something
   *  - accept node: player agrees → leads to a closing line
   *  - decline node: player declines → leads to a different closing line
   */
  generateDialogue(type: DialogueTemplateType): DialogueTemplate {
    const npcName = this.rng.pick(NPC_FIRST_NAMES) + ' (' + this.rng.pick(NPC_ROLES) + ')';
    const mood = this.rng.pick(MOODS);
    const npcId = `npc_${type}_${this.rng.nextInt(0, 0xffff).toString(36)}`;

    const tree = this.buildDialogueTree(type);
    return { type, npcId, npcName, tree, mood };
  }

  /** Build the actual DialogueTree for a template type. */
  private buildDialogueTree(type: DialogueTemplateType): DialogueTree {
    const nodes: Record<string, DialogueNode> = {};

    if (type === 'ambient') {
      // Simple linear ambient dialogue — no choices.
      const line = this.rng.pick(AMBIENT_LINES);
      nodes['start'] = {
        id: 'start', speaker: 'NPC', text: line, choices: [], next: null,
      };
      return { nodes, startId: 'start' };
    }

    // Non-ambient types follow the opening → request → accept/decline pattern.
    const banks = this.getDialogueBanks(type);
    const opening = this.rng.pick(banks.openings);
    const requestRaw = this.rng.pick(banks.requests);
    // Fill in any {count} placeholders for repair quests.
    const count = this.rng.nextInt(2, 5);
    const request = requestRaw.replace('{count}', String(count));
    const accept = this.rng.pick(banks.accepts);
    const decline = this.rng.pick(banks.declines);

    nodes['start'] = {
      id: 'start', speaker: 'NPC', text: opening,
      choices: [], next: 'request',
    };
    nodes['request'] = {
      id: 'request', speaker: 'NPC', text: request,
      choices: [
        { text: accept, next: 'accepted' },
        { text: decline, next: 'declined' },
      ],
    };
    nodes['accepted'] = {
      id: 'accepted', speaker: 'NPC',
      text: 'Good. I\'ll be here. Don\'t keep me waiting.',
      choices: [], next: null,
    };
    nodes['declined'] = {
      id: 'declined', speaker: 'NPC',
      text: 'I understand. Come back when you\'re ready.',
      choices: [], next: null,
    };

    return { nodes, startId: 'start' };
  }

  /** Get the text banks for a dialogue type. */
  private getDialogueBanks(type: DialogueTemplateType): {
    openings: string[];
    requests: string[];
    accepts: string[];
    declines: string[];
  } {
    switch (type) {
      case 'rescue':  return { openings: RESCUE_OPENINGS,  requests: RESCUE_REQUESTS,  accepts: RESCUE_ACCEPT,  declines: RESCUE_DECLINE };
      case 'fetch':   return { openings: FETCH_OPENINGS,   requests: FETCH_REQUESTS,   accepts: FETCH_ACCEPT,   declines: FETCH_DECLINE };
      case 'repair':  return { openings: REPAIR_OPENINGS,  requests: REPAIR_REQUESTS,  accepts: REPAIR_ACCEPT,  declines: REPAIR_DECLINE };
      case 'explore': return { openings: EXPLORE_OPENINGS, requests: EXPLORE_REQUESTS, accepts: EXPLORE_ACCEPT, declines: EXPLORE_DECLINE };
      default:        return { openings: AMBIENT_LINES,     requests: ['...'],          accepts: ['...'],        declines: ['...'] };
    }
  }

  /**
   * Generate multiple dialogue templates of mixed types.
   * Returns one template per requested type.
   */
  generateDialogueSet(types: DialogueTemplateType[]): DialogueTemplate[] {
    return types.map((t) => this.generateDialogue(t));
  }

  // ----------------------------------------------------------
  // Quest template generation
  // ----------------------------------------------------------

  /**
   * Generate a quest template with randomized objectives and rewards.
   *
   * The generated template is compatible with `generateQuestFromTemplate`
   * from QuestSystem.ts. The objective targets and reward amounts are
   * randomized within sensible ranges based on the quest type.
   */
  generateQuestTemplate(type: QuestTemplateType): QuestTemplate {
    const titles: Record<QuestTemplateType, string[]> = {
      rescue: ['Rescue Survivor', 'Extract Trapped Crew', 'Recover Lost Ally'],
      fetch: ['Retrieve Lost Item', 'Recover Critical Equipment', 'Fetch the Data Core'],
      repair: ['Repair Station Systems', 'Restore Power Grid', 'Fix Hull Integrity'],
      explore: ['Explore Uncharted Sector', 'Survey Dark Sections', 'Map Unknown Decks'],
    };

    const descriptions: Record<QuestTemplateType, string[]> = {
      rescue: [
        'A crewmember is trapped in a damaged section of the station. Reach them and bring them back safely.',
        'Someone is pinned behind a collapsed bulkhead. Cut through and extract them.',
        'A survivor is trapped in a flooded corridor. Get them out before the air runs out.',
      ],
      fetch: [
        'An important piece of equipment has been left behind in a hazardous zone. Retrieve it.',
        'Critical data was lost during the evacuation. Find the storage device and bring it back.',
        'A coolant regulator is sitting in the storage bay. Grab it before the reactor overheats.',
      ],
      repair: [
        'Critical station systems are offline. Repair the required number of modules.',
        'The power grid is failing. Restore the damaged relay nodes before life support drops.',
        'Hull integrity is compromised. Patch the breaches to restore atmospheric seal.',
      ],
      explore: [
        'Survey an uncharted sector of the station. Discover points of interest.',
        'Map the dark sections and catalogue anything unusual.',
        'Explore the lower decks. There may be survivors — or something worse.',
      ],
    };

    // Objective specs per type, with randomized targets.
    const objectiveSpecs: Record<QuestTemplateType, () => Array<{ id: string; description: string; target: number }>> = {
      rescue: () => [
        { id: 'reach', description: 'Reach the trapped survivor', target: 0 },
        { id: 'escort', description: 'Escort the survivor to safety', target: 0 },
      ],
      fetch: () => [
        { id: 'locate', description: 'Locate the item', target: 0 },
        { id: 'retrieve', description: 'Retrieve the item', target: 0 },
        { id: 'return', description: 'Return the item to the requester', target: 0 },
      ],
      repair: () => [
        { id: 'modules', description: 'Repair station modules', target: this.rng.nextInt(2, 5) },
      ],
      explore: () => [
        { id: 'discover', description: 'Discover points of interest', target: this.rng.nextInt(3, 8) },
      ],
    };

    const rewardRanges: Record<QuestTemplateType, { xpMin: number; xpMax: number; creditsMin: number; creditsMax: number; items: string[] }> = {
      rescue:  { xpMin: 100, xpMax: 200, creditsMin: 150, creditsMax: 250, items: ['consumable_medkit'] },
      fetch:   { xpMin: 70,  xpMax: 130, creditsMin: 80,  creditsMax: 180, items: ['material_circuits'] },
      repair:  { xpMin: 90,  xpMax: 180, creditsMin: 100, creditsMax: 200, items: ['material_scrap'] },
      explore: { xpMin: 60,  xpMax: 120, creditsMin: 50,  creditsMax: 120, items: ['consumable_energy_cell'] },
    };

    const rr = rewardRanges[type];
    const rewards: QuestReward = {
      xp: this.rng.nextInt(rr.xpMin, rr.xpMax),
      credits: this.rng.nextInt(rr.creditsMin, rr.creditsMax),
      items: [...rr.items],
    };

    return {
      type,
      idPrefix: type,
      title: this.rng.pick(titles[type]),
      description: this.rng.pick(descriptions[type]),
      objectives: objectiveSpecs[type](),
      rewards,
    };
  }

  /**
   * Generate a set of quest templates, one per type.
   */
  generateQuestTemplateSet(): QuestTemplate[] {
    return (['rescue', 'fetch', 'repair', 'explore'] as QuestTemplateType[]).map(
      (t) => this.generateQuestTemplate(t),
    );
  }

  // ----------------------------------------------------------
  // Environmental storytelling hooks
  // ----------------------------------------------------------

  /**
   * Generate a random environmental storytelling hook.
   * These can be attached to props or rooms to add narrative flavour.
   */
  generateStoryHook(): StoryHook {
    return this.rng.pick(STORY_HOOKS);
  }

  /**
   * Generate N story hooks (with replacement, so duplicates are possible).
   */
  generateStoryHooks(count: number): StoryHook[] {
    const hooks: StoryHook[] = [];
    for (let i = 0; i < count; i++) {
      hooks.push(this.generateStoryHook());
    }
    return hooks;
  }

  // ----------------------------------------------------------
  // Lore snippet generation
  // ----------------------------------------------------------

  /**
   * Generate a random lore snippet from any category.
   */
  generateLoreSnippet(): LoreSnippet {
    const categories: LoreSnippet['category'][] = ['history', 'technology', 'faction', 'incident', 'rumor'];
    return this.generateLoreSnippetByCategory(this.rng.pick(categories));
  }

  /**
   * Generate a lore snippet from a specific category.
   */
  generateLoreSnippetByCategory(category: LoreSnippet['category']): LoreSnippet {
    const banks: Record<LoreSnippet['category'], string[]> = {
      history: LORE_HISTORY,
      technology: LORE_TECHNOLOGY,
      faction: LORE_FACTION,
      incident: LORE_INCIDENT,
      rumor: LORE_RUMOR,
    };
    return {
      category,
      text: this.rng.pick(banks[category]),
    };
  }

  /**
   * Generate N lore snippets with varied categories.
   */
  generateLoreSnippets(count: number): LoreSnippet[] {
    const snippets: LoreSnippet[] = [];
    for (let i = 0; i < count; i++) {
      snippets.push(this.generateLoreSnippet());
    }
    return snippets;
  }

  /**
   * Generate a lore snippet for a specific room type. Different room
   * types favour different lore categories (e.g. engineering gets
   * technology lore, med-bay gets incident lore).
   */
  generateLoreForRoom(roomType: string): LoreSnippet {
    const roomLore: Record<string, LoreSnippet['category'][]> = {
      bridge: ['history', 'incident'],
      engineering: ['technology', 'incident'],
      'med-bay': ['incident', 'rumor'],
      'crew quarters': ['rumor', 'history'],
      airlock: ['incident', 'rumor'],
      storage: ['technology', 'faction'],
    };
    const cats = roomLore[roomType] ?? ['history', 'technology', 'faction', 'incident', 'rumor'];
    return this.generateLoreSnippetByCategory(this.rng.pick(cats));
  }

  // ----------------------------------------------------------
  // Determinism verification
  // ----------------------------------------------------------

  /**
   * Check that two ContentGenerators with the same seed produce
   * identical output. Useful for tests.
   */
  static isDeterministic(seed: number): boolean {
    const a = new ContentGenerator(seed);
    const b = new ContentGenerator(seed);
    const da = a.generateDialogue('rescue');
    const db = b.generateDialogue('rescue');
    return da.tree.startId === db.tree.startId &&
      da.npcName === db.npcName &&
      da.mood === db.mood;
  }
}