/**
 * Corridor — a rectangular passageway connecting two rooms.
 *
 * A corridor is defined by its two endpoints (the door centres it
 * connects) and a width. It builds a floor plus two side walls (running
 * parallel to the corridor's main axis). The corridor is assumed to be
 * axis-aligned (horizontal along X or along Z), which the StationGenerator
 * guarantees by only placing corridors that share an axis.
 *
 * Addresses issue #5 (Procedural Station Generation).
 */

import * as THREE from 'three';
import type { DoorSide } from './Room.js';

export interface CorridorOptions {
  /** World X of the first endpoint (room A door centre). */
  x1: number;
  /** World Z of the first endpoint. */
  z1: number;
  /** World X of the second endpoint (room B door centre). */
  x2: number;
  /** World Z of the second endpoint. */
  z2: number;
  /** Corridor interior width. */
  width?: number;
  /** Wall height. */
  wallHeight?: number;
  /** Wall thickness. */
  wallThickness?: number;
}

export class Corridor {
  readonly x1: number;
  readonly z1: number;
  readonly x2: number;
  readonly z2: number;
  readonly width: number;
  readonly wallHeight: number;
  readonly wallThickness: number;

  private _mesh: THREE.Group | null = null;

  constructor(opts: CorridorOptions) {
    this.x1 = opts.x1;
    this.z1 = opts.z1;
    this.x2 = opts.x2;
    this.z2 = opts.z2;
    this.width = opts.width ?? 2;
    this.wallHeight = opts.wallHeight ?? 3;
    this.wallThickness = opts.wallThickness ?? 0.2;
  }

  /** True if the corridor runs along the X axis (z1 === z2). */
  get isHorizontal(): boolean { return this.z1 === this.z2; }

  /** True if the corridor runs along the Z axis (x1 === x2). */
  get isVertical(): boolean { return this.x1 === this.x2; }

  /** Length along the corridor's main axis. */
  get length(): number {
    if (this.isHorizontal) return Math.abs(this.x2 - this.x1);
    return Math.abs(this.z2 - this.z1);
  }

  /** Midpoint of the corridor. */
  get center(): { x: number; z: number } {
    return { x: (this.x1 + this.x2) / 2, z: (this.z1 + this.z2) / 2 };
  }

  /**
   * The side of room A that this corridor exits from, inferred from the
   * direction from (x1,z1) to (x2,z2).
   */
  get startSide(): DoorSide {
    if (this.isHorizontal) return this.x2 > this.x1 ? 'east' : 'west';
    return this.z2 > this.z1 ? 'north' : 'south';
  }

  /** The side of room B this corridor arrives at. */
  get endSide(): DoorSide {
    if (this.isHorizontal) return this.x2 > this.x1 ? 'west' : 'east';
    return this.z2 > this.z1 ? 'south' : 'north';
  }

  /**
   * Build the Three.js mesh: a floor rectangle plus two side walls
   * running along the corridor. The corridor is axis-aligned, so the
   * geometry is straightforward. The group is cached.
   */
  buildMesh(): THREE.Group {
    if (this._mesh) return this._mesh;

    const group = new THREE.Group();
    const { x: cx, z: cz } = this.center;
    const w = this.width;
    const h = this.wallHeight;
    const t = this.wallThickness;

    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x141420,
      roughness: 0.9,
      metalness: 0.2,
    });
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x222233,
      roughness: 0.75,
      metalness: 0.25,
    });

    if (this.isHorizontal) {
      // Floor runs along X
      const floorGeo = new THREE.PlaneGeometry(this.length, w);
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(cx, 0, cz);
      group.add(floor);

      // Two walls parallel to X, offset in Z by ±w/2
      for (const dz of [-w / 2, w / 2]) {
        const wallGeo = new THREE.BoxGeometry(this.length, h, t);
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(cx, h / 2, cz + dz);
        group.add(wall);
      }
    } else {
      // Floor runs along Z
      const floorGeo = new THREE.PlaneGeometry(w, this.length);
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(cx, 0, cz);
      group.add(floor);

      // Two walls parallel to Z, offset in X by ±w/2
      for (const dx of [-w / 2, w / 2]) {
        const wallGeo = new THREE.BoxGeometry(t, h, this.length);
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(cx + dx, h / 2, cz);
        group.add(wall);
      }
    }

    this._mesh = group;
    return group;
  }

  /** Dispose GPU resources for this corridor's mesh. */
  disposeMesh(): void {
    if (!this._mesh) return;
    this._mesh.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach(mm => mm.dispose());
      else if (m) m.dispose();
    });
    this._mesh = null;
  }
}