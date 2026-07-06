/**
 * MainScene — basic Three.js scene setup for DERELICT.
 *
 * Owns the THREE.Scene, camera, WebGL renderer, lights, floor, and a
 * few obstacle boxes for collision testing. Exposes an update() method
 * that drives the Player + MovementSystem each frame.
 *
 * This is a standalone, self-contained scene that can run independently
 * of the full Sim/Renderer pipeline (src/main.ts). It is the "foundation"
 * entry point that exercises the new Player, MovementSystem, and HUD.
 */

import * as THREE from 'three';
import { Player } from '../entities/Player.js';
import { MovementSystem, type CircleCollider, type RectCollider, type BoundsCollider } from '../systems/MovementSystem.js';
import { HUD } from '../ui/HUD.js';

export class MainScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  readonly player: Player;
  readonly movement: MovementSystem;
  readonly hud: HUD;

  /** Static obstacles for collision testing. */
  private obstacleMeshes: THREE.Mesh[] = [];
  private rectColliders: RectCollider[] = [];
  private circleColliders: CircleCollider[] = [];

  /** World bounds (playable area). */
  private readonly bounds: BoundsCollider = { halfWidth: 25, halfDepth: 25 };

  // Input state
  private keysDown = new Set<string>();

  constructor(canvas: HTMLCanvasElement, hudRoot: HTMLElement) {
    // --- Renderer ---
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x050608, 1);

    // --- Scene ---
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x050608, 0.018);

    // --- Camera ---
    this.camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );

    // --- Lights ---
    const ambient = new THREE.AmbientLight(0x223344, 0.5);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0x8899bb, 0.6);
    dir.position.set(5, 12, 8);
    this.scene.add(dir);

    // Emergency red point light for atmosphere
    const emergency = new THREE.PointLight(0xff2222, 0.8, 30, 2);
    emergency.position.set(0, 4, 0);
    this.scene.add(emergency);

    // --- Floor ---
    const floorGeo = new THREE.PlaneGeometry(
      this.bounds.halfWidth * 2,
      this.bounds.halfDepth * 2,
    );
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a24,
      roughness: 0.85,
      metalness: 0.2,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Grid for orientation
    const grid = new THREE.GridHelper(
      this.bounds.halfWidth * 2,
      20,
      0x224466,
      0x112233,
    );
    grid.position.y = 0.01;
    this.scene.add(grid);

    // --- Player ---
    this.player = new Player(this.camera);
    this.scene.add(this.player.mesh);

    // --- Movement system ---
    this.movement = new MovementSystem();

    // --- HUD ---
    this.hud = new HUD(hudRoot);

    // --- Obstacles (for collision testing) ---
    this.createObstacles();

    // --- Input listeners ---
    this.bindInput();
    window.addEventListener('resize', this.onResize);
  }

  // ----------------------------------------------------------
  // Obstacles
  // ----------------------------------------------------------

  private createObstacles(): void {
    // A few box pillars (rect colliders) scattered around
    const pillarPositions: Array<[number, number, number, number]> = [
      // [x, z, halfW, halfD]
      [8, 8, 1, 1],
      [-6, 10, 1.5, 0.8],
      [12, -5, 0.8, 1.5],
      [-10, -8, 1, 1],
      [0, 15, 2, 0.6],
    ];

    for (const [x, z, hw, hd] of pillarPositions) {
      const geo = new THREE.BoxGeometry(hw * 2, 4, hd * 2);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x334455,
        roughness: 0.7,
        metalness: 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 2, z);
      this.scene.add(mesh);
      this.obstacleMeshes.push(mesh);
      this.rectColliders.push({ x, z, halfWidth: hw, halfDepth: hd });
    }

    // A couple of circular hazards (e.g. glowing canisters)
    const canisterPositions: Array<[number, number, number]> = [
      // [x, z, radius]
      [5, -3, 0.6],
      [-8, 3, 0.7],
    ];
    for (const [x, z, r] of canisterPositions) {
      const geo = new THREE.CylinderGeometry(r, r, 1.5, 12);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        emissive: 0x553300,
        emissiveIntensity: 0.5,
        roughness: 0.5,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 0.75, z);
      this.scene.add(mesh);
      this.circleColliders.push({ x, z, radius: r });
    }
  }

  // ----------------------------------------------------------
  // Input
  // ----------------------------------------------------------

  private bindInput(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const gameKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'];
    if (gameKeys.includes(e.code)) e.preventDefault();
    this.keysDown.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code);
  };

  private onBlur = (): void => {
    this.keysDown.clear();
  };

  // ----------------------------------------------------------
  // Main update — call every frame with dt in seconds
  // ----------------------------------------------------------

  update(dt: number): void {
    // Read WASD input
    const dir = MovementSystem.directionFromInput(
      this.keysDown.has('KeyW'),
      this.keysDown.has('KeyS'),
      this.keysDown.has('KeyA'),
      this.keysDown.has('KeyD'),
    );

    const running = this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight');

    if (dir.x !== 0 || dir.z !== 0) {
      this.player.setMoveDirection(dir.x, dir.z, running);
    } else {
      this.player.stop();
    }

    // Resolve movement with collisions
    const pos = { x: this.player.x, z: this.player.z };
    const vel = { x: this.player.vx, z: this.player.vz };
    const result = this.movement.move(
      pos,
      vel,
      this.player.radius,
      dt,
      this.circleColliders,
      this.rectColliders,
      this.bounds,
    );

    this.player.applyPosition(result.x, result.z);

    // Slowly drain oxygen (atmospheric survival flavour)
    this.player.consumeOxygen(0.2 * dt);

    // Update HUD
    this.hud.update({
      health: this.player.stats.health,
      maxHealth: this.player.stats.maxHealth,
      oxygen: this.player.stats.oxygen,
      maxOxygen: this.player.stats.maxOxygen,
    });

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  // ----------------------------------------------------------
  // Teardown
  // ----------------------------------------------------------

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('blur', this.onBlur);
    this.renderer.dispose();
  }
}