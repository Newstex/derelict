/**
 * Ability definitions for all 4 player classes and status effect library.
 *
 * Each ability matches the Ability interface from world_api.ts.
 * Healing abilities use the `damage` field as the heal amount range; the Sim
 * checks HEAL_ABILITY_IDS to decide whether to apply healing vs damage.
 */

import { Ability, DamageSchool, StatusEffect } from '../../world_api';

// ============================================================
// Status Effects
// ============================================================

export const STATUS_EFFECTS: Record<string, StatusEffect> = {
  regen: {
    id: 'regen',
    name: 'Regeneration',
    description: 'Nanites repair tissue over time.',
    duration: 5,
    tickInterval: 1,
    tickDamage: -8, // negative = healing
    school: DamageSchool.Bio,
    iconKey: 'effect_regen',
  },
  overcharge: {
    id: 'overcharge',
    name: 'Overcharge',
    description: 'Weapon systems overcharged. Attack increased.',
    duration: 10,
    tickInterval: 1,
    modifier: { attack: 10 },
    iconKey: 'effect_overcharge',
  },
  stim: {
    id: 'stim',
    name: 'Combat Stim',
    description: 'Adrenaline surge. Speed and attack increased.',
    duration: 8,
    tickInterval: 1,
    modifier: { speed: 3, attack: 5 },
    iconKey: 'effect_stim',
  },
  slow: {
    id: 'slow',
    name: 'Slowed',
    description: 'Movement impaired.',
    duration: 5,
    tickInterval: 1,
    modifier: { speed: -3 },
    iconKey: 'effect_slow',
  },
  freeze: {
    id: 'freeze',
    name: 'Frozen',
    description: 'Cryogenically slowed. Movement severely impaired.',
    duration: 4,
    tickInterval: 1,
    modifier: { speed: -5 },
    iconKey: 'effect_freeze',
  },
  bleed: {
    id: 'bleed',
    name: 'Bleeding',
    description: 'Taking physical damage over time.',
    duration: 6,
    tickInterval: 1,
    tickDamage: 5,
    school: DamageSchool.Bio,
    iconKey: 'effect_bleed',
  },
  cloak: {
    id: 'cloak',
    name: 'Cloaked',
    description: 'Stealth field active. Speed increased.',
    duration: 6,
    tickInterval: 1,
    modifier: { speed: 4 },
    iconKey: 'effect_cloak',
  },
  burn: {
    id: 'burn',
    name: 'Burning',
    description: 'Taking fire damage over time.',
    duration: 5,
    tickInterval: 1,
    tickDamage: 4,
    school: DamageSchool.Fire,
    iconKey: 'effect_burn',
  },
  shock_effect: {
    id: 'shock_effect',
    name: 'Shocked',
    description: 'Electrical discharge. Movement slowed.',
    duration: 3,
    tickInterval: 1,
    modifier: { speed: -2 },
    iconKey: 'effect_shock',
  },
  radiation: {
    id: 'radiation',
    name: 'Irradiated',
    description: 'Taking radiation damage over time.',
    duration: 10,
    tickInterval: 1,
    tickDamage: 3,
    school: DamageSchool.Bio,
    iconKey: 'effect_radiation',
  },
  bioscan: {
    id: 'bioscan',
    name: 'Bio-Scan',
    description: 'Tactical awareness. Attack increased.',
    duration: 10,
    tickInterval: 1,
    modifier: { attack: 8 },
    iconKey: 'effect_bioscan',
  },
};

// ============================================================
// Ability registry — player classes
// ============================================================

/** Set of ability IDs whose `damage` field represents heal amount, not damage. */
export const HEAL_ABILITY_IDS = new Set<string>(['eng_repair', 'sci_med_nanites']);

export const PLAYER_ABILITIES: Record<string, Ability> = {
  // ---- Engineer ----
  eng_deploy_turret: {
    id: 'eng_deploy_turret',
    name: 'Deploy Turret',
    description: 'Deploys an auto-targeting turret that fires energy bolts at nearby enemies.',
    school: DamageSchool.Energy,
    cost: 30,
    cooldown: 15,
    castTime: 0.5,
    range: 8,
    damage: [10, 15],
    iconKey: 'ability_deploy_turret',
  },
  eng_repair: {
    id: 'eng_repair',
    name: 'Repair',
    description: 'Uses nanite welders to repair armor and restore health over time.',
    school: DamageSchool.Bio,
    cost: 25,
    cooldown: 12,
    castTime: 1,
    range: 0, // self
    damage: [20, 30], // heal amount
    effectId: 'regen',
    effectDuration: 5,
    iconKey: 'ability_repair',
  },
  eng_overcharge: {
    id: 'eng_overcharge',
    name: 'Overcharge',
    description: 'Overcharges weapon systems for increased attack power.',
    school: DamageSchool.Energy,
    cost: 40,
    cooldown: 20,
    castTime: 0,
    range: 0, // self
    damage: [0, 0],
    effectId: 'overcharge',
    effectDuration: 10,
    iconKey: 'ability_overcharge',
  },

  // ---- Marine ----
  mar_power_shot: {
    id: 'mar_power_shot',
    name: 'Power Shot',
    description: 'A high-velocity round dealing massive kinetic damage.',
    school: DamageSchool.Kinetic,
    cost: 25,
    cooldown: 8,
    castTime: 0.5,
    range: 10,
    damage: [20, 30],
    iconKey: 'ability_power_shot',
  },
  mar_combat_stim: {
    id: 'mar_combat_stim',
    name: 'Combat Stim',
    description: 'Injects a combat stimulant increasing speed and attack.',
    school: DamageSchool.Bio,
    cost: 20,
    cooldown: 15,
    castTime: 0,
    range: 0, // self
    damage: [0, 0],
    effectId: 'stim',
    effectDuration: 8,
    iconKey: 'ability_combat_stim',
  },
  mar_suppression_fire: {
    id: 'mar_suppression_fire',
    name: 'Suppression Fire',
    description: 'Lays down suppressing fire, damaging and slowing targets.',
    school: DamageSchool.Kinetic,
    cost: 35,
    cooldown: 12,
    castTime: 1,
    range: 8,
    damage: [12, 18],
    effectId: 'slow',
    effectDuration: 5,
    iconKey: 'ability_suppression',
  },

  // ---- Scientist ----
  sci_med_nanites: {
    id: 'sci_med_nanites',
    name: 'Med-Nanites',
    description: 'Releases medical nanites that heal wounds over time.',
    school: DamageSchool.Bio,
    cost: 25,
    cooldown: 10,
    castTime: 0.5,
    range: 0, // self
    damage: [25, 35], // heal amount
    effectId: 'regen',
    effectDuration: 5,
    iconKey: 'ability_med_nanites',
  },
  sci_cryo_blast: {
    id: 'sci_cryo_blast',
    name: 'Cryo Blast',
    description: 'Fires a cryogenic blast dealing frost damage and freezing the target.',
    school: DamageSchool.Cryo,
    cost: 30,
    cooldown: 10,
    castTime: 0.5,
    range: 8,
    damage: [15, 22],
    effectId: 'freeze',
    effectDuration: 4,
    iconKey: 'ability_cryo_blast',
  },
  sci_bio_scan: {
    id: 'sci_bio_scan',
    name: 'Bio-Scan',
    description: 'Scans for biological threats, increasing tactical awareness and attack.',
    school: DamageSchool.Bio,
    cost: 15,
    cooldown: 8,
    castTime: 0,
    range: 0, // self
    damage: [0, 0],
    effectId: 'bioscan',
    effectDuration: 10,
    iconKey: 'ability_bio_scan',
  },

  // ---- Scavenger ----
  scv_rapid_fire: {
    id: 'scv_rapid_fire',
    name: 'Rapid Fire',
    description: 'A quick burst of shots dealing kinetic damage. Low cooldown.',
    school: DamageSchool.Kinetic,
    cost: 20,
    cooldown: 6,
    castTime: 0,
    range: 8,
    damage: [8, 12],
    iconKey: 'ability_rapid_fire',
  },
  scv_cloak: {
    id: 'scv_cloak',
    name: 'Cloak',
    description: 'Activates a stealth field, increasing speed and reducing detection.',
    school: DamageSchool.Bio,
    cost: 25,
    cooldown: 15,
    castTime: 0,
    range: 0, // self
    damage: [0, 0],
    effectId: 'cloak',
    effectDuration: 6,
    iconKey: 'ability_cloak',
  },
  scv_scrap_grenade: {
    id: 'scv_scrap_grenade',
    name: 'Scrap Grenade',
    description: 'Throws an improvised grenade dealing kinetic damage and causing bleeding.',
    school: DamageSchool.Kinetic,
    cost: 30,
    cooldown: 10,
    castTime: 0.5,
    range: 6,
    damage: [18, 26],
    effectId: 'bleed',
    effectDuration: 6,
    iconKey: 'ability_scrap_grenade',
  },
};