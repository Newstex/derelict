/**
 * Renderer — main Three.js renderer for DERELICT.
 *
 * Pure view layer: reads IWorld state and draws. NEVER mutates game state.
 * Only calls getEntities(), getZone(), getPlayer(), drainEvents(), and
 * reads tick / dt / isRunning / phase.
 */

import * as THREE from 'three';
import {
  AnimState,
  DamageSchool,
  EntityKind,
  GamePhase,
  HazardType,
  SimEventType,
  StationBiome,
  type EntityId,
  type IWorld,
  type SimEvent,
  type Vec3,
} from '../world_api';
import { StationBuilder } from './world/station_builder';
import { CharacterVisual, createCharacterVisual } from './characters/character_visual';
import { VfxSystem } from './effects/vfx';
import { LightingSystem, biomeAccentColor } from './effects/lighting';
import { AmbientSystem } from './effects/ambient';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private world: IWorld;

  private webgl: THREE.WebGLRenderer;
  /** Public so main.ts can pass to CameraController and InputHandler */
  readonly scene: THREE.Scene;
  /** Public so main.ts can pass to CameraController */
  readonly camera: THREE.PerspectiveCamera;
  private clock: THREE.Clock;

  private stationBuilder: StationBuilder;
  private vfx: VfxSystem;
  private lighting: LightingSystem;
  private ambient: AmbientSystem;

  // Entity visuals keyed by entity id
  private visuals = new Map<EntityId, CharacterVisual>();
  private prevPositions = new Map<EntityId, THREE.Vector3>();
  private currPositions = new Map<EntityId, THREE.Vector3>();
  private deadTimers = new Map<EntityId, number>();

  // Interpolation state
  private lastTick = -1;
  private tickAccumulator = 0;

  // Zone tracking
  private currentZoneId = '';
  private currentBiome: StationBiome = StationBiome.Command;

  // Scratch vectors (avoid per-frame allocation)
  private scratchA = new THREE.Vector3();
  private scratchB = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, world: IWorld) {
    this.canvas = canvas;
    this.world = world;

    // WebGL renderer
    this.webgl = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.webgl.setSize(window.innerWidth, window.innerHeight);
    this.webgl.setClearColor(0x050608, 1);

    // Scene with fog for atmosphere (owned by Renderer, exposed read-only)
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x050608, 0.025);

    // Third-person perspective camera (owned by Renderer, exposed read-only)
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );
    this.camera.position.set(0, 6, 8);
    this.scene.add(this.camera);

    this.clock = new THREE.Clock();

    // Sub-systems
    this.lighting = new LightingSystem(this.scene);
    this.lighting.attachFlashlightToCamera(this.camera);
    this.stationBuilder = new StationBuilder();
    this.vfx = new VfxSystem(this.scene);
    this.vfx.setCamera(this.camera);
    this.ambient = new AmbientSystem(this.scene);
  }

  // ---- Public API ----

  /** Called by main.ts's render loop each frame. */
  render(dt: number): void {
    // Always update atmosphere
    this.ambient.update(dt);
    this.lighting.update(dt, this.currentBiome);

    if (this.world.isRunning && this.world.phase === GamePhase.Playing) {
      this.updateGame(dt);
    } else {
      // Still update VFX even in non-playing states
      this.vfx.update(dt);
    }

    this.webgl.render(this.scene, this.camera);
  }

  /** Called by main.ts on window resize. */
  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.webgl.setSize(w, h);
  }

  dispose(): void {
    this.clearVisuals();
    this.stationBuilder.clearZone(this.scene);
    this.lighting.dispose();
    this.vfx.dispose();
    this.ambient.dispose();
    this.webgl.dispose();
  }

  // ---- Game Update ----

  private updateGame(dt: number): void {
    // Zone change detection
    const zone = this.world.getZone();
    if (zone.id !== this.currentZoneId) {
      this.handleZoneChange(zone);
    }

    // Interpolation: detect sim tick advance
    const tick = this.world.tick;
    if (tick !== this.lastTick) {
      this.updateInterpolationBuffers();
      this.lastTick = tick;
      this.tickAccumulator = 0;
    }
    this.tickAccumulator += dt;
    const alpha = Math.min(this.tickAccumulator / this.world.dt, 1.0);

    // Sync visuals with current entities
    this.syncEntityVisuals();

    // Update entity positions and animations
    this.updateEntities(dt, alpha);

    // Update camera to follow player
    this.updateCamera(alpha);

    // Process sim events → VFX
    this.processEvents();

    // Update death timers
    this.updateDeadTimers(dt);

    // Update subsystems
    this.vfx.update(dt);
    this.stationBuilder.update(dt);
  }

  // ---- Zone Change ----

  private handleZoneChange(zone: { id: string; biome: StationBiome; hazards: Array<{ type: HazardType; pos: Vec3 }> }): void {
    this.currentZoneId = zone.id;
    this.currentBiome = zone.biome;

    // Rebuild station geometry
    this.stationBuilder.clearZone(this.scene);
    this.stationBuilder.buildZone(this.world.getZone(), this.scene);

    // Rebuild emergency lights for new biome
    this.lighting.clearEmergencyLights();
    this.lighting.setBiome(zone.biome);
    const accent = biomeAccentColor(zone.biome);
    for (const pos of this.stationBuilder.getLightPositions()) {
      this.lighting.addEmergencyLight(pos, accent);
    }

    // Clear entity visuals — they'll be rebuilt from the new zone
    this.clearVisuals();

    // Reset interpolation
    this.lastTick = -1;
    this.prevPositions.clear();
    this.currPositions.clear();

    // Update ambient
    this.ambient.setDustCenter(new THREE.Vector3(0, 4, 0));
    this.ambient.clearSteamSources();
    for (const hazard of zone.hazards) {
      if (hazard.type === HazardType.Steam) {
        this.ambient.addSteamSource(new THREE.Vector3(hazard.pos.x, hazard.pos.y, hazard.pos.z));
      }
    }
  }

  // ---- Interpolation ----

  private updateInterpolationBuffers(): void {
    const entities = this.world.getEntities();

    // Move current → previous
    for (const [id, curr] of this.currPositions) {
      this.prevPositions.set(id, curr.clone());
    }

    // Update current positions; new entities get prev = curr (no interpolation)
    const currentIds = new Set<EntityId>();
    for (const entity of entities) {
      currentIds.add(entity.id);
      const newPos = new THREE.Vector3(entity.pos.x, entity.pos.y, entity.pos.z);
      if (!this.currPositions.has(entity.id)) {
        this.prevPositions.set(entity.id, newPos.clone());
      }
      this.currPositions.set(entity.id, newPos);
    }

    // Remove stale positions
    for (const [id] of this.currPositions) {
      if (!currentIds.has(id)) {
        this.currPositions.delete(id);
        this.prevPositions.delete(id);
      }
    }
  }

  // ---- Entity Sync ----

  private syncEntityVisuals(): void {
    const entities = this.world.getEntities();
    const currentIds = new Set<EntityId>();

    for (const entity of entities) {
      currentIds.add(entity.id);
      if (!this.visuals.has(entity.id)) {
        // Create new visual
        const visual = createCharacterVisual(entity);
        this.scene.add(visual.group);
        visual.group.position.set(entity.pos.x, entity.pos.y, entity.pos.z);
        visual.group.rotation.y = entity.rotation;
        this.visuals.set(entity.id, visual);
      }
    }

    // Remove visuals for entities no longer present (unless death timer active)
    for (const [id, visual] of this.visuals) {
      if (!currentIds.has(id) && !this.deadTimers.has(id)) {
        this.scene.remove(visual.group);
        this.visuals.delete(id);
        this.prevPositions.delete(id);
        this.currPositions.delete(id);
      }
    }
  }

  // ---- Entity Update ----

  private updateEntities(dt: number, alpha: number): void {
    const entities = this.world.getEntities();

    for (const entity of entities) {
      const visual = this.visuals.get(entity.id);
      if (!visual) continue;

      // Interpolate position
      const prev = this.prevPositions.get(entity.id);
      const curr = this.currPositions.get(entity.id);
      if (prev && curr) {
        this.scratchA.lerpVectors(prev, curr, alpha);
        visual.group.position.copy(this.scratchA);
      }

      // Rotation (smoothed)
      visual.group.rotation.y = entity.rotation;

      // Animation state
      const animState: AnimState = entity.isAlive ? entity.animState : AnimState.Death;
      visual.update(dt, animState);

      // Hide dead items / projectiles immediately
      if (!entity.isAlive && (entity.kind === EntityKind.Item || entity.kind === EntityKind.Projectile)) {
        visual.group.visible = false;
      } else {
        visual.group.visible = true;
      }
    }
  }

  // ---- Camera ----

  private updateCamera(alpha: number): void {
    let player = this.world.getPlayer();
    if (!player) return;

    // Interpolate player position
    const prev = this.prevPositions.get(player.id);
    const curr = this.currPositions.get(player.id);
    if (prev && curr) {
      this.scratchA.lerpVectors(prev, curr, alpha);
    } else {
      this.scratchA.set(player.pos.x, player.pos.y, player.pos.z);
    }

    const r = player.rotation;
    const distance = 5;
    const height = 3.5;

    // Camera positioned behind and above player
    this.scratchB.set(
      this.scratchA.x + Math.sin(r) * distance,
      this.scratchA.y + height,
      this.scratchA.z + Math.cos(r) * distance,
    );

    // Smooth camera follow
    this.camera.position.lerp(this.scratchB, 0.12);
    this.camera.lookAt(this.scratchA.x, this.scratchA.y + 1, this.scratchA.z);
  }

  // ---- Events → VFX ----

  private processEvents(): void {
    const events: SimEvent[] = this.world.drainEvents();

    for (const event of events) {
      switch (event.type) {
        case SimEventType.Damage: {
          const targetId = event.targetId;
          if (targetId !== undefined) {
            const target = this.world.getEntity(targetId);
            if (target) {
              this.vfx.spawnHitFlash(target.pos);
              const visual = this.visuals.get(targetId);
              if (visual && target.isAlive) {
                visual.update(0, AnimState.Hit);
              }
            }
          }
          break;
        }

        case SimEventType.DamageNumber: {
          const entityId = event.entityId;
          if (entityId !== undefined) {
            const entity = this.world.getEntity(entityId);
            if (entity) {
              const amount = (event.data?.['amount'] as number) ?? 0;
              const school = (event.data?.['school'] as DamageSchool) ?? DamageSchool.Kinetic;
              this.vfx.spawnDamageNumber(entity.pos, amount, school);
            }
          }
          break;
        }

        case SimEventType.Death: {
          const entityId = event.entityId;
          if (entityId !== undefined) {
            const entity = this.world.getEntity(entityId);
            if (entity) {
              this.vfx.spawnDeath(entity.pos);
            }
            // Start death timer so the visual lingers for the death animation
            this.deadTimers.set(entityId, 1.5);
          }
          break;
        }

        case SimEventType.ProjectileFired: {
          const from = event.data?.['from'] as Vec3 | undefined;
          const to = event.data?.['to'] as Vec3 | undefined;
          const school = (event.data?.['school'] as DamageSchool) ?? DamageSchool.Energy;
          if (from && to) {
            this.vfx.spawnProjectile(from, to, school);
          }
          break;
        }

        case SimEventType.Heal: {
          const entityId = event.entityId;
          if (entityId !== undefined) {
            const entity = this.world.getEntity(entityId);
            if (entity) {
              const amount = (event.data?.['amount'] as number) ?? 0;
              this.vfx.spawnDamageNumber(entity.pos, amount, DamageSchool.Bio);
            }
          }
          break;
        }

        default:
          break;
      }
    }
  }

  // ---- Death Timers ----

  private updateDeadTimers(dt: number): void {
    for (const [id, timer] of this.deadTimers) {
      const remaining = timer - dt;
      if (remaining <= 0) {
        this.deadTimers.delete(id);
        const visual = this.visuals.get(id);
        if (visual) {
          this.scene.remove(visual.group);
          this.visuals.delete(id);
        }
        this.prevPositions.delete(id);
        this.currPositions.delete(id);
      } else {
        this.deadTimers.set(id, remaining);
        // Continue playing death animation
        const visual = this.visuals.get(id);
        if (visual) {
          visual.update(dt, AnimState.Death);
        }
      }
    }
  }

  // ---- Cleanup ----

  private clearVisuals(): void {
    for (const [, visual] of this.visuals) {
      this.scene.remove(visual.group);
    }
    this.visuals.clear();
    this.prevPositions.clear();
    this.currPositions.clear();
    this.deadTimers.clear();
  }
}