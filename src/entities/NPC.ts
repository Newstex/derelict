/**
 * NPC — non-player character entity with position, dialogue, and quests.
 *
 * Addresses GitHub issues #6 (NPC Dialogue) and #7 (Quest Generation).
 *
 * An NPC is an `Interactable` entity that lives on the XZ plane. When the
 * player is within `interactRadius` and presses the interact key (E), the
 * game should call `interact()` which yields the NPC's dialogue bundle
 * (and optionally its offered quest ids).
 *
 * The NPC is a pure data/logic object with no Three.js or DOM dependencies.
 * The render layer can attach a mesh to it via the `meshHandle` field.
 */

import { type NPCDialogue } from '../systems/DialogueSystem';

// ============================================================
// Interactable interface
// ============================================================

/**
 * An entity the player can interact with by pressing the interact key
 * (default: E). The game polls `canInteract(playerX, playerZ)` each frame
 * and triggers `interact()` when the key is pressed while in range.
 */
export interface Interactable {
  /** Entity position on the XZ plane. */
  readonly x: number;
  /** Entity position on the XZ plane. */
  readonly z: number;
  /** Interaction radius (world units). */
  readonly interactRadius: number;
  /** Whether the player is currently within interaction range. */
  canInteract(playerX: number, playerZ: number): boolean;
  /** Perform the interaction. Returns the dialogue to start, if any. */
  interact(): NPCDialogue | null;
}

// ============================================================
// NPC
// ============================================================

/**
 * A non-player character with a position, dialogue bundle, and optional
 * quest offerings.
 *
 * The `questOfferings` array lists quest template type ids that the NPC
 * can offer. The quest layer is responsible for actually generating and
 * tracking quests; the NPC just declares what it can offer.
 */
export class NPC implements Interactable {
  /** Stable identifier (matches the dialogue id). */
  readonly id: string;
  /** Display name (matches the dialogue name). */
  readonly name: string;
  /** Portrait key for UI rendering. */
  readonly portrait: string;

  /** XZ-plane position. */
  x: number;
  z: number;
  /** How close the player must be to interact. */
  readonly interactRadius: number;

  /** The dialogue bundle shown on interaction. */
  readonly dialogue: NPCDialogue;

  /** Quest template type ids this NPC can offer. */
  questOfferings: string[];

  /**
   * Optional handle to a render-layer mesh. The NPC entity itself is
   * pure data; the render layer assigns this when it builds the visual.
   */
  meshHandle: unknown = null;

  constructor(opts: {
    id: string;
    name: string;
    portrait: string;
    x: number;
    z: number;
    dialogue: NPCDialogue;
    interactRadius?: number;
    questOfferings?: string[];
  }) {
    this.id = opts.id;
    this.name = opts.name;
    this.portrait = opts.portrait;
    this.x = opts.x;
    this.z = opts.z;
    this.dialogue = opts.dialogue;
    this.interactRadius = opts.interactRadius ?? 2.5;
    this.questOfferings = opts.questOfferings ?? [];
  }

  /** True when the player position is within the interaction radius. */
  canInteract(playerX: number, playerZ: number): boolean {
    const dx = playerX - this.x;
    const dz = playerZ - this.z;
    return dx * dx + dz * dz <= this.interactRadius * this.interactRadius;
  }

  /**
   * Perform the interaction. Returns the dialogue bundle so the caller
   * (game/input layer) can feed it to the DialogueSystem.
   */
  interact(): NPCDialogue | null {
    return this.dialogue;
  }

  /** Add a quest offering (quest template type id) to this NPC. */
  addQuestOffering(questTypeId: string): void {
    if (!this.questOfferings.includes(questTypeId)) {
      this.questOfferings.push(questTypeId);
    }
  }

  /** Remove a quest offering. */
  removeQuestOffering(questTypeId: string): void {
    this.questOfferings = this.questOfferings.filter((q) => q !== questTypeId);
  }
}