/**
 * QuestSystem — quest definitions, generation, and tracking.
 *
 * Addresses GitHub issue #7 (Quest Generation).
 *
 * Overview
 * --------
 *  - A `Quest` has an id, title, description, a list of `QuestObjective`s,
 *    rewards, and a `QuestStatus`.
 *  - A `QuestObjective` tracks its own completion flag and optional
 *    numeric progress toward a target.
 *  - `QuestLog` tracks active and completed quests; it exposes
 *    `start`, `completeObjective`, and `complete` operations that emit
 *    typed `Signal`s (`quest_started`, `objective_completed`,
 *    `quest_completed`).
 *  - `QuestGenerator` produces quests from named templates (rescue, fetch,
 *    repair, explore) using a seeded `Rng` so generation is deterministic.
 *
 * The system is pure TypeScript with no Three.js or DOM dependencies.
 */

import { Signal } from './Signal';
import { Rng } from '../sim/rng';

// ============================================================
// Types
// ============================================================

/** Lifecycle of a quest. */
export enum QuestStatus {
  Inactive = 'inactive',
  Active = 'active',
  Completed = 'completed',
  Failed = 'failed',
}

/** A single goal within a quest. */
export interface QuestObjective {
  /** Stable identifier within the quest. */
  id: string;
  /** Human-readable description. */
  description: string;
  /** Whether the objective is complete. */
  completed: boolean;
  /**
   * Current progress (e.g. 2 of 3 enemies defeated). 0 when not
   * progress-based.
   */
  progress: number;
  /**
   * Target progress at which the objective is considered complete. 0
   * means the objective is a boolean flag (complete via `completeObjective`).
   */
  target: number;
}

/** Reward payload for a quest. */
export interface QuestReward {
  /** Experience points granted. */
  xp: number;
  /** Currency granted. */
  credits: number;
  /** Item tags granted (resolved by the inventory layer). */
  items: string[];
}

/** A quest definition. */
export interface Quest {
  /** Stable unique identifier. */
  id: string;
  /** Display title. */
  title: string;
  /** Long-form description. */
  description: string;
  /** Ordered list of objectives. */
  objectives: QuestObjective[];
  /** Rewards granted on completion. */
  rewards: QuestReward;
  /** Current lifecycle status. */
  status: QuestStatus;
}

// ============================================================
// Events
// ============================================================

export interface QuestStartedEvent {
  quest: Quest;
}

export interface ObjectiveCompletedEvent {
  questId: string;
  objective: QuestObjective;
}

export interface QuestCompletedEvent {
  quest: Quest;
}

// ============================================================
// QuestLog — tracks active/completed quests
// ============================================================

/**
 * Tracks active and completed quests and emits signals as they progress.
 *
 * A single `QuestLog` instance is the source of truth for quest state in
 * a playthrough.
 */
export class QuestLog {
  /** All quests known to the log, keyed by id. */
  private readonly quests = new Map<string, Quest>();

  // --- Signals ---
  readonly onQuestStarted = new Signal<[QuestStartedEvent]>();
  readonly onObjectiveCompleted = new Signal<[ObjectiveCompletedEvent]>();
  readonly onQuestCompleted = new Signal<[QuestCompletedEvent]>();

  /** Add a quest to the log without activating it. */
  add(quest: Quest): void {
    if (this.quests.has(quest.id)) {
      throw new Error(`Quest already in log: ${quest.id}`);
    }
    this.quests.set(quest.id, quest);
  }

  /**
   * Activate a quest known to the log. Sets status to `Active` and emits
   * `onQuestStarted`.
   */
  start(questId: string): void {
    const quest = this.quests.get(questId);
    if (!quest) throw new Error(`Unknown quest: ${questId}`);
    if (quest.status === QuestStatus.Active) {
      throw new Error(`Quest already active: ${questId}`);
    }
    if (quest.status === QuestStatus.Completed) {
      throw new Error(`Quest already completed: ${questId}`);
    }
    quest.status = QuestStatus.Active;
    this.onQuestStarted.emit({ quest });
  }

  /**
   * Advance an objective's progress by `amount` (default 1). When the
   * progress reaches or exceeds the target, the objective is marked
   * complete and `onObjectiveCompleted` is emitted. When all objectives
   * are complete the quest is completed and `onQuestCompleted` is emitted.
   */
  progressObjective(questId: string, objectiveId: string, amount = 1): void {
    const quest = this.requireActive(questId);
    const obj = quest.objectives.find((o) => o.id === objectiveId);
    if (!obj) {
      throw new Error(`Unknown objective: ${objectiveId} (in ${questId})`);
    }
    if (obj.completed) return; // already done — no-op

    if (obj.target > 0) {
      obj.progress = Math.min(obj.progress + amount, obj.target);
      if (obj.progress >= obj.target) {
        obj.completed = true;
        this.onObjectiveCompleted.emit({ questId, objective: obj });
        this.maybeComplete(quest);
      }
    } else {
      // Boolean objective — any progress marks it complete.
      obj.completed = true;
      this.onObjectiveCompleted.emit({ questId, objective: obj });
      this.maybeComplete(quest);
    }
  }

  /**
   * Mark a boolean objective complete directly (no target/progress).
   * Equivalent to `progressObjective` with a flag objective.
   */
  completeObjective(questId: string, objectiveId: string): void {
    this.progressObjective(questId, objectiveId, 0);
  }

  /** Mark a quest failed. Does not emit completion. */
  fail(questId: string): void {
    const quest = this.requireActive(questId);
    quest.status = QuestStatus.Failed;
  }

  /** Look up a quest by id. */
  get(questId: string): Quest | undefined {
    return this.quests.get(questId);
  }

  /** All quests known to the log. */
  get all(): Quest[] {
    return Array.from(this.quests.values());
  }

  /** Active quests. */
  get active(): Quest[] {
    return this.all.filter((q) => q.status === QuestStatus.Active);
  }

  /** Completed quests. */
  get completed(): Quest[] {
    return this.all.filter((q) => q.status === QuestStatus.Completed);
  }

  /** Failed quests. */
  get failed(): Quest[] {
    return this.all.filter((q) => q.status === QuestStatus.Failed);
  }

  /** True when the quest is in the log. */
  has(questId: string): boolean {
    return this.quests.has(questId);
  }

  /** Internal: require an active quest or throw. */
  private requireActive(questId: string): Quest {
    const quest = this.quests.get(questId);
    if (!quest) throw new Error(`Unknown quest: ${questId}`);
    if (quest.status !== QuestStatus.Active) {
      throw new Error(`Quest is not active: ${questId} (status=${quest.status})`);
    }
    return quest;
  }

  /** Internal: when all objectives are complete, complete the quest. */
  private maybeComplete(quest: Quest): void {
    if (quest.objectives.every((o) => o.completed)) {
      quest.status = QuestStatus.Completed;
      this.onQuestCompleted.emit({ quest });
    }
  }
}

// ============================================================
// Quest generation from templates
// ============================================================

/** Template type identifiers. */
export type QuestTemplateType = 'rescue' | 'fetch' | 'repair' | 'explore';

/** A quest template: blueprint for generating quests. */
export interface QuestTemplate {
  type: QuestTemplateType;
  /** Prefix for the generated quest id. */
  idPrefix: string;
  title: string;
  description: string;
  /** Objective specs used to build QuestObjectives. */
  objectives: Array<{
    id: string;
    description: string;
    target: number;
  }>;
  rewards: QuestReward;
}

// ---- Built-in templates -------------------------------------------------

export const QUEST_TEMPLATES: Record<QuestTemplateType, QuestTemplate> = {
  rescue: {
    type: 'rescue',
    idPrefix: 'rescue',
    title: 'Rescue Survivor',
    description:
      'A crewmember is trapped in a damaged section of the station. Reach them and bring them back safely.',
    objectives: [
      { id: 'reach', description: 'Reach the trapped survivor', target: 0 },
      { id: 'escort', description: 'Escort the survivor to safety', target: 0 },
    ],
    rewards: { xp: 150, credits: 200, items: ['consumable_medkit'] },
  },
  fetch: {
    type: 'fetch',
    idPrefix: 'fetch',
    title: 'Retrieve Lost Item',
    description:
      'An important piece of equipment has been left behind in a hazardous zone. Retrieve it.',
    objectives: [
      { id: 'locate', description: 'Locate the item', target: 0 },
      { id: 'retrieve', description: 'Retrieve the item', target: 0 },
      { id: 'return', description: 'Return the item to the requester', target: 0 },
    ],
    rewards: { xp: 100, credits: 120, items: ['material_circuits'] },
  },
  repair: {
    type: 'repair',
    idPrefix: 'repair',
    title: 'Repair Station Systems',
    description:
      'Critical station systems are offline. Repair the required number of modules.',
    objectives: [
      { id: 'modules', description: 'Repair station modules', target: 3 },
    ],
    rewards: { xp: 120, credits: 150, items: ['material_scrap'] },
  },
  explore: {
    type: 'explore',
    idPrefix: 'explore',
    title: 'Explore Uncharted Sector',
    description:
      'Survey an uncharted sector of the station. Discover points of interest.',
    objectives: [
      { id: 'discover', description: 'Discover points of interest', target: 5 },
    ],
    rewards: { xp: 90, credits: 80, items: ['consumable_energy_cell'] },
  },
};

let questSerial = 0;

/** Generate a unique quest id. Deterministic within a session. */
function nextQuestId(prefix: string, rng: Rng): string {
  questSerial++;
  // Mix in an rng draw so ids are not purely sequential while still being
  // deterministic for a given seed.
  const salt = rng.nextInt(0, 0xffff).toString(36);
  return `${prefix}_${questSerial.toString(36)}_${salt}`;
}

/** Reset the quest id serial — useful for tests/deserialization. */
export function resetQuestSerial(value = 0): void {
  questSerial = value;
}

/**
 * Generate a quest from a named template using the provided RNG.
 *
 * The generated quest starts with `QuestStatus.Inactive` — activate it via
 * `QuestLog.start(id)`.
 */
export function generateQuest(
  rng: Rng,
  type: QuestTemplateType,
): Quest {
  const tmpl = QUEST_TEMPLATES[type];
  if (!tmpl) throw new Error(`Unknown quest template: ${type}`);

  const objectives: QuestObjective[] = tmpl.objectives.map((o) => ({
    id: o.id,
    description: o.description,
    completed: false,
    progress: 0,
    target: o.target,
  }));

  return {
    id: nextQuestId(tmpl.idPrefix, rng),
    title: tmpl.title,
    description: tmpl.description,
    objectives,
    rewards: { ...tmpl.rewards, items: [...tmpl.rewards.items] },
    status: QuestStatus.Inactive,
  };
}

/**
 * Generate a quest from an explicit template object. Useful when callers
 * want to supply custom templates rather than the built-in ones.
 */
export function generateQuestFromTemplate(
  rng: Rng,
  tmpl: QuestTemplate,
): Quest {
  const objectives: QuestObjective[] = tmpl.objectives.map((o) => ({
    id: o.id,
    description: o.description,
    completed: false,
    progress: 0,
    target: o.target,
  }));

  return {
    id: nextQuestId(tmpl.idPrefix, rng),
    title: tmpl.title,
    description: tmpl.description,
    objectives,
    rewards: { ...tmpl.rewards, items: [...tmpl.rewards.items] },
    status: QuestStatus.Inactive,
  };
}

/**
 * Convenience: generate a quest and add it to a log.
 * Returns the generated quest (still inactive).
 */
export function generateAndAdd(
  rng: Rng,
  log: QuestLog,
  type: QuestTemplateType,
): Quest {
  const quest = generateQuest(rng, type);
  log.add(quest);
  return quest;
}