/**
 * Character class definitions — the 4 playable classes of DERELICT.
 *
 * Each class has starting stats, abilities, resource type, and starting gear.
 */

import {
  CharacterClass,
  DamageSchool,
  Item,
  ItemType,
  Rarity,
  Stats,
} from '../../world_api';

// ============================================================
// Types
// ============================================================

export interface BaseStats {
  health: number;
  energy: number;
  attack: number;
  defense: number;
  speed: number;
  critChance: number;
}

export interface CharacterClassDef {
  id: CharacterClass;
  name: string;
  description: string;
  resource: string;
  baseStats: BaseStats;
  abilityIds: string[];
  startingWeapon: Item;
  startingArmor: Item;
  /** Per-level stat growth. */
  growth: BaseStats;
}

// ============================================================
// Starting Items (fixed IDs for deterministic save/load)
// ============================================================

function startingWeapon(
  id: string,
  name: string,
  desc: string,
  icon: string,
  attack: number,
  damage: [number, number],
  school: DamageSchool,
  extraStats?: Partial<Item['stats']>,
): Item {
  return {
    id,
    name,
    description: desc,
    itemType: ItemType.Weapon,
    rarity: Rarity.Common,
    iconKey: icon,
    stats: { attack, ...extraStats },
    damage,
    school,
    stackable: false,
    stackCount: 1,
  };
}

function startingArmor(
  id: string,
  name: string,
  desc: string,
  icon: string,
  stats: NonNullable<Item['stats']>,
): Item {
  return {
    id,
    name,
    description: desc,
    itemType: ItemType.Armor,
    rarity: Rarity.Common,
    iconKey: icon,
    stats,
    stackable: false,
    stackCount: 1,
  };
}

// ============================================================
// Class Definitions
// ============================================================

export const CLASS_DEFS: Record<CharacterClass, CharacterClassDef> = {
  [CharacterClass.Engineer]: {
    id: CharacterClass.Engineer,
    name: 'Engineer',
    description:
      'Station maintenance specialist. Deploys turrets, repairs gear, and overcharges systems. High energy, moderate survivability.',
    resource: 'Energy',
    baseStats: {
      health: 100,
      energy: 120,
      attack: 12,
      defense: 10,
      speed: 5,
      critChance: 0.1,
    },
    abilityIds: ['eng_deploy_turret', 'eng_repair', 'eng_overcharge'],
    startingWeapon: startingWeapon(
      'start_weapon_engineer',
      'Standard Plasma Cutter',
      'A reliable plasma cutting tool repurposed for combat.',
      'weapon_plasma_cutter',
      5,
      [8, 14],
      DamageSchool.Energy,
    ),
    startingArmor: startingArmor(
      'start_armor_engineer',
      'Engineering Suit',
      'Standard station engineering uniform with basic hazard protection.',
      'armor_light_engineer',
      { defense: 3, maxHealth: 10, speed: 1 },
    ),
    growth: {
      health: 12,
      energy: 10,
      attack: 2,
      defense: 1,
      speed: 0,
      critChance: 0.01,
    },
  },

  [CharacterClass.Marine]: {
    id: CharacterClass.Marine,
    name: 'Marine',
    description:
      'Military security officer. Trained for combat with power shots, combat stims, and suppression fire. High health and attack.',
    resource: 'Energy',
    baseStats: {
      health: 140,
      energy: 80,
      attack: 18,
      defense: 14,
      speed: 5,
      critChance: 0.15,
    },
    abilityIds: ['mar_power_shot', 'mar_combat_stim', 'mar_suppression_fire'],
    startingWeapon: startingWeapon(
      'start_weapon_marine',
      'Service Rifle',
      'Standard issue military rifle. Reliable and deadly.',
      'weapon_rifle',
      8,
      [12, 20],
      DamageSchool.Kinetic,
    ),
    startingArmor: startingArmor(
      'start_armor_marine',
      'Combat Armor',
      'Medium combat armor with ballistic protection.',
      'armor_medium_marine',
      { defense: 6, maxHealth: 25 },
    ),
    growth: {
      health: 18,
      energy: 5,
      attack: 3,
      defense: 2,
      speed: 0,
      critChance: 0.01,
    },
  },

  [CharacterClass.Scientist]: {
    id: CharacterClass.Scientist,
    name: 'Scientist',
    description:
      'Research medic with nanite healing, cryogenic blasts, and biological scanning. High energy, support-oriented.',
    resource: 'Energy',
    baseStats: {
      health: 90,
      energy: 130,
      attack: 10,
      defense: 8,
      speed: 6,
      critChance: 0.08,
    },
    abilityIds: ['sci_med_nanites', 'sci_cryo_blast', 'sci_bio_scan'],
    startingWeapon: startingWeapon(
      'start_weapon_scientist',
      'Stun Baton',
      'A stun baton for self-defense. Delivers a powerful shock.',
      'weapon_stun_baton',
      4,
      [6, 12],
      DamageSchool.Shock,
      { speed: 1 },
    ),
    startingArmor: startingArmor(
      'start_armor_scientist',
      'Lab Suit',
      'Protective laboratory suit with biohazard shielding.',
      'armor_light_scientist',
      { defense: 3, maxEnergy: 15 },
    ),
    growth: {
      health: 10,
      energy: 12,
      attack: 2,
      defense: 1,
      speed: 1,
      critChance: 0.005,
    },
  },

  [CharacterClass.Scavenger]: {
    id: CharacterClass.Scavenger,
    name: 'Scavenger',
    description:
      'Survivor and looter. Fast, stealthy, and deadly with rapid fire, cloaking, and scrap grenades. High crit and speed.',
    resource: 'Energy',
    baseStats: {
      health: 110,
      energy: 100,
      attack: 14,
      defense: 9,
      speed: 8,
      critChance: 0.2,
    },
    abilityIds: ['scv_rapid_fire', 'scv_cloak', 'scv_scrap_grenade'],
    startingWeapon: startingWeapon(
      'start_weapon_scavenger',
      'Salvaged Pistol',
      'A compact pistol. Quick on the draw.',
      'weapon_pistol',
      5,
      [8, 14],
      DamageSchool.Kinetic,
      { speed: 1 },
    ),
    startingArmor: startingArmor(
      'start_armor_scavenger',
      'Scavenger Vest',
      'Light vest with patched armor plates. Built for speed.',
      'armor_light_scavenger',
      { defense: 2, speed: 2, maxHealth: 5 },
    ),
    growth: {
      health: 12,
      energy: 8,
      attack: 2,
      defense: 1,
      speed: 1,
      critChance: 0.02,
    },
  },
};

// ============================================================
// Progression helpers
// ============================================================

/** XP required to advance from the given level to the next. */
export function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5));
}

/** Create the full Stats object for a new level-1 character of the given class. */
export function createStartingStats(classId: CharacterClass): Stats {
  const def = CLASS_DEFS[classId];
  const b = def.baseStats;
  return {
    health: b.health,
    maxHealth: b.health,
    energy: b.energy,
    maxEnergy: b.energy,
    level: 1,
    xp: 0,
    xpToNext: xpForLevel(1),
    attack: b.attack,
    defense: b.defense,
    speed: b.speed,
    critChance: b.critChance,
  };
}

/**
 * Apply a single level-up to the stats object (mutates in place).
 * Caller is responsible for checking `xp >= xpToNext` before calling.
 */
export function applyLevelUp(stats: Stats, classId: CharacterClass): void {
  const g = CLASS_DEFS[classId].growth;
  stats.level++;
  stats.maxHealth += g.health;
  stats.health = stats.maxHealth; // full heal on level up
  stats.maxEnergy += g.energy;
  stats.energy = stats.maxEnergy; // full energy on level up
  stats.attack += g.attack;
  stats.defense += g.defense;
  stats.speed += g.speed;
  stats.critChance = Math.min(0.95, stats.critChance + g.critChance);
  stats.xp -= stats.xpToNext;
  stats.xpToNext = xpForLevel(stats.level);
}

/** Get the list of ability IDs unlocked at a given level. */
export function abilitiesForLevel(level: number): number[] {
  // Unlocks at levels 1, 3, 5, 8, 12, 16 — but we only have 3 per class.
  // The first ability is at level 1, second at level 3, third at level 5.
  // Extra slots (8, 12, 16) are for future expansion.
  const slots = [1, 3, 5, 8, 12, 16];
  const indices: number[] = [];
  for (let i = 0; i < slots.length; i++) {
    if (level >= slots[i]) {
      indices.push(i);
      if (indices.length >= 3) break; // max 3 for now
    }
  }
  return indices;
}