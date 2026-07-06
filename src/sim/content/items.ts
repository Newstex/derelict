/**
 * Item definitions and procedural generation.
 *
 * Item templates are combined with an Rng instance to produce concrete Item
 * objects with rolled rarity and stats. The generator is deterministic:
 * the same seed + template always yields the same item.
 */

import {
  DamageSchool,
  Item,
  ItemType,
  Rarity,
} from '../../world_api';
import { Rng } from '../rng';

// ============================================================
// Templates
// ============================================================

export interface WeaponTemplate {
  tag: string;
  name: string;
  description: string;
  iconKey: string;
  school: DamageSchool;
  /** Base damage range before rarity scaling. */
  baseDamage: [number, number];
  /** Base attack bonus. */
  baseAttack: number;
  /** Extra speed bonus for this weapon type. */
  speedBonus: number;
}

export interface ArmorTemplate {
  tag: string;
  name: string;
  description: string;
  iconKey: string;
  /** Base defense bonus. */
  baseDefense: number;
  /** Base health bonus. */
  baseHealth: number;
  /** Base energy bonus. */
  baseEnergy: number;
  /** Base speed modifier (can be negative for heavy armor). */
  speedMod: number;
}

export interface ConsumableTemplate {
  tag: string;
  name: string;
  description: string;
  iconKey: string;
  healAmount: number;
  energyAmount: number;
  /** Optional status effect applied on use. */
  effectId?: string;
  effectDuration?: number;
}

export interface MaterialTemplate {
  tag: string;
  name: string;
  description: string;
  iconKey: string;
}

// ============================================================
// Rarity configuration
// ============================================================

export const RARITY_ORDER: Rarity[] = [
  Rarity.Common,
  Rarity.Uncommon,
  Rarity.Rare,
  Rarity.Epic,
];

export const RARITY_MULTIPLIER: Record<Rarity, number> = {
  [Rarity.Common]: 1.0,
  [Rarity.Uncommon]: 1.25,
  [Rarity.Rare]: 1.6,
  [Rarity.Epic]: 2.2,
};

/** Roll a rarity using the provided RNG. rarityBias shifts the roll toward higher rarities. */
export function rollRarity(rng: Rng, rarityBias = 0): Rarity {
  // Base probabilities: common 60%, uncommon 25%, rare 12%, epic 3%
  const r = rng.next() + rarityBias * 0.1;
  if (r < 0.6) return Rarity.Common;
  if (r < 0.85) return Rarity.Uncommon;
  if (r < 0.97) return Rarity.Rare;
  return Rarity.Epic;
}

// ============================================================
// Weapon Templates
// ============================================================

export const WEAPON_TEMPLATES: Record<string, WeaponTemplate> = {
  weapon_pistol: {
    tag: 'weapon_pistol',
    name: 'Pistol',
    description: 'A compact sidearm. Quick and reliable.',
    iconKey: 'weapon_pistol',
    school: DamageSchool.Kinetic,
    baseDamage: [8, 14],
    baseAttack: 5,
    speedBonus: 1,
  },
  weapon_rifle: {
    tag: 'weapon_rifle',
    name: 'Rifle',
    description: 'A standard issue rifle. Balanced and deadly.',
    iconKey: 'weapon_rifle',
    school: DamageSchool.Kinetic,
    baseDamage: [12, 20],
    baseAttack: 8,
    speedBonus: 0,
  },
  weapon_shotgun: {
    tag: 'weapon_shotgun',
    name: 'Shotgun',
    description: 'A close-range scattergun. Devastating up close.',
    iconKey: 'weapon_shotgun',
    school: DamageSchool.Kinetic,
    baseDamage: [16, 28],
    baseAttack: 10,
    speedBonus: -1,
  },
  weapon_plasma_cutter: {
    tag: 'weapon_plasma_cutter',
    name: 'Plasma Cutter',
    description: 'An industrial plasma tool. Effective at medium range.',
    iconKey: 'weapon_plasma_cutter',
    school: DamageSchool.Energy,
    baseDamage: [10, 18],
    baseAttack: 7,
    speedBonus: 0,
  },
  weapon_stun_baton: {
    tag: 'weapon_stun_baton',
    name: 'Stun Baton',
    description: 'A melee stun baton. Delivers a powerful shock.',
    iconKey: 'weapon_stun_baton',
    school: DamageSchool.Shock,
    baseDamage: [6, 12],
    baseAttack: 4,
    speedBonus: 1,
  },
};

// ============================================================
// Armor Templates
// ============================================================

export const ARMOR_TEMPLATES: Record<string, ArmorTemplate> = {
  armor_light: {
    tag: 'armor_light',
    name: 'Light Suit',
    description: 'Light protective suit. Minimal encumbrance.',
    iconKey: 'armor_light',
    baseDefense: 3,
    baseHealth: 10,
    baseEnergy: 0,
    speedMod: 1,
  },
  armor_medium: {
    tag: 'armor_medium',
    name: 'Medium Suit',
    description: 'Medium armor with balanced protection.',
    iconKey: 'armor_medium',
    baseDefense: 6,
    baseHealth: 25,
    baseEnergy: 0,
    speedMod: 0,
  },
  armor_heavy: {
    tag: 'armor_heavy',
    name: 'Heavy Suit',
    description: 'Heavy armor with maximum protection. Slows movement.',
    iconKey: 'armor_heavy',
    baseDefense: 10,
    baseHealth: 50,
    baseEnergy: 10,
    speedMod: -2,
  },
};

// ============================================================
// Consumable Templates
// ============================================================

export const CONSUMABLE_TEMPLATES: Record<string, ConsumableTemplate> = {
  consumable_medkit: {
    tag: 'consumable_medkit',
    name: 'Medkit',
    description: 'Restores health. A standard first-aid kit.',
    iconKey: 'consumable_medkit',
    healAmount: 50,
    energyAmount: 0,
  },
  consumable_energy_cell: {
    tag: 'consumable_energy_cell',
    name: 'Energy Cell',
    description: 'Restores energy. A portable power cell.',
    iconKey: 'consumable_energy_cell',
    healAmount: 0,
    energyAmount: 50,
  },
  consumable_radiation_pills: {
    tag: 'consumable_radiation_pills',
    name: 'Radiation Pills',
    description: 'Cures radiation poisoning and restores minor health.',
    iconKey: 'consumable_radiation_pills',
    healAmount: 15,
    energyAmount: 0,
  },
  consumable_repair_pack: {
    tag: 'consumable_repair_pack',
    name: 'Repair Pack',
    description: 'Restores health and energy. A comprehensive repair kit.',
    iconKey: 'consumable_repair_pack',
    healAmount: 30,
    energyAmount: 30,
  },
};

// ============================================================
// Material Templates
// ============================================================

export const MATERIAL_TEMPLATES: Record<string, MaterialTemplate> = {
  material_scrap: {
    tag: 'material_scrap',
    name: 'Scrap Metal',
    description: 'Bent metal scraps. Used for crafting.',
    iconKey: 'material_scrap',
  },
  material_circuits: {
    tag: 'material_circuits',
    name: 'Circuits',
    description: 'Electronic circuits. Used for crafting tech items.',
    iconKey: 'material_circuits',
  },
  material_biocells: {
    tag: 'material_biocells',
    name: 'Biocells',
    description: 'Organic biocells. Used for crafting bio items.',
    iconKey: 'material_biocells',
  },
};

// ============================================================
// Procedural Item Generator
// ============================================================

let itemSerial = 0;

/** Generate a unique item id. Deterministic within a session (no Math.random). */
function nextItemId(tag: string): string {
  itemSerial++;
  return `${tag}_${itemSerial.toString(36)}`;
}

/** Reset the item id serial — used when deserializing to avoid collisions. */
export function resetItemSerial(value = 0): void {
  itemSerial = value;
}

/** Peek the current item serial (for save/load). */
export function peekItemSerial(): number {
  return itemSerial;
}

/**
 * Generate a weapon item from a template tag using the provided RNG.
 * The rarity and stat rolls are deterministic given the same RNG state.
 */
export function generateWeapon(rng: Rng, tag: string, rarityBias = 0): Item {
  const tmpl = WEAPON_TEMPLATES[tag];
  if (!tmpl) throw new Error(`Unknown weapon template: ${tag}`);

  const rarity = rollRarity(rng, rarityBias);
  const mult = RARITY_MULTIPLIER[rarity];

  const minDmg = Math.round(tmpl.baseDamage[0] * mult);
  const maxDmg = Math.round(tmpl.baseDamage[1] * mult);
  const attack = Math.round(tmpl.baseAttack * mult);
  const speed = tmpl.speedBonus + (rarity === Rarity.Epic ? 1 : 0);
  const critChance = rarity === Rarity.Common ? 0 : (RARITY_ORDER.indexOf(rarity) - 1) * 0.05;

  return {
    id: nextItemId(tag),
    name: rarityPrefix(rarity) + tmpl.name,
    description: tmpl.description,
    itemType: ItemType.Weapon,
    rarity,
    iconKey: tmpl.iconKey,
    stats: {
      attack,
      speed,
      ...(critChance > 0 ? { critChance } : {}),
    },
    damage: [minDmg, maxDmg],
    school: tmpl.school,
    stackable: false,
    stackCount: 1,
  };
}

/** Generate an armor item from a template tag using the provided RNG. */
export function generateArmor(rng: Rng, tag: string, rarityBias = 0): Item {
  const tmpl = ARMOR_TEMPLATES[tag];
  if (!tmpl) throw new Error(`Unknown armor template: ${tag}`);

  const rarity = rollRarity(rng, rarityBias);
  const mult = RARITY_MULTIPLIER[rarity];

  const defense = Math.round(tmpl.baseDefense * mult);
  const maxHealth = Math.round(tmpl.baseHealth * mult);
  const maxEnergy = Math.round(tmpl.baseEnergy * mult);
  const speed = tmpl.speedMod;

  return {
    id: nextItemId(tag),
    name: rarityPrefix(rarity) + tmpl.name,
    description: tmpl.description,
    itemType: ItemType.Armor,
    rarity,
    iconKey: tmpl.iconKey,
    stats: {
      defense,
      maxHealth,
      ...(maxEnergy > 0 ? { maxEnergy } : {}),
      ...(speed !== 0 ? { speed } : {}),
    },
    stackable: false,
    stackCount: 1,
  };
}

/** Generate a consumable item from a template tag. */
export function generateConsumable(tag: string, stackCount = 1): Item {
  const tmpl = CONSUMABLE_TEMPLATES[tag];
  if (!tmpl) throw new Error(`Unknown consumable template: ${tag}`);

  return {
    id: nextItemId(tag),
    name: tmpl.name,
    description: tmpl.description,
    itemType: ItemType.Consumable,
    rarity: Rarity.Common,
    iconKey: tmpl.iconKey,
    healAmount: tmpl.healAmount,
    energyAmount: tmpl.energyAmount,
    stackable: true,
    stackCount,
  };
}

/** Generate a material item from a template tag. */
export function generateMaterial(tag: string, stackCount = 1): Item {
  const tmpl = MATERIAL_TEMPLATES[tag];
  if (!tmpl) throw new Error(`Unknown material template: ${tag}`);

  return {
    id: nextItemId(tag),
    name: tmpl.name,
    description: tmpl.description,
    itemType: ItemType.Material,
    rarity: Rarity.Common,
    iconKey: tmpl.iconKey,
    stackable: true,
    stackCount,
  };
}

/**
 * Generate an item from a template tag. Dispatches to the correct generator
 * based on the tag prefix.
 */
export function generateItem(rng: Rng, tag: string, rarityBias = 0): Item {
  if (tag.startsWith('weapon_')) return generateWeapon(rng, tag, rarityBias);
  if (tag.startsWith('armor_')) return generateArmor(rng, tag, rarityBias);
  if (tag.startsWith('consumable_')) return generateConsumable(tag);
  if (tag.startsWith('material_')) return generateMaterial(tag);
  throw new Error(`Unknown item tag prefix: ${tag}`);
}

/** Apply a rarity prefix to an item name. */
function rarityPrefix(rarity: Rarity): string {
  switch (rarity) {
    case Rarity.Common:
      return '';
    case Rarity.Uncommon:
      return 'Fine ';
    case Rarity.Rare:
      return 'Superior ';
    case Rarity.Epic:
      return 'Mythic ';
  }
}