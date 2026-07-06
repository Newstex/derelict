/**
 * DialogueSystem — branching dialogue trees with signal-based callbacks.
 *
 * Addresses GitHub issue #6 (NPC Dialogue).
 *
 * Overview
 * --------
 *  - A `DialogueTree` is a collection of `DialogueNode`s keyed by id.
 *  - Each node has display text, the speaker id, an optional list of
 *    `DialogueChoice`s, and an optional `next` id to auto-advance to when
 *    no choice is made.
 *  - A `DialogueChoice` carries player-facing text, a target node id, an
 *    optional `condition` predicate (evaluated against a context object),
 *    and an optional `action` that runs when the choice is selected.
 *  - The `DialogueSystem` is the runtime: the player `start`s a dialogue,
 *    `select`s a choice by index, and `end`s the dialogue. Events are
 *    emitted through typed `Signal`s.
 *  - `NPCDialogue` is the NPC-facing class that bundles a name, portrait,
 *    and a dialogue tree.
 *
 * The system is pure TypeScript with no Three.js or DOM dependencies, so
 * it can be unit-tested in isolation and driven from any UI layer.
 */

import { Signal } from './Signal';

// ============================================================
// Types
// ============================================================

/** Arbitrary context object used to evaluate choice conditions. */
export type DialogueContext = Record<string, unknown>;

/**
 * A single choice presented to the player.
 *
 * The `condition` predicate gates whether the choice is visible/enabled.
 * The `action` callback runs as a side effect when the choice is selected
 * (before the dialogue advances to `next`).
 */
export interface DialogueChoice {
  /** Player-facing label for this choice. */
  text: string;
  /** Node id to advance to when this choice is selected. */
  next: string | null;
  /**
   * Optional predicate. When it returns false the choice is hidden.
   * Receives the current dialogue context.
   */
  condition?: (ctx: DialogueContext) => boolean;
  /** Optional side-effect run when the choice is selected. */
  action?: (ctx: DialogueContext) => void;
}

/**
 * A single node in a dialogue tree.
 *
 * Leaf nodes have `choices = []` and `next = null`, which ends the
 * dialogue when reached (or when selected).
 */
export interface DialogueNode {
  /** Unique node id within the tree. */
  id: string;
  /** The display text shown to the player. */
  text: string;
  /** Speaker id — usually the NPC name or "player". */
  speaker: string;
  /** Branching choices. May be empty for linear/terminal nodes. */
  choices: DialogueChoice[];
  /**
   * If set and there are no choices, the dialogue auto-advances to this
   * node id. Ignored when choices are present.
   */
  next?: string | null;
}

/**
 * A dialogue tree: a collection of nodes plus the id of the entry node.
 */
export interface DialogueTree {
  /** Map of node id → node. */
  nodes: Record<string, DialogueNode>;
  /** Id of the first node to display when the dialogue starts. */
  startId: string;
}

// ============================================================
// Events
// ============================================================

/** Fired when a dialogue starts. Payload: the NPC id. */
export interface DialogueStartedEvent {
  npcId: string;
}

/** Fired when a node is displayed. Payload: the node and NPC id. */
export interface DialogueNodeEvent {
  npcId: string;
  node: DialogueNode;
}

/** Fired when the player selects a choice. Payload: the choice and NPC id. */
export interface DialogueChoiceEvent {
  npcId: string;
  choice: DialogueChoice;
}

/** Fired when a dialogue ends. Payload: the NPC id. */
export interface DialogueEndedEvent {
  npcId: string;
}

// ============================================================
// NPCDialogue — NPC-facing dialogue bundle
// ============================================================

/**
 * Bundles an NPC's display identity with its dialogue tree.
 *
 * The `id` is a stable identifier used in events and conditions; `name`
 * and `portrait` are for UI display.
 */
export class NPCDialogue {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly portrait: string,
    public readonly tree: DialogueTree,
  ) {}
}

// ============================================================
// DialogueSystem — runtime controller
// ============================================================

/**
 * Runtime controller for branching dialogue.
 *
 * Maintains the current node and emits signals as the player navigates
 * the tree. A single instance can drive any number of dialogues; only one
 * dialogue is active at a time.
 */
export class DialogueSystem {
  // --- Signals ---
  /** Emitted when `start()` is called. */
  readonly onStarted = new Signal<[DialogueStartedEvent]>();
  /** Emitted when a node becomes the current node. */
  readonly onNode = new Signal<[DialogueNodeEvent]>();
  /** Emitted when the player selects a choice. */
  readonly onChoice = new Signal<[DialogueChoiceEvent]>();
  /** Emitted when the dialogue ends (via `end()` or a terminal node). */
  readonly onEnded = new Signal<[DialogueEndedEvent]>();

  /** The active dialogue, or null when no dialogue is running. */
  private active: NPCDialogue | null = null;
  /** The current node id within the active dialogue. */
  private currentNodeId: string | null = null;
  /** Mutable context object shared across condition/action evaluation. */
  private ctx: DialogueContext = {};

  /** True when a dialogue is currently running. */
  get isActive(): boolean {
    return this.active !== null;
  }

  /** The current dialogue, or null. */
  get currentDialogue(): NPCDialogue | null {
    return this.active;
  }

  /** The current node, or null when no dialogue is active. */
  get currentNode(): DialogueNode | null {
    if (!this.active || !this.currentNodeId) return null;
    return this.active.tree.nodes[this.currentNodeId] ?? null;
  }

  /** The current dialogue context object (mutable). */
  get context(): DialogueContext {
    return this.ctx;
  }

  /**
   * Start a dialogue with the given NPC.
   *
   * Sets the context, advances to the start node, and emits `onStarted`
   * followed by `onNode`.
   *
   * @throws if a dialogue is already active.
   */
  start(npc: NPCDialogue, ctx: DialogueContext = {}): void {
    if (this.active) {
      throw new Error(`Dialogue already active: ${this.active.id}`);
    }
    this.active = npc;
    this.ctx = ctx;
    this.onStarted.emit({ npcId: npc.id });
    this.goToNode(npc.tree.startId);
  }

  /**
   * Select a choice by its (visible) index in the current node.
   *
   * Runs the choice's `action`, then either advances to the choice's
   * `next` node or ends the dialogue when `next` is null.
   *
   * @throws if no dialogue is active or the index is out of range.
   */
  select(index: number): void {
    if (!this.active || !this.currentNodeId) {
      throw new Error('No active dialogue to select from');
    }
    const node = this.currentNode;
    if (!node) {
      throw new Error(`Unknown node: ${this.currentNodeId}`);
    }
    const visible = this.visibleChoices(node);
    if (index < 0 || index >= visible.length) {
      throw new Error(`Choice index out of range: ${index}`);
    }
    const choice = visible[index];
    this.onChoice.emit({ npcId: this.active.id, choice });
    if (choice.action) choice.action(this.ctx);
    if (choice.next === null) {
      this.end();
    } else {
      this.goToNode(choice.next);
    }
  }

  /**
   * Advance to the next node when the current node has no choices.
   *
   * Uses the node's `next` field. If `next` is null/undefined the dialogue
   * ends.
   *
   * @throws if no dialogue is active or the current node has choices.
   */
  advance(): void {
    if (!this.active || !this.currentNodeId) {
      throw new Error('No active dialogue to advance');
    }
    const node = this.currentNode;
    if (!node) {
      throw new Error(`Unknown node: ${this.currentNodeId}`);
    }
    if (node.choices.length > 0) {
      throw new Error('Cannot advance() a node with choices — use select()');
    }
    if (node.next == null) {
      this.end();
    } else {
      this.goToNode(node.next);
    }
  }

  /** End the active dialogue immediately. No-op if none is active. */
  end(): void {
    if (!this.active) return;
    const npcId = this.active.id;
    this.active = null;
    this.currentNodeId = null;
    this.onEnded.emit({ npcId });
  }

  /**
   * Compute the choices visible under the current context for a node.
   *
   * Choices with a `condition` that returns false are filtered out.
   */
  visibleChoices(node: DialogueNode): DialogueChoice[] {
    return node.choices.filter((c) => !c.condition || c.condition(this.ctx));
  }

  /** Internal: advance to a node and emit the node signal. */
  private goToNode(id: string): void {
    if (!this.active) return;
    const node = this.active.tree.nodes[id];
    if (!node) {
      throw new Error(`Dialogue node not found: ${id} (in ${this.active.id})`);
    }
    this.currentNodeId = id;
    this.onNode.emit({ npcId: this.active.id, node });
    // Auto-end if this is a terminal node (no choices and no next).
    if (node.choices.length === 0 && node.next == null) {
      // Allow the caller to observe the node before ending.
      this.end();
    }
  }
}