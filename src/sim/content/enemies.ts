/**
 * Enemy template definitions and spawning helpers.
 */

import { DamageSchool, EntityKind } from '../../world_api';

// ============================================================
// Types
// ============================================================

export interface EnemyAbility {
  id: string;
  name: string;
  school: DamageSchool;
  damage: [number, number];
  cooldown: number;
  effectId?: string;
  effectDuration?: number;
}

export interface EnemyLootEntry {
  /** Chance (0..1) to drop loot from this entry. */
  chance: number;
  /** Item template id to generate. */
  itemTag: string;
  /** Min quantity. */
  minQty: number;
  /** Max quantity. */
  maxQty: number;
  /** Rarity bias for generated item. */
  rarityBias?: number;
}

export interface EnemyTemplate {
  templateId: string;
  name: string;
  visualKey: string;
  /** Base stats at level 1 — scaled by zone level. */
  baseStats: {
    health: number;
    energy: number;
    attack: number;
    defense: number;
    speed: number;
    critChance: number;
  };
  abilities: EnemyAbility[];
  lootTable: EnemyLootEntry[];
  /** XP awarded on kill (scaled by level). */
  baseXp: number;
  /** Collision radius. */
  radius: number;
}

// ============================================================
// Enemy Templates
// ============================================================

export const ENEMY_TEMPLATES: Record<string, EnemyTemplate> = {
  rogue_security_drone: {
    templateId: 'rogue_security_drone',
    name: 'Rogue Security Drone',
    visualKey: 'enemy_drone',
    baseStats: {
      health: 60,
      energy: 50,
      attack: 14,
      defense: 8,
      speed: 6,
      critChance: 0.1,
    },
    abilities: [
      {
        id: 'drone_burst',
        name: 'Burst Fire',
        school: DamageSchool.Kinetic,
        damage: [8, 12],
        cooldown: 2,
      },
      {
        id: 'drone_overload',
        name: 'Overload',
        school: DamageSchool.Energy,
        damage: [14, 20],
        cooldown: 6,
        effectId: 'shock_effect',
        effectDuration: 3,
      },
    ],
    lootTable: [
      { chance: 0.5, itemTag: 'weapon_rifle', minQty: 1, maxQty: 1, rarityBias: 0 },
      { chance: 0.3, itemTag: 'material_scrap', minQty: 1, maxQty: 3 },
      { chance: 0.2, itemTag: 'material_circuits', minQty: 1, maxQty: 2 },
    ],
    baseXp: 35,
    radius: 0.5,
  },

  maintenance_bot: {
    templateId: 'maintenance_bot',
    name: 'Maintenance Bot',
    visualKey: 'enemy_maintenance_bot',
    baseStats: {
      health: 45,
      energy: 40,
      attack: 10,
      defense: 6,
      speed: 4,
      critChance: 0.05,
    },
    abilities: [
      {
        id: 'bot_saw',
        name: 'Saw Blade',
        school: DamageSchool.Kinetic,
        damage: [6, 10],
        cooldown: 2,
        effectId: 'bleed',
        effectDuration: 4,
      },
      {
        id: 'bot_spark',
        name: 'Spark Discharge',
        school: DamageSchool.Shock,
        damage: [8, 12],
        cooldown: 4,
        effectId: 'shock_effect',
        effectDuration: 2,
      },
    ],
    lootTable: [
      { chance: 0.4, itemTag: 'material_scrap', minQty: 2, maxQty: 4 },
      { chance: 0.25, itemTag: 'consumable_repair_pack', minQty: 1, maxQty: 1 },
      { chance: 0.15, itemTag: 'material_circuits', minQty: 1, maxQty: 2 },
    ],
    baseXp: 25,
    radius: 0.6,
  },

  mutated_crew_member: {
    templateId: 'mutated_crew_member',
    name: 'Mutated Crew Member',
    visualKey: 'enemy_mutant',
    baseStats: {
      health: 80,
      energy: 30,
      attack: 16,
      defense: 6,
      speed: 5,
      critChance: 0.12,
    },
    abilities: [
      {
        id: 'mutant_claw',
        name: 'Rending Claw',
        school: DamageSchool.Bio,
        damage: [10, 16],
        cooldown: 2,
        effectId: 'bleed',
        effectDuration: 5,
      },
      {
        id: 'mutant_spit',
        name: 'Acid Spit',
        school: DamageSchool.Bio,
        damage: [8, 14],
        cooldown: 5,
        effectId: 'radiation',
        effectDuration: 8,
      },
    ],
    lootTable: [
      { chance: 0.3, itemTag: 'consumable_medkit', minQty: 1, maxQty: 1 },
      { chance: 0.25, itemTag: 'material_biocells', minQty: 1, maxQty: 2 },
      { chance: 0.15, itemTag: 'weapon_stun_baton', minQty: 1, maxQty: 1 },
    ],
    baseXp: 40,
    radius: 0.5,
  },

  vent_crawler: {
    templateId: 'vent_crawler',
    name: 'Vent Crawler',
    visualKey: 'enemy_vent_crawler',
    baseStats: {
      health: 35,
      energy: 20,
      attack: 12,
      defense: 4,
      speed: 9,
      critChance: 0.2,
    },
    abilities: [
      {
        id: 'crawler_lunge',
        name: 'Lunge',
        school: DamageSchool.Kinetic,
        damage: [10, 14],
        cooldown: 2,
      },
      {
        id: 'crawler_bite',
        name: 'Venom Bite',
        school: DamageSchool.Bio,
        damage: [6, 10],
        cooldown: 4,
        effectId: 'bleed',
        effectDuration: 6,
      },
    ],
    lootTable: [
      { chance: 0.35, itemTag: 'material_biocells', minQty: 1, maxQty: 2 },
      { chance: 0.2, itemTag: 'consumable_medkit', minQty: 1, maxQty: 1 },
      { chance: 0.1, itemTag: 'material_scrap', minQty: 1, maxQty: 2 },
    ],
    baseXp: 30,
    radius: 0.4,
  },

  ai_core_turret: {
    templateId: 'ai_core_turret',
    name: 'AI Core Turret',
    visualKey: 'enemy_turret',
    baseStats: {
      health: 120,
      energy: 100,
      attack: 22,
      defense: 12,
      speed: 0,
      critChance: 0.15,
    },
    abilities: [
      {
        id: 'turret_plasma',
        name: 'Plasma Bolt',
        school: DamageSchool.Energy,
        damage: [16, 24],
        cooldown: 2,
      },
      {
        id: 'turret_overcharge',
        name: 'Overcharged Shot',
        school: DamageSchool.Energy,
        damage: [24, 36],
        cooldown: 6,
        effectId: 'burn',
        effectDuration: 5,
      },
    ],
    lootTable: [
      { chance: 0.6, itemTag: 'material_circuits', minQty: 2, maxQty: 4 },
      { chance: 0.4, itemTag: 'weapon_plasma_cutter', minQty: 1, maxQty: 1, rarityBias: 1 },
      { chance: 0.3, itemTag: 'material_biocells', minQty: 1, maxQty: 3 },
    ],
    baseXp: 75,
    radius: 0.7,
  },
};

// ============================================================
// Spawning helpers
// ============================================================

/** Scale a base stat value by zone level using a fixed growth factor. */
export function scaleStat(base: number, level: number, perLevel: number): number {
  return Math.round(base + perLevel * (level - 1));
}

/**
 * Compute scaled stats for an enemy template at a given zone level.
 * Returns the full stat block including derived stats.
 */
export function scaledEnemyStats(
  templateId: string,
  level: number,
): {
  health: number;
  maxHealth: number;
  energy: number;
  maxEnergy: number;
  level: number;
  xp: number;
  xpToNext: number;
  attack: number;
  defense: number;
  speed: number;
  critChance: number;
} {
  const t = ENEMY_TEMPLATES[templateId];
  if (!t) throw new Error(`Unknown enemy template: ${templateId}`);

  const b = t.baseStats;
  const health = scaleStat(b.health, level, b.health * 0.15);
  const energy = scaleStat(b.energy, level, b.energy * 0.1);
  const attack = scaleStat(b.attack, level, b.attack * 0.12);
  const defense = scaleStat(b.defense, level, b.defense * 0.1);

  return {
    health,
    maxHealth: health,
    energy,
    maxEnergy: energy,
    level,
    xp: 0,
    xpToNext: 0,
    attack,
    defense,
    speed: b.speed,
    critChance: b.critChance,
  };
}

/** List of all enemy template ids — for weighted spawn tables. */
export const ALL_ENEMY_TEMPLATE_IDS = Object.keys(ENEMY_TEMPLATES);