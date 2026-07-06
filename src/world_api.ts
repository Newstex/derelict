/**
 * IWorld — the only seam between the simulation core and the renderer/UI.
 *
 * The sim implements this directly. The renderer and UI talk ONLY to this
 * interface, never to the concrete Sim class. This keeps the sim pure
 * (zero DOM/Three.js imports) and lets us test it in isolation.
 *
 * Derived from the Browser RPG Engine pattern (World of ClaudeCraft architecture).
 */

// ============================================================
// Core Types
// ============================================================

export type EntityId = number;
export type ZoneId = string;

export enum EntityKind {
  Player = 'player',
  Enemy = 'enemy',
  Npc = 'npc',
  Item = 'item',
  Prop = 'prop',
  Projectile = 'projectile',
}

export enum DamageSchool {
  Kinetic = 'kinetic',
  Energy = 'energy',
  Fire = 'fire',
  Cryo = 'cryo',
  Shock = 'shock',
  Bio = 'bio',
}

export enum CharacterClass {
  Engineer = 'engineer',
  Marine = 'marine',
  Scientist = 'scientist',
  Scavenger = 'scavenger',
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Stats {
  health: number;
  maxHealth: number;
  energy: number;
  maxEnergy: number;
  level: number;
  xp: number;
  xpToNext: number;
  // Derived stats
  attack: number;
  defense: number;
  speed: number;
  critChance: number;
}

export interface Ability {
  id: string;
  name: string;
  description: string;
  school: DamageSchool;
  cost: number;       // energy cost
  cooldown: number;   // in seconds
  castTime: number;   // 0 = instant
  range: number;      // 0 = melee
  damage: [number, number]; // [min, max]
  effectId?: string;  // status effect to apply
  effectDuration?: number;
  iconKey: string;    // procedural icon key for renderer
}

export interface Item {
  id: string;
  name: string;
  description: string;
  itemType: ItemType;
  rarity: Rarity;
  iconKey: string;
  stats?: Partial<Pick<Stats, 'attack' | 'defense' | 'speed' | 'critChance' | 'maxHealth' | 'maxEnergy'>>;
  healAmount?: number;
  energyAmount?: number;
  damage?: [number, number];
  school?: DamageSchool;
  stackable: boolean;
  stackCount: number;
}

export enum ItemType {
  Weapon = 'weapon',
  Armor = 'armor',
  Consumable = 'consumable',
  Material = 'material',
  KeyItem = 'keyitem',
}

export enum Rarity {
  Common = 'common',
  Uncommon = 'uncommon',
  Rare = 'rare',
  Epic = 'epic',
}

export interface StatusEffect {
  id: string;
  name: string;
  description: string;
  duration: number;   // remaining seconds
  tickInterval: number;
  tickDamage?: number;
  school?: DamageSchool;
  modifier?: Partial<Pick<Stats, 'attack' | 'defense' | 'speed'>>;
  iconKey: string;
}

export interface Entity {
  id: EntityId;
  kind: EntityKind;
  name: string;
  pos: Vec3;
  rotation: number;   // Y rotation in radians
  radius: number;     // collision radius
  stats: Stats;
  classId?: CharacterClass;
  abilities?: string[];       // ability ids
  inventory?: Item[];
  equippedWeapon?: Item;
  equippedArmor?: Item;
  effects?: StatusEffect[];
  enemyTemplateId?: string;
  isAlive: boolean;
  // Visual hint for renderer
  visualKey: string;
  // Animation state hint
  animState: AnimState;
  // Combat state
  lastAttacked: number;  // tick of last attack
  castBar?: CastBar | null;
}

export interface CastBar {
  abilityId: string;
  abilityName: string;
  progress: number;     // 0..1
  duration: number;     // total seconds
}

export enum AnimState {
  Idle = 'idle',
  Walk = 'walk',
  Run = 'run',
  Attack = 'attack',
  Cast = 'cast',
  Hit = 'hit',
  Death = 'death',
  Interact = 'interact',
}

export interface Zone {
  id: ZoneId;
  name: string;
  description: string;
  levelRange: [number, number];
  bounds: { width: number; depth: number };
  entities: EntityId[];
  // Procedural generation seed for this zone
  seed: number;
  biome: StationBiome;
  hazards: Hazard[];
  rooms: Room[];
}

export enum StationBiome {
  Command = 'command',
  Habitation = 'habitation',
  Engineering = 'engineering',
  Cargo = 'cargo',
  Medical = 'medical',
  Hydroponics = 'hydroponics',
  Airlock = 'airlock',
}

export interface Hazard {
  id: string;
  type: HazardType;
  pos: Vec3;
  radius: number;
  damage: number;
  school: DamageSchool;
}

export enum HazardType {
  Fire = 'fire',
  Electric = 'electric',
  Radiation = 'radiation',
  Vacuum = 'vacuum',
  Steam = 'steam',
}

export interface Room {
  id: string;
  name: string;
  pos: Vec3;
  width: number;
  depth: number;
  type: RoomType;
  cleared: boolean;
  hasLoot: boolean;
  doorIds: string[];
}

export enum RoomType {
  Corridor = 'corridor',
  Chamber = 'chamber',
  Junction = 'junction',
  Storage = 'storage',
  Reactor = 'reactor',
  Medbay = 'medbay',
  Armory = 'armory',
  Bridge = 'bridge',
  Airlock = 'airlock',
}

export interface Door {
  id: string;
  pos: Vec3;
  locked: boolean;
  keyItem?: string;
  open: boolean;
}

// ============================================================
// Events (sim → renderer/UI, read-only consumable)
// ============================================================

export interface SimEvent {
  tick: number;
  type: SimEventType;
  entityId?: EntityId;
  targetId?: EntityId;
  data?: Record<string, unknown>;
}

export enum SimEventType {
  Damage = 'damage',
  Heal = 'heal',
  Death = 'death',
  Loot = 'loot',
  LevelUp = 'levelup',
  XpGain = 'xpgain',
  AbilityUsed = 'abilityused',
  EffectApplied = 'effectapplied',
  EffectExpired = 'effectexpired',
  Pickup = 'pickup',
  Interact = 'interact',
  ZoneChange = 'zonechange',
  ProjectileFired = 'projectilefired',
  DamageNumber = 'damagenumber',
  SaveComplete = 'savecomplete',
  LoadComplete = 'loadcomplete',
}

// ============================================================
// Input Commands (UI/sim → sim, via intent)
// ============================================================

export interface MoveIntent {
  dx: number;  // normalized direction
  dz: number;
  running: boolean;
}

export interface UseAbilityIntent {
  abilityId: string;
  targetId?: EntityId;
  targetPos?: Vec3;
}

export interface InteractIntent {
  targetId: EntityId;
}

export interface PickupIntent {
  itemId: EntityId;
}

export interface UseItemIntent {
  itemId: string;
}

export interface EquipItemIntent {
  itemId: string;
}

export type GameCommand =
  | { type: 'move'; intent: MoveIntent }
  | { type: 'useAbility'; intent: UseAbilityIntent }
  | { type: 'interact'; intent: InteractIntent }
  | { type: 'pickup'; intent: PickupIntent }
  | { type: 'useItem'; intent: UseItemIntent }
  | { type: 'equipItem'; intent: EquipItemIntent }
  | { type: 'save' }
  | { type: 'load' }
  | { type: 'newGame'; classId: CharacterClass; seed?: number };

// ============================================================
// Save State
// ============================================================

export interface SaveState {
  version: number;
  seed: number;
  tick: number;
  player: SerializedPlayer;
  zones: SerializedZone[];
  currentZoneId: ZoneId;
  nextEntityId: EntityId;
}

export interface SerializedPlayer {
  id: EntityId;
  name: string;
  classId: CharacterClass;
  stats: Stats;
  abilities: string[];
  inventory: Item[];
  equippedWeapon?: Item;
  equippedArmor?: Item;
  effects: StatusEffect[];
  pos: Vec3;
  rotation: number;
  xp: number;
}

export interface SerializedZone {
  id: ZoneId;
  name: string;
  description: string;
  levelRange: [number, number];
  bounds: { width: number; depth: number };
  seed: number;
  biome: StationBiome;
  hazards: Hazard[];
  rooms: Room[];
  doors: Door[];
  entities: SerializedEntity[];
}

export interface SerializedEntity {
  id: EntityId;
  kind: EntityKind;
  name: string;
  pos: Vec3;
  rotation: number;
  stats: Stats;
  enemyTemplateId?: string;
  isAlive: boolean;
  visualKey: string;
  item?: Item;
}

// ============================================================
// IWorld — the interface
// ============================================================

export interface IWorld {
  // --- Lifecycle ---
  readonly tick: number;
  readonly dt: number;  // fixed delta (1/20)
  readonly seed: number;

  /** Advance the simulation by one fixed tick. Consumes queued commands. */
  step(dt: number): void;

  /** Queue a command for the next tick. */
  command(cmd: GameCommand): void;

  // --- Queries (read-only, for renderer and UI) ---

  /** Current zone data. */
  getZone(): Zone;

  /** All entities in the current zone. */
  getEntities(): Entity[];

  /** Single entity by id. */
  getEntity(id: EntityId): Entity | null;

  /** The player entity. */
  getPlayer(): Entity;

  /** Consumable event queue since last call (sim → renderer/UI). */
  drainEvents(): SimEvent[];

  // --- Save/Load ---

  /** Serialize current state for saving. */
  serialize(): SaveState;

  /** Restore state from save data. */
  deserialize(state: SaveState): void;

  /** Check if a save exists in localStorage. */
  hasSave(): boolean;

  // --- Game state queries ---

  /** Whether the game has started (new game or load). */
  readonly isRunning: boolean;

  /** Whether the player is dead. */
  readonly isGameOver: boolean;

  /** Current game phase. */
  readonly phase: GamePhase;
}

export enum GamePhase {
  MainMenu = 'mainmenu',
  CharacterCreation = 'charactercreation',
  Playing = 'playing',
  Paused = 'paused',
  GameOver = 'gameover',
  Victory = 'victory',
}