/**
 * Sim — Deterministic game core for DERELICT.
 *
 * Implements the IWorld interface from world_api.ts.
 * This is the source of truth: all combat, loot, movement, and progression
 * resolve here. The renderer and UI talk ONLY to IWorld.
 *
 * Invariants:
 * - ZERO imports from 'three', DOM, or render/
 * - All randomness through Rng — never Math.random, Date.now, performance.now
 * - Fixed 20Hz tick (DT = 1/20 = 0.05)
 */

import {
  type IWorld,
  type GameCommand,
  type Entity,
  type EntityId,
  type Zone,
  type ZoneId,
  type SimEvent,
  type SaveState,
  type SerializedPlayer,
  type SerializedZone,
  type SerializedEntity,
  type Item,
  type Ability,
  type Stats,
  type Vec3,
  type StatusEffect,
  EntityKind,
  CharacterClass,
  DamageSchool,
  GamePhase,
  SimEventType,
  AnimState,
  ItemType,
  HazardType,
  Door,
} from '../world_api';

import { Rng } from './rng';
import {
  CLASS_DEFS,
  createStartingStats,
  applyLevelUp,
  abilitiesForLevel,
  xpForLevel,
} from './content/classes';
import {
  PLAYER_ABILITIES,
  STATUS_EFFECTS,
  HEAL_ABILITY_IDS,
} from './content/abilities';
import {
  ENEMY_TEMPLATES,
  scaledEnemyStats,
  type EnemyTemplate,
} from './content/enemies';
import {
  generateItem,
  generateConsumable,
  resetItemSerial,
  peekItemSerial,
} from './content/items';
import {
  ZONE_DEFS,
  ZONE_DEF_MAP,
  START_ZONE_ID,
  generateZone,
  type ZoneDef,
} from './content/zones';

// ============================================================
// Constants
// ============================================================

const SAVE_KEY = 'derelict-save';
const SAVE_VERSION = 1;

// Zone progression order
const ZONE_ORDER: ZoneId[] = [
  'airlock',
  'habitation',
  'engineering',
  'cargo',
  'medical',
  'hydroponics',
  'command',
];

// ============================================================
// Internal types
// ============================================================

interface ZoneState {
  zone: Zone;
  doors: Door[];
  entities: Map<EntityId, Entity>;
  items: Map<EntityId, Item>; // item entities' actual item data
}

// ============================================================
// Sim class
// ============================================================

export class Sim implements IWorld {
  // --- IWorld readonly properties ---
  get tick(): number { return this._tick; }
  get dt(): number { return 1 / 20; }
  get seed(): number { return this._seed; }
  get isRunning(): boolean { return this._phase === GamePhase.Playing; }
  get isGameOver(): boolean { return this._phase === GamePhase.GameOver; }
  get phase(): GamePhase { return this._phase; }

  private _tick = 0;
  private _seed = 0;
  private _phase: GamePhase = GamePhase.MainMenu;

  // Entity management
  private nextEntityId = 1;
  private player!: Entity;
  private currentZoneId: ZoneId = START_ZONE_ID;
  private zones: Map<ZoneId, ZoneState> = new Map();

  // Command queue
  private commandQueue: GameCommand[] = [];

  // Event queue (sim → renderer/UI)
  private events: SimEvent[] = [];

  // Cooldowns: abilityId → tick when ready
  private cooldowns: Map<string, number> = new Map();

  // Loot drops on the ground (entityId → Item)
  private groundItems: Map<EntityId, Item> = new Map();

  // Combat RNG — seeded from the world seed for determinism
  private combatRng: Rng = new Rng(0);

  // Pending movement intent (applied each tick)
  private moveIntent: { dx: number; dz: number; running: boolean } | null = null;

  // ============================================================
  // Lifecycle
  // ============================================================

  step(dt: number): void {
    // Process queued commands even when not playing (newGame, load need to work)
    this.processCommands();

    if (this._phase !== GamePhase.Playing) return;

    this._tick++;

    // Apply movement
    if (this.moveIntent) {
      this.applyMovement(dt);
    }

    // Update status effects
    this.updateStatusEffects(dt);

    // Update hazards (damage entities in hazard zones)
    this.updateHazards(dt);

    // Enemy AI
    this.updateEnemyAI(dt);

    // Update cast bars
    this.updateCasts(dt);

    // Check deaths
    this.checkDeaths();

    // Check victory condition
    this.checkVictory();

    // Clear per-tick intent
    this.moveIntent = null;
  }

  command(cmd: GameCommand): void {
    this.commandQueue.push(cmd);
  }

  // ============================================================
  // Queries
  // ============================================================

  getZone(): Zone {
    const zs = this.zones.get(this.currentZoneId);
    if (!zs) throw new Error(`Zone ${this.currentZoneId} not loaded`);
    return zs.zone;
  }

  getEntities(): Entity[] {
    const zs = this.zones.get(this.currentZoneId);
    if (!zs) return [];
    return Array.from(zs.entities.values());
  }

  getEntity(id: EntityId): Entity | null {
    const zs = this.zones.get(this.currentZoneId);
    if (!zs) return null;
    return zs.entities.get(id) ?? null;
  }

  getPlayer(): Entity {
    return this.player;
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ============================================================
  // Save / Load
  // ============================================================

  serialize(): SaveState {
    const p = this.player;
    const player: SerializedPlayer = {
      id: p.id,
      name: p.name,
      classId: p.classId!,
      stats: { ...p.stats },
      abilities: [...(p.abilities ?? [])],
      inventory: (p.inventory ?? []).map(i => ({ ...i })),
      equippedWeapon: p.equippedWeapon ? { ...p.equippedWeapon } : undefined,
      equippedArmor: p.equippedArmor ? { ...p.equippedArmor } : undefined,
      effects: (p.effects ?? []).map(e => ({ ...e })),
      pos: { ...p.pos },
      rotation: p.rotation,
      xp: p.stats.xp,
    };

    const serializedZones: SerializedZone[] = [];
    for (const [zid, zs] of this.zones) {
      const sEntities: SerializedEntity[] = [];
      for (const [eid, e] of zs.entities) {
        if (e.id === this.player.id) continue; // player stored separately
        const groundItem = this.groundItems.get(eid);
        sEntities.push({
          id: e.id,
          kind: e.kind,
          name: e.name,
          pos: { ...e.pos },
          rotation: e.rotation,
          stats: { ...e.stats },
          enemyTemplateId: e.enemyTemplateId,
          isAlive: e.isAlive,
          visualKey: e.visualKey,
          item: groundItem ? { ...groundItem } : undefined,
        });
      }
      serializedZones.push({
        id: zid,
        name: zs.zone.name,
        description: zs.zone.description,
        levelRange: zs.zone.levelRange,
        bounds: zs.zone.bounds,
        seed: zs.zone.seed,
        biome: zs.zone.biome,
        hazards: zs.zone.hazards.map(h => ({ ...h })),
        rooms: zs.zone.rooms.map(r => ({ ...r })),
        doors: zs.doors.map(d => ({ ...d })),
        entities: sEntities,
      });
    }

    return {
      version: SAVE_VERSION,
      seed: this._seed,
      tick: this._tick,
      player,
      zones: serializedZones,
      currentZoneId: this.currentZoneId,
      nextEntityId: this.nextEntityId,
    };
  }

  deserialize(state: SaveState): void {
    this._seed = state.seed;
    this._tick = state.tick;
    this.nextEntityId = state.nextEntityId;
    this.currentZoneId = state.currentZoneId;
    this.combatRng = new Rng(this._seed ^ this._tick);

    // Rebuild player
    const p = state.player;
    this.player = this.makeEntity(
      p.id,
      EntityKind.Player,
      p.name,
      p.pos,
      'player_' + p.classId,
    );
    this.player.classId = p.classId;
    this.player.stats = { ...p.stats };
    this.player.abilities = [...p.abilities];
    this.player.inventory = p.inventory.map(i => ({ ...i }));
    this.player.equippedWeapon = p.equippedWeapon ? { ...p.equippedWeapon } : undefined;
    this.player.equippedArmor = p.equippedArmor ? { ...p.equippedArmor } : undefined;
    this.player.effects = p.effects.map(e => ({ ...e }));

    // Rebuild zones
    this.zones.clear();
    this.groundItems.clear();

    for (const sz of state.zones) {
      const zone: Zone = {
        id: sz.id,
        name: sz.name,
        description: sz.description,
        levelRange: sz.levelRange,
        bounds: sz.bounds,
        entities: [],
        seed: sz.seed,
        biome: sz.biome,
        hazards: sz.hazards.map(h => ({ ...h })),
        rooms: sz.rooms.map(r => ({ ...r })),
      };

      const entities = new Map<EntityId, Entity>();
      for (const se of sz.entities) {
        const e = this.makeEntity(
          se.id,
          se.kind,
          se.name,
          se.pos,
          se.visualKey,
        );
        e.rotation = se.rotation;
        e.stats = { ...se.stats };
        e.enemyTemplateId = se.enemyTemplateId;
        e.isAlive = se.isAlive;
        entities.set(e.id, e);
        if (se.item) {
          this.groundItems.set(e.id, { ...se.item });
        }
      }

      // Add player to its current zone
      if (sz.id === this.currentZoneId) {
        entities.set(this.player.id, this.player);
      }

      zone.entities = Array.from(entities.keys());

      this.zones.set(sz.id, {
        zone,
        doors: sz.doors.map(d => ({ ...d })),
        entities,
        items: new Map(),
      });
    }

    this._phase = GamePhase.Playing;
  }

  hasSave(): boolean {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem(SAVE_KEY) !== null;
    } catch {
      return false;
    }
  }

  // ============================================================
  // Command processing
  // ============================================================

  private processCommands(): void {
    while (this.commandQueue.length > 0) {
      const cmd = this.commandQueue.shift()!;
      this.processCommand(cmd);
    }
  }

  private processCommand(cmd: GameCommand): void {
    switch (cmd.type) {
      case 'newGame':
        this.startNewGame(cmd.classId, cmd.seed);
        break;
      case 'move':
        this.moveIntent = cmd.intent;
        break;
      case 'useAbility':
        this.useAbility(cmd.intent.abilityId, cmd.intent.targetId);
        break;
      case 'interact':
        this.interact(cmd.intent.targetId);
        break;
      case 'pickup':
        this.pickupItem(cmd.intent.itemId);
        break;
      case 'useItem':
        this.useItem(cmd.intent.itemId);
        break;
      case 'equipItem':
        this.equipItem(cmd.intent.itemId);
        break;
      case 'save':
        this.saveToStorage();
        break;
      case 'load':
        this.loadFromStorage();
        break;
    }
  }

  // ============================================================
  // New Game
  // ============================================================

  private startNewGame(classId: CharacterClass, seed?: number): void {
    this._seed = seed ?? ((Math.random() * 0xffffffff) >>> 0);
    // Note: Math.random is ONLY used here for seed generation when no seed
    // is provided. All sim logic uses combatRng (seeded Rng). This is the
    // one acceptable use — the seed itself SHOULD be non-deterministic.
    this.combatRng = new Rng(this._seed);
    this._tick = 0;
    this.nextEntityId = 1;
    this.currentZoneId = START_ZONE_ID;
    this.zones.clear();
    this.groundItems.clear();
    this.cooldowns.clear();
    this.events = [];

    // Create player
    const classDef = CLASS_DEFS[classId];
    const stats = createStartingStats(classId);
    this.player = this.makeEntity(
      this.nextEntityId++,
      EntityKind.Player,
      'Survivor',
      { x: 0, y: 0, z: 0 },
      'player_' + classId,
    );
    this.player.classId = classId;
    this.player.stats = stats;
    this.player.abilities = classDef.abilityIds.slice(0, 3);
    this.player.equippedWeapon = { ...classDef.startingWeapon };
    this.player.equippedArmor = { ...classDef.startingArmor };
    this.player.inventory = [
      generateConsumable('consumable_medkit', 2),
      generateConsumable('consumable_energy_cell', 3),
    ];

    // Generate all zones
    for (const zdef of ZONE_DEFS) {
      this.generateZoneState(zdef);
    }

    // Place player in starting zone
    const startZone = this.zones.get(START_ZONE_ID)!;
    startZone.entities.set(this.player.id, this.player);
    startZone.zone.entities.push(this.player.id);

    // Position player at first room center
    const firstRoom = startZone.zone.rooms[0];
    if (firstRoom) {
      this.player.pos = { x: firstRoom.pos.x, y: 0, z: firstRoom.pos.z };
    }

    this._phase = GamePhase.Playing;
  }

  private generateZoneState(def: ZoneDef): void {
    const zoneSeed = this._seed ^ this.hashString(def.id);
    const result = generateZone(def, zoneSeed, this.nextEntityId);
    this.nextEntityId = result.nextEntityId;

    const entities = new Map<EntityId, Entity>();
    for (const e of result.enemies) {
      entities.set(e.id, e);
    }
    for (const e of result.items) {
      entities.set(e.id, e);
      // The item data was attached to the entity by zones.ts
      const itemData = (e as Entity & { item?: Item }).item;
      if (itemData) {
        this.groundItems.set(e.id, itemData);
      }
    }

    result.zone.entities = Array.from(entities.keys());

    this.zones.set(def.id, {
      zone: result.zone,
      doors: result.doors,
      entities,
      items: new Map(),
    });
  }

  // ============================================================
  // Movement
  // ============================================================

  private applyMovement(dt: number): void {
    if (!this.moveIntent) return;
    const p = this.player;
    const speed = this.moveIntent.running
      ? p.stats.speed * 2.5
      : p.stats.speed;

    // Normalize direction
    const len = Math.sqrt(
      this.moveIntent.dx * this.moveIntent.dx +
      this.moveIntent.dz * this.moveIntent.dz,
    );
    if (len < 0.001) return;

    const dx = (this.moveIntent.dx / len) * speed * dt;
    const dz = (this.moveIntent.dz / len) * speed * dt;

    const newX = p.pos.x + dx;
    const newZ = p.pos.z + dz;

    // Simple bounds check
    const zone = this.getZone();
    const halfW = zone.bounds.width / 2;
    const halfD = zone.bounds.depth / 2;

    p.pos.x = Math.max(-halfW + p.radius, Math.min(halfW - p.radius, newX));
    p.pos.z = Math.max(-halfD + p.radius, Math.min(halfD - p.radius, newZ));

    // Update rotation to face movement direction
    p.rotation = Math.atan2(this.moveIntent.dx, this.moveIntent.dz);
    p.animState = AnimState.Walk;
  }

  // ============================================================
  // Combat — Abilities
  // ============================================================

  private useAbility(abilityId: string, targetId?: EntityId): void {
    const p = this.player;
    if (!p.isAlive) return;

    const ability = PLAYER_ABILITIES[abilityId];
    if (!ability) return;

    // Check if player has this ability
    if (!p.abilities?.includes(abilityId)) return;

    // Check energy
    if (p.stats.energy < ability.cost) return;

    // Check cooldown
    const cdReady = this.cooldowns.get(abilityId);
    if (cdReady !== undefined && this._tick < cdReady) return;

    // Find target
    let target: Entity | null = null;
    if (targetId !== undefined) {
      target = this.getEntity(targetId);
    } else {
      // Auto-target nearest enemy
      target = this.findNearestEnemy(p.pos, ability.range > 0 ? ability.range : 50);
    }

    if (ability.range > 0 && target) {
      // Ranged: check range
      const dist = this.distance(p.pos, target.pos);
      if (dist > ability.range + target.radius) {
        return; // Out of range
      }
    }

    // Deduct energy
    p.stats.energy -= ability.cost;

    // Set cooldown
    this.cooldowns.set(abilityId, this._tick + Math.ceil(ability.cooldown / this.dt));

    // Emit ability used event
    this.emit(SimEventType.AbilityUsed, { abilityId, abilityName: ability.name });

    // Handle heal abilities
    if (HEAL_ABILITY_IDS.has(abilityId)) {
      const healAmount = this.rollDamage(ability, p);
      p.stats.health = Math.min(p.stats.maxHealth, p.stats.health + healAmount);
      this.emit(SimEventType.Heal, { amount: healAmount });
      this.emit(SimEventType.DamageNumber, { amount: healAmount, school: 'heal' });
      return;
    }

    // Handle buff abilities (effects on self)
    if (ability.effectId && !target) {
      this.applyEffect(p, ability.effectId, ability.effectDuration ?? 0);
      return;
    }

    // Damage abilities
    if (target && target.isAlive) {
      // Face target
      p.rotation = Math.atan2(
        target.pos.x - p.pos.x,
        target.pos.z - p.pos.z,
      );
      p.animState = AnimState.Cast;

      // Cast time (instant for now, could add cast bar later)
      const damage = this.rollDamage(ability, p);
      const isCrit = this.combatRng.chance(p.stats.critChance);
      const finalDamage = isCrit ? Math.floor(damage * 1.5) : damage;

      this.dealDamage(target, finalDamage, ability.school, p.id, isCrit);

      // Apply effect
      if (ability.effectId) {
        this.applyEffect(target, ability.effectId, ability.effectDuration ?? 0);
      }

      // Projectile event for renderer
      this.emit(SimEventType.ProjectileFired, {
        fromId: p.id,
        toId: target.id,
        school: ability.school,
      });
    }
  }

  private rollDamage(ability: Ability, attacker: Entity): number {
    const [min, max] = ability.damage;
    const base = min + this.combatRng.next() * (max - min);
    // Add attacker's attack stat
    return Math.floor(base + attacker.stats.attack * 0.5);
  }

  private dealDamage(
    target: Entity,
    amount: number,
    school: DamageSchool,
    sourceId: EntityId,
    isCrit: boolean,
  ): void {
    if (!target.isAlive) return;

    // Apply defense reduction
    const mitigated = Math.max(1, amount - Math.floor(target.stats.defense * 0.5));
    target.stats.health -= mitigated;

    this.emit(SimEventType.Damage, {
      targetId: target.id,
      sourceId,
      amount: mitigated,
      school,
      crit: isCrit,
    });
    this.emit(SimEventType.DamageNumber, {
      entityId: target.id,
      amount: mitigated,
      school,
      crit: isCrit,
    });

    target.animState = AnimState.Hit;

    if (target.stats.health <= 0) {
      target.stats.health = 0;
      // Death handled in checkDeaths
    }
  }

  // ============================================================
  // Status Effects
  // ============================================================

  private applyEffect(target: Entity, effectId: string, duration: number): void {
    const template = STATUS_EFFECTS[effectId];
    if (!template) return;

    const effect: StatusEffect = {
      ...template,
      duration: duration > 0 ? duration : template.duration,
    };

    if (!target.effects) target.effects = [];

    // Replace existing effect of same type
    const existingIdx = target.effects.findIndex(e => e.id === effectId);
    if (existingIdx >= 0) {
      target.effects[existingIdx] = effect;
    } else {
      target.effects.push(effect);
    }

    this.emit(SimEventType.EffectApplied, {
      entityId: target.id,
      effectId,
    });
  }

  private updateStatusEffects(dt: number): void {
    const zs = this.zones.get(this.currentZoneId);
    if (!zs) return;

    for (const entity of zs.entities.values()) {
      if (!entity.effects || entity.effects.length === 0) continue;

      for (let i = entity.effects.length - 1; i >= 0; i--) {
        const eff = entity.effects[i];
        eff.duration -= dt;

        // Tick damage/healing
        if (eff.tickInterval > 0 && eff.tickDamage !== undefined) {
          const ticksElapsed = Math.floor((eff.duration === 0 ? 0 : 1) / eff.tickInterval);
          // Simplified: apply tick damage once per second
          if (Math.floor(this._tick * dt) % Math.floor(eff.tickInterval) === 0) {
            if (eff.tickDamage < 0) {
              // Healing
              entity.stats.health = Math.min(
                entity.stats.maxHealth,
                entity.stats.health + Math.abs(eff.tickDamage),
              );
              this.emit(SimEventType.Heal, {
                entityId: entity.id,
                amount: Math.abs(eff.tickDamage),
              });
            } else {
              entity.stats.health -= eff.tickDamage;
              this.emit(SimEventType.Damage, {
                targetId: entity.id,
                amount: eff.tickDamage,
                school: eff.school,
              });
            }
          }
        }

        if (eff.duration <= 0) {
          entity.effects.splice(i, 1);
          this.emit(SimEventType.EffectExpired, {
            entityId: entity.id,
            effectId: eff.id,
          });
        }
      }
    }
  }

  // ============================================================
  // Hazards
  // ============================================================

  private updateHazards(dt: number): void {
    const zs = this.zones.get(this.currentZoneId);
    if (!zs) return;

    const hazards = zs.zone.hazards;
    if (hazards.length === 0) return;

    for (const entity of zs.entities.values()) {
      if (!entity.isAlive) continue;
      if (entity.kind === EntityKind.Item) continue;

      for (const hazard of hazards) {
        const dist = this.distance(entity.pos, hazard.pos);
        if (dist <= hazard.radius + entity.radius) {
          // Apply hazard damage
          entity.stats.health -= hazard.damage * dt;
          if (entity.stats.health <= 0 && entity.id !== this.player.id) {
            entity.stats.health = 0;
          }
          this.emit(SimEventType.Damage, {
            targetId: entity.id,
            amount: Math.floor(hazard.damage * dt),
            school: hazard.school,
          });
        }
      }
    }
  }

  // ============================================================
  // Enemy AI
  // ============================================================

  private updateEnemyAI(dt: number): void {
    const zs = this.zones.get(this.currentZoneId);
    if (!zs) return;

    const p = this.player;
    if (!p.isAlive) return;

    for (const entity of zs.entities.values()) {
      if (entity.kind !== EntityKind.Enemy) continue;
      if (!entity.isAlive) continue;

      const dist = this.distance(entity.pos, p.pos);
      const aggroRange = 15;

      if (dist <= aggroRange) {
        // Move toward player
        const dx = p.pos.x - entity.pos.x;
        const dz = p.pos.z - entity.pos.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len > 0.001) {
          const speed = entity.stats.speed * dt;
          entity.pos.x += (dx / len) * speed;
          entity.pos.z += (dz / len) * speed;
          entity.rotation = Math.atan2(dx, dz);
          entity.animState = AnimState.Walk;
        }

        // Attack if in range
        const attackRange = 2 + entity.radius + p.radius;
        if (dist <= attackRange) {
          // Basic melee attack
          const cooldownTick = this.cooldowns.get(`enemy_${entity.id}_attack`);
          if (cooldownTick === undefined || this._tick >= cooldownTick) {
            const damage = Math.floor(entity.stats.attack * (0.8 + this.combatRng.next() * 0.4));
            this.dealDamage(p, damage, DamageSchool.Kinetic, entity.id, false);
            this.cooldowns.set(
              `enemy_${entity.id}_attack`,
              this._tick + Math.ceil(1.5 / this.dt),
            );
            entity.animState = AnimState.Attack;
          }
        }
      } else {
        entity.animState = AnimState.Idle;
      }
    }
  }

  // ============================================================
  // Cast bars (for future cast-time abilities)
  // ============================================================

  private updateCasts(dt: number): void {
    const zs = this.zones.get(this.currentZoneId);
    if (!zs) return;

    for (const entity of zs.entities.values()) {
      if (entity.castBar) {
        entity.castBar.progress += dt / entity.castBar.duration;
        if (entity.castBar.progress >= 1) {
          entity.castBar = null;
        }
      }
    }
  }

  // ============================================================
  // Death handling
  // ============================================================

  private checkDeaths(): void {
    const zs = this.zones.get(this.currentZoneId);
    if (!zs) return;

    for (const entity of zs.entities.values()) {
      if (!entity.isAlive) continue;
      if (entity.stats.health <= 0) {
        entity.isAlive = false;
        entity.animState = AnimState.Death;
        this.emit(SimEventType.Death, { entityId: entity.id });

        // If enemy, drop loot and award XP
        if (entity.kind === EntityKind.Enemy) {
          this.handleEnemyDeath(entity);
        }

        // If player, game over
        if (entity.kind === EntityKind.Player) {
          this._phase = GamePhase.GameOver;
        }
      }
    }
  }

  private handleEnemyDeath(enemy: Entity): void {
    const p = this.player;

    // Award XP
    const xpAward = Math.floor(enemy.stats.level * 25 + 10);
    this.awardXp(xpAward);

    // Drop loot
    const template = enemy.enemyTemplateId
      ? ENEMY_TEMPLATES[enemy.enemyTemplateId]
      : null;
    if (template && template.lootTable.length > 0) {
      // Simple loot: 50% chance to drop something
      if (this.combatRng.chance(0.5)) {
        const lootEntry = this.combatRng.pick(template.lootTable);
        if (lootEntry) {
          const item = generateItem(
            new Rng(this._tick ^ enemy.id),
            lootEntry.itemTag,
            0,
          );
          // Create item entity on ground
          const itemEntity = this.makeEntity(
            this.nextEntityId++,
            EntityKind.Item,
            item.name,
            { ...enemy.pos },
            item.iconKey,
          );
          (itemEntity as Entity & { item?: Item }).item = item;
          this.groundItems.set(itemEntity.id, item);

          const zoneState = this.zones.get(this.currentZoneId)!;
          zoneState.entities.set(itemEntity.id, itemEntity);
          zoneState.zone.entities.push(itemEntity.id);

          this.emit(SimEventType.Loot, {
            entityId: itemEntity.id,
            item: item.name,
          });
        }
      }
    }
  }

  private awardXp(amount: number): void {
    const p = this.player;
    p.stats.xp += amount;
    this.emit(SimEventType.XpGain, { amount });

    // Check level up
    while (p.stats.xp >= p.stats.xpToNext) {
      p.stats.xp -= p.stats.xpToNext;
      p.stats.level++;
      p.stats.xpToNext = xpForLevel(p.stats.level + 1);

      if (p.classId) {
        applyLevelUp(p.stats, p.classId);
      }

      // Unlock abilities
      const classDef = CLASS_DEFS[p.classId!];
      const unlockedCount = Math.min(3, Math.floor(p.stats.level / 3) + 1);
      p.abilities = classDef.abilityIds.slice(0, unlockedCount);

      // Heal on level up
      p.stats.health = p.stats.maxHealth;
      p.stats.energy = p.stats.maxEnergy;

      this.emit(SimEventType.LevelUp, { level: p.stats.level });
    }
  }

  // ============================================================
  // Victory check
  // ============================================================

  private checkVictory(): void {
    // Victory: player is in Command zone and all enemies there are dead
    if (this.currentZoneId !== 'command') return;
    if (this._phase !== GamePhase.Playing) return;

    const zs = this.zones.get('command');
    if (!zs) return;

    const enemiesAlive = Array.from(zs.entities.values()).some(
      e => e.kind === EntityKind.Enemy && e.isAlive,
    );

    if (!enemiesAlive) {
      this._phase = GamePhase.Victory;
    }
  }

  // ============================================================
  // Interactions
  // ============================================================

  private interact(targetId: EntityId): void {
    const target = this.getEntity(targetId);
    if (!target) return;

    const dist = this.distance(this.player.pos, target.pos);
    if (dist > 3 + target.radius) return;

    // Door interaction
    const zs = this.zones.get(this.currentZoneId);
    if (zs) {
      const door = zs.doors.find(d => d.id === target.name);
      if (door) {
        if (door.locked) {
          // Check if player has key
          if (door.keyItem && this.player.inventory?.some(i => i.id === door.keyItem)) {
            door.locked = false;
            door.open = true;
            this.emit(SimEventType.Interact, { targetId, action: 'unlock' });
          }
        } else {
          door.open = !door.open;
          this.emit(SimEventType.Interact, { targetId, action: 'toggle' });
        }
        return;
      }
    }

    // Zone transition (interact with airlock/door to next zone)
    this.tryZoneTransition(targetId);
  }

  private tryZoneTransition(targetId: EntityId): void {
    const currentIdx = ZONE_ORDER.indexOf(this.currentZoneId);
    if (currentIdx < 0) return;
    if (currentIdx >= ZONE_ORDER.length - 1) return;

    const nextZoneId = ZONE_ORDER[currentIdx + 1];
    const nextZone = this.zones.get(nextZoneId);
    if (!nextZone) return;

    // Move player to next zone
    const zs = this.zones.get(this.currentZoneId)!;
    zs.entities.delete(this.player.id);
    zs.zone.entities = zs.zone.entities.filter(id => id !== this.player.id);

    this.currentZoneId = nextZoneId;
    const firstRoom = nextZone.zone.rooms[0];
    this.player.pos = firstRoom
      ? { x: firstRoom.pos.x, y: 0, z: firstRoom.pos.z }
      : { x: 0, y: 0, z: 0 };

    nextZone.entities.set(this.player.id, this.player);
    nextZone.zone.entities.push(this.player.id);

    this.emit(SimEventType.ZoneChange, {
      zoneId: nextZoneId,
      zoneName: nextZone.zone.name,
    });
  }

  // ============================================================
  // Item pickup / use / equip
  // ============================================================

  private pickupItem(itemId: EntityId): void {
    const zs = this.zones.get(this.currentZoneId);
    if (!zs) return;

    const itemEntity = zs.entities.get(itemId);
    if (!itemEntity || itemEntity.kind !== EntityKind.Item) return;

    const dist = this.distance(this.player.pos, itemEntity.pos);
    if (dist > 3 + itemEntity.radius) return;

    const item = this.groundItems.get(itemId);
    if (!item) return;

    // Add to inventory
    if (!this.player.inventory) this.player.inventory = [];

    if (item.stackable) {
      const existing = this.player.inventory.find(
        i => i.id === item.id && i.itemType === item.itemType,
      );
      if (existing) {
        existing.stackCount += item.stackCount;
      } else {
        this.player.inventory.push({ ...item });
      }
    } else {
      this.player.inventory.push({ ...item });
    }

    // Remove from world
    this.groundItems.delete(itemId);
    zs.entities.delete(itemId);
    zs.zone.entities = zs.zone.entities.filter(id => id !== itemId);

    this.emit(SimEventType.Pickup, { itemId, itemName: item.name });
  }

  private useItem(itemId: string): void {
    const p = this.player;
    if (!p.inventory) return;

    const idx = p.inventory.findIndex(i => i.id === itemId);
    if (idx < 0) return;

    const item = p.inventory[idx];
    if (item.itemType !== ItemType.Consumable) return;

    // Apply consumable effects
    if (item.healAmount) {
      p.stats.health = Math.min(p.stats.maxHealth, p.stats.health + item.healAmount);
      this.emit(SimEventType.Heal, { amount: item.healAmount });
    }
    if (item.energyAmount) {
      p.stats.energy = Math.min(p.stats.maxEnergy, p.stats.energy + item.energyAmount);
    }

    // Consume
    if (item.stackCount > 1) {
      item.stackCount--;
    } else {
      p.inventory.splice(idx, 1);
    }
  }

  private equipItem(itemId: string): void {
    const p = this.player;
    if (!p.inventory) return;

    const idx = p.inventory.findIndex(i => i.id === itemId);
    if (idx < 0) return;

    const item = p.inventory[idx];
    if (item.itemType === ItemType.Weapon) {
      // Swap current weapon back to inventory
      if (p.equippedWeapon) {
        p.inventory.push({ ...p.equippedWeapon });
      }
      p.equippedWeapon = { ...item };
      p.inventory.splice(idx, 1);
    } else if (item.itemType === ItemType.Armor) {
      if (p.equippedArmor) {
        p.inventory.push({ ...p.equippedArmor });
      }
      p.equippedArmor = { ...item };
      p.inventory.splice(idx, 1);
    }
  }

  // ============================================================
  // Save/Load to localStorage
  // ============================================================

  private saveToStorage(): void {
    try {
      const state = this.serialize();
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      this.emit(SimEventType.SaveComplete, {});
    } catch {
      // localStorage might not be available
    }
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const state: SaveState = JSON.parse(raw);
      this.deserialize(state);
      this.emit(SimEventType.LoadComplete, {});
    } catch {
      // Corrupted save
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

  private makeEntity(
    id: EntityId,
    kind: EntityKind,
    name: string,
    pos: Vec3,
    visualKey: string,
  ): Entity {
    return {
      id,
      kind,
      name,
      pos: { ...pos },
      rotation: 0,
      radius: 0.5,
      stats: this.emptyStats(),
      isAlive: true,
      visualKey,
      animState: AnimState.Idle,
      lastAttacked: 0,
      castBar: null,
    };
  }

  private emptyStats(): Stats {
    return {
      health: 0,
      maxHealth: 0,
      energy: 0,
      maxEnergy: 0,
      level: 1,
      xp: 0,
      xpToNext: 100,
      attack: 0,
      defense: 0,
      speed: 0,
      critChance: 0,
    };
  }

  private emit(type: SimEventType, data?: Record<string, unknown>): void {
    this.events.push({
      tick: this._tick,
      type,
      data,
    });
  }

  private distance(a: Vec3, b: Vec3): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  private findNearestEnemy(pos: Vec3, maxRange: number): Entity | null {
    const zs = this.zones.get(this.currentZoneId);
    if (!zs) return null;

    let nearest: Entity | null = null;
    let nearestDist = maxRange;

    for (const entity of zs.entities.values()) {
      if (entity.kind !== EntityKind.Enemy || !entity.isAlive) continue;
      const dist = this.distance(pos, entity.pos);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = entity;
      }
    }

    return nearest;
  }

  private hashString(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return h;
  }
}