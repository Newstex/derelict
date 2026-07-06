/**
 * CameraController — third-person camera that follows the player.
 *
 * Uses Three.js. Smoothly follows player entity position.
 * Mouse drag to orbit (wired via InputHandler callbacks),
 * scroll to zoom. Pitch clamped to prevent ground/ceiling clip.
 */

import * as THREE from 'three';
import { type IWorld, GamePhase } from '../world_api.js';

// Pitch limits (radians). 0 = horizontal, positive = looking down.
const PITCH_MIN = -0.2;   // can't look up much beyond horizontal
const PITCH_MAX = 1.2;    // can look down but not through floor

const DISTANCE_MIN = 4;
const DISTANCE_MAX = 20;
const DISTANCE_DEFAULT = 12;

const SMOOTHING = 6.0; // higher = snappier follow

export class CameraController {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly world: IWorld;

  // Orbit state
  private yaw = 0;
  private pitch = 0.45;
  private distance = DISTANCE_DEFAULT;

  // Smoothed camera target
  private targetPos = new THREE.Vector3();
  private smoothedPos = new THREE.Vector3();
  private initialized = false;

  // Temp vectors (avoid per-frame allocation)
  private tmpDir = new THREE.Vector3();
  private tmpTarget = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, world: IWorld) {
    this.camera = camera;
    this.world = world;
  }

  /** Apply a mouse drag delta to orbit the camera. */
  applyDrag(dx: number, dy: number): void {
    const sensitivity = 0.005;
    this.yaw -= dx * sensitivity;
    this.pitch += dy * sensitivity;
    this.clampPitch();
  }

  /** Apply a scroll delta to zoom. */
  applyZoom(delta: number): void {
    // delta > 0 = scroll down = zoom out
    this.distance += delta * 0.01;
    this.distance = Math.max(DISTANCE_MIN, Math.min(DISTANCE_MAX, this.distance));
  }

  private clampPitch(): void {
    if (this.pitch < PITCH_MIN) this.pitch = PITCH_MIN;
    if (this.pitch > PITCH_MAX) this.pitch = PITCH_MAX;
  }

  /** Per-frame update. dt in seconds. */
  update(dt: number): void {
    if (this.world.phase !== GamePhase.Playing && this.world.phase !== GamePhase.Paused) {
      return;
    }

    let playerPos: THREE.Vector3 | null = null;
    try {
      const player = this.world.getPlayer();
      if (player) {
        playerPos = this.targetPos.set(player.pos.x, player.pos.y, player.pos.z);
      }
    } catch {
      playerPos = null;
    }

    if (!playerPos) return;

    // Initialize smoothed position on first run
    if (!this.initialized) {
      this.smoothedPos.copy(playerPos);
      this.initialized = true;
    }

    // Smooth follow
    const t = Math.min(1, dt * SMOOTHING);
    this.smoothedPos.lerp(playerPos, t);

    // Spherical → cartesian offset
    const cp = Math.cos(this.pitch);
    this.tmpDir.set(
      Math.sin(this.yaw) * cp,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cp,
    );
    this.tmpDir.multiplyScalar(this.distance);

    // Camera positioned behind+above target
    this.tmpTarget.copy(this.smoothedPos).sub(this.tmpDir);

    // Lift camera slightly above player origin for better framing
    this.tmpTarget.y += 1.5;

    this.camera.position.copy(this.tmpTarget);
    this.camera.lookAt(this.smoothedPos.x, this.smoothedPos.y + 1.0, this.smoothedPos.z);
  }

  destroy(): void {
    // Nothing to clean up — no listeners added (InputHandler drives drag/zoom).
  }
}