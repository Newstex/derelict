/**
 * AmbientSystem — ambient atmosphere for DERELICT.
 *
 * Dust motes, steam puffs from pipes, and a CSS scanline/vignette overlay
 * for the retro-sci-fi horror tone.
 */

import * as THREE from 'three';

interface SteamPuff {
  points: THREE.Points;
  geo: THREE.BufferGeometry;
  mat: THREE.PointsMaterial;
  velocities: THREE.Vector3[];
  lifetime: number;
  age: number;
}

export class AmbientSystem {
  private scene: THREE.Scene;
  private dust: THREE.Points;
  private dustVelocities: Float32Array;
  private dustCount = 250;
  private dustBounds: THREE.Vector3;
  private dustCenter = new THREE.Vector3(0, 4, 0);

  private steamTimer = 0;
  private steamInterval = 2.0;
  private steamSources: THREE.Vector3[] = [];
  private steamPuffs: SteamPuff[] = [];

  private overlay: HTMLDivElement | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.dustBounds = new THREE.Vector3(40, 6, 40);
    this.dustVelocities = new Float32Array(this.dustCount * 3);
    this.dust = this.createDust();
    this.scene.add(this.dust);
    this.createOverlay();
  }

  // ---- Dust Motes ----

  private createDust(): THREE.Points {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.dustCount * 3);

    for (let i = 0; i < this.dustCount; i++) {
      positions[i * 3] = this.dustCenter.x + (Math.random() - 0.5) * this.dustBounds.x;
      positions[i * 3 + 1] = this.dustCenter.y + Math.random() * this.dustBounds.y;
      positions[i * 3 + 2] = this.dustCenter.z + (Math.random() - 0.5) * this.dustBounds.z;
      this.dustVelocities[i * 3] = (Math.random() - 0.5) * 0.08;
      this.dustVelocities[i * 3 + 1] = Math.random() * 0.03 + 0.005;
      this.dustVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.08;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x8899bb,
      size: 0.035,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    return new THREE.Points(geo, mat);
  }

  /** Update the dust field center (e.g. follow the player). */
  setDustCenter(center: THREE.Vector3): void {
    this.dustCenter.copy(center);
  }

  // ---- Steam ----

  addSteamSource(pos: THREE.Vector3): void {
    this.steamSources.push(pos.clone());
  }

  clearSteamSources(): void {
    this.steamSources = [];
  }

  private spawnSteamPuff(pos: THREE.Vector3): void {
    const count = 14;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x + (Math.random() - 0.5) * 0.2;
      positions[i * 3 + 1] = pos.y + Math.random() * 0.2;
      positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.2;
      velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        Math.random() * 0.4 + 0.2,
        (Math.random() - 0.5) * 0.3,
      ));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xaabbcc,
      size: 0.15,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.steamPuffs.push({ points, geo, mat, velocities, lifetime: 1.8, age: 0 });
  }

  // ---- CSS Overlay ----

  private createOverlay(): void {
    const div = document.createElement('div');
    div.id = 'derelict-vfx-overlay';
    div.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:100%',
      'height:100%',
      'pointer-events:none',
      'z-index:10',
      'background:radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)',
      'background-repeat:no-repeat',
    ].join(';');

    // Scanlines via an additional pseudo-element is not possible on a plain div,
    // so we layer a second element for scanlines.
    const scan = document.createElement('div');
    scan.id = 'derelict-scanlines';
    scan.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:100%',
      'height:100%',
      'pointer-events:none',
      'z-index:11',
      'background:repeating-linear-gradient(0deg, rgba(0,0,0,0.07) 0px, rgba(0,0,0,0.07) 1px, transparent 1px, transparent 3px)',
      'mix-blend-mode:multiply',
    ].join(';');

    document.body.appendChild(div);
    document.body.appendChild(scan);
    this.overlay = div;
  }

  // ---- Update ----

  update(dt: number): void {
    // Dust motes
    const posAttr = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    for (let i = 0; i < this.dustCount; i++) {
      positions[i * 3] += this.dustVelocities[i * 3] * dt;
      positions[i * 3 + 1] += this.dustVelocities[i * 3 + 1] * dt;
      positions[i * 3 + 2] += this.dustVelocities[i * 3 + 2] * dt;

      // Wrap vertically
      if (positions[i * 3 + 1] > this.dustCenter.y + this.dustBounds.y) {
        positions[i * 3] = this.dustCenter.x + (Math.random() - 0.5) * this.dustBounds.x;
        positions[i * 3 + 1] = this.dustCenter.y;
        positions[i * 3 + 2] = this.dustCenter.z + (Math.random() - 0.5) * this.dustBounds.z;
      }
      // Wrap horizontally
      const dx = positions[i * 3] - this.dustCenter.x;
      const dz = positions[i * 3 + 2] - this.dustCenter.z;
      if (Math.abs(dx) > this.dustBounds.x / 2) {
        positions[i * 3] = this.dustCenter.x - Math.sign(dx) * this.dustBounds.x / 2;
      }
      if (Math.abs(dz) > this.dustBounds.z / 2) {
        positions[i * 3 + 2] = this.dustCenter.z - Math.sign(dz) * this.dustBounds.z / 2;
      }
    }
    posAttr.needsUpdate = true;

    // Steam spawning
    this.steamTimer += dt;
    if (this.steamTimer >= this.steamInterval && this.steamSources.length > 0) {
      this.steamTimer = 0;
      this.steamInterval = 1.5 + Math.random() * 3;
      const src = this.steamSources[Math.floor(Math.random() * this.steamSources.length)];
      this.spawnSteamPuff(src);
    }

    // Update existing steam puffs
    for (let i = this.steamPuffs.length - 1; i >= 0; i--) {
      const puff = this.steamPuffs[i];
      puff.age += dt;
      const t = puff.age / puff.lifetime;

      const pAttr = puff.geo.getAttribute('position') as THREE.BufferAttribute;
      const pArr = pAttr.array as Float32Array;
      for (let j = 0; j < puff.velocities.length; j++) {
        pArr[j * 3] += puff.velocities[j].x * dt;
        pArr[j * 3 + 1] += puff.velocities[j].y * dt;
        pArr[j * 3 + 2] += puff.velocities[j].z * dt;
        puff.velocities[j].multiplyScalar(0.96);
      }
      pAttr.needsUpdate = true;
      puff.mat.opacity = 0.35 * (1 - t);
      puff.mat.size = 0.15 + t * 0.3;

      if (puff.age >= puff.lifetime) {
        this.scene.remove(puff.points);
        puff.mat.dispose();
        puff.geo.dispose();
        this.steamPuffs.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this.scene.remove(this.dust);
    (this.dust.geometry as THREE.BufferGeometry).dispose();
    (this.dust.material as THREE.Material).dispose();

    for (const puff of this.steamPuffs) {
      this.scene.remove(puff.points);
      puff.mat.dispose();
      puff.geo.dispose();
    }
    this.steamPuffs = [];

    // Remove overlay elements
    const overlay = document.getElementById('derelict-vfx-overlay');
    if (overlay?.parentElement) overlay.parentElement.removeChild(overlay);
    const scan = document.getElementById('derelict-scanlines');
    if (scan?.parentElement) scan.parentElement.removeChild(scan);
    this.overlay = null;
  }
}