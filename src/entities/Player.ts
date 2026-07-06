/**
 * Player — Three.js-backed player entity.
 *
 * Owns:
 *  - A PerspectiveCamera (first-person / follow camera)
 *  - A simple mesh (capsule placeholder) for third-person visual
 *  - Health and Oxygen vital stats
 *  - Velocity and collision radius consumed by MovementSystem
 *
 * The player is positioned on the XZ plane (y is up). Movement is resolved
 * by MovementSystem (pure TS) and the result is applied here to the camera
 * and mesh.
 */

import * as THREE from 'three';

export interface PlayerStats {
  health: number;
  maxHealth: number;
  oxygen: number;
  maxOxygen: number;
}

export class Player {
  // --- Three.js objects ---
  readonly camera: THREE.PerspectiveCamera;
  readonly mesh: THREE.Group;

  // --- Position / velocity (XZ plane) ---
  /** Position on the XZ plane. */
  x = 0;
  z = 0;
  /** Y rotation in radians (facing direction). */
  rotation = 0;
  /** Velocity in units/second. */
  vx = 0;
  vz = 0;

  // --- Collision ---
  readonly radius = 0.5;

  // --- Vitals ---
  stats: PlayerStats = {
    health: 100,
    maxHealth: 100,
    oxygen: 100,
    maxOxygen: 100,
  };

  /** Sprint speed multiplier when running. */
  private readonly walkSpeed = 5;
  private readonly runMultiplier = 1.8;

  // Camera follow offset (third-person)
  private readonly camHeight = 1.6; // eye height for FPS-style
  private readonly camDistance = 4; // third-person distance

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.mesh = this.createMesh();
    this.syncCamera();
  }

  /**
   * Apply a movement direction (normalized) for this frame.
   * Sets velocity based on walk/run speed.
   */
  setMoveDirection(dx: number, dz: number, running: boolean): void {
    const speed = running ? this.walkSpeed * this.runMultiplier : this.walkSpeed;
    this.vx = dx * speed;
    this.vz = dz * speed;

    // Update facing direction if moving
    if (dx !== 0 || dz !== 0) {
      this.rotation = Math.atan2(dx, dz);
    }
  }

  /** Stop movement (no input). */
  stop(): void {
    this.vx = 0;
    this.vz = 0;
  }

  /**
   * Apply resolved position from MovementSystem and sync Three.js objects.
   * Called after MovementSystem.move() returns a result.
   */
  applyPosition(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.syncCamera();
  }

  /** Synchronise the Three.js camera and mesh to the logical position. */
  syncCamera(): void {
    // Mesh at player position
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.rotation;

    // Camera behind and above (third-person)
    const camX = this.x - Math.sin(this.rotation) * this.camDistance;
    const camZ = this.z - Math.cos(this.rotation) * this.camDistance;
    this.camera.position.set(camX, this.camHeight + 2, camZ);
    this.camera.lookAt(this.x, this.camHeight, this.z);
  }

  /** Damage the player. */
  takeDamage(amount: number): void {
    this.stats.health = Math.max(0, this.stats.health - amount);
  }

  /** Consume oxygen (e.g. in vacuum/hazard zones). */
  consumeOxygen(amount: number): void {
    this.stats.oxygen = Math.max(0, this.stats.oxygen - amount);
  }

  /** Restore oxygen. */
  restoreOxygen(amount: number): void {
    this.stats.oxygen = Math.min(this.stats.maxOxygen, this.stats.oxygen + amount);
  }

  /** Heal the player. */
  heal(amount: number): void {
    this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + amount);
  }

  get isAlive(): boolean {
    return this.stats.health > 0;
  }

  get isSuffocating(): boolean {
    return this.stats.oxygen <= 0;
  }

  private createMesh(): THREE.Group {
    const group = new THREE.Group();

    // Body — capsule-ish (cylinder + sphere)
    const bodyGeo = new THREE.CylinderGeometry(0.35, 0.35, 1.4, 8);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x226688,
      emissive: 0x002233,
      roughness: 0.6,
      metalness: 0.3,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.7;
    group.add(body);

    // Head — sphere
    const headGeo = new THREE.SphereGeometry(0.25, 8, 6);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x334455,
      emissive: 0x001122,
      roughness: 0.5,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.6;
    group.add(head);

    // Visor glow (small emissive box facing forward)
    const visorGeo = new THREE.BoxGeometry(0.3, 0.08, 0.05);
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x00ffe0,
      emissive: 0x00ffe0,
      emissiveIntensity: 1.5,
    });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.6, -0.22);
    group.add(visor);

    return group;
  }
}