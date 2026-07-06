/**
 * VfxSystem — pooled visual effects for combat and atmosphere.
 *
 * Damage numbers, projectile trails, hit flashes, death bursts, and
 * ambient sparks. All effects are auto-cleaned after their lifetime.
 */

import * as THREE from 'three';
import { DamageSchool, type Vec3 } from '../../world_api';

const SCHOOL_COLORS: Record<DamageSchool, number> = {
  [DamageSchool.Kinetic]: 0xffaa44,
  [DamageSchool.Energy]: 0x44aaff,
  [DamageSchool.Fire]: 0xff4422,
  [DamageSchool.Cryo]: 0x88ddff,
  [DamageSchool.Shock]: 0xffff44,
  [DamageSchool.Bio]: 0x44ff44,
};

interface ActiveEffect {
  object: THREE.Object3D;
  lifetime: number;
  age: number;
  updateFn: (effect: ActiveEffect, dt: number) => void;
  disposeFn: () => void;
}

export class VfxSystem {
  private scene: THREE.Scene;
  private effects: ActiveEffect[] = [];
  private sharedSphereGeo: THREE.SphereGeometry;
  private camera: THREE.Camera | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.sharedSphereGeo = new THREE.SphereGeometry(1, 8, 6);
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  // ---- Damage Numbers ----

  spawnDamageNumber(pos: Vec3, amount: number, school: DamageSchool): void {
    const color = SCHOOL_COLORS[school] ?? 0xffffff;
    const hex = `#${color.toString(16).padStart(6, '0')}`;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.font = 'bold 42px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    ctx.strokeText(String(Math.round(amount)), 64, 32);
    ctx.fillStyle = hex;
    ctx.fillText(String(Math.round(amount)), 64, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 1.0,
      depthTest: true,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(pos.x, pos.y + 1.5, pos.z);
    sprite.scale.set(0.8, 0.4, 1);
    this.scene.add(sprite);

    const drift = (Math.random() - 0.5) * 0.5;

    this.effects.push({
      object: sprite,
      lifetime: 1.3,
      age: 0,
      updateFn: (eff, dt) => {
        const t = eff.age / eff.lifetime;
        sprite.position.y += dt * 1.5;
        sprite.position.x += drift * dt;
        material.opacity = 1.0 - t * t;
        const s = 0.8 + t * 0.3;
        sprite.scale.set(s, s * 0.5, 1);
      },
      disposeFn: () => {
        this.scene.remove(sprite);
        material.dispose();
        texture.dispose();
      },
    });
  }

  // ---- Projectiles ----

  spawnProjectile(from: Vec3, to: Vec3, school: DamageSchool): void {
    const color = SCHOOL_COLORS[school] ?? 0x44aaff;
    const fromV = new THREE.Vector3(from.x, from.y + 0.8, from.z);
    const toV = new THREE.Vector3(to.x, to.y + 0.8, to.z);
    const dist = fromV.distanceTo(toV);
    const speed = 18;
    const lifetime = Math.max(dist / speed, 0.08);

    // Core projectile
    const coreMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const core = new THREE.Mesh(this.sharedSphereGeo, coreMat);
    core.scale.setScalar(0.15);
    core.position.copy(fromV);
    this.scene.add(core);

    // Glow halo
    const glowMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glow = new THREE.Mesh(this.sharedSphereGeo, glowMat);
    glow.scale.setScalar(0.35);
    glow.position.copy(fromV);
    this.scene.add(glow);

    // Trail
    const trailCount = 8;
    const trailGeo = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(trailCount * 3);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trailMat = new THREE.PointsMaterial({
      color, size: 0.15, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const trail = new THREE.Points(trailGeo, trailMat);
    this.scene.add(trail);

    const trailHistory: THREE.Vector3[] = [];
    for (let i = 0; i < trailCount; i++) trailHistory.push(fromV.clone());

    this.effects.push({
      object: core,
      lifetime,
      age: 0,
      updateFn: (eff, _dt) => {
        const t = eff.age / eff.lifetime;
        const pos = fromV.clone().lerp(toV, t);
        core.position.copy(pos);
        glow.position.copy(pos);

        trailHistory.unshift(pos.clone());
        if (trailHistory.length > trailCount) trailHistory.pop();
        for (let i = 0; i < trailCount; i++) {
          trailPositions[i * 3] = trailHistory[i].x;
          trailPositions[i * 3 + 1] = trailHistory[i].y;
          trailPositions[i * 3 + 2] = trailHistory[i].z;
        }
        (trailGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        trailMat.opacity = 0.6 * (1 - t);
      },
      disposeFn: () => {
        this.scene.remove(core);
        this.scene.remove(glow);
        this.scene.remove(trail);
        coreMat.dispose();
        glowMat.dispose();
        trailMat.dispose();
        trailGeo.dispose();
      },
    });
  }

  // ---- Hit Flash ----

  spawnHitFlash(pos: Vec3): void {
    const light = new THREE.PointLight(0xff6644, 6, 8, 2);
    light.position.set(pos.x, pos.y + 1, pos.z);
    this.scene.add(light);

    const ringGeo = new THREE.RingGeometry(0.3, 0.5, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff8844,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(pos.x, pos.y + 1, pos.z);
    if (this.camera) ring.lookAt(this.camera.position);
    this.scene.add(ring);

    this.effects.push({
      object: light,
      lifetime: 0.35,
      age: 0,
      updateFn: (eff, _dt) => {
        const t = eff.age / eff.lifetime;
        light.intensity = 6 * (1 - t);
        ring.scale.setScalar(1 + t * 3);
        ringMat.opacity = 0.8 * (1 - t);
        if (this.camera) ring.lookAt(this.camera.position);
      },
      disposeFn: () => {
        this.scene.remove(light);
        this.scene.remove(ring);
        ringMat.dispose();
        ringGeo.dispose();
      },
    });
  }

  // ---- Death Burst ----

  spawnDeath(pos: Vec3): void {
    const particleCount = 24;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y + 0.8;
      positions[i * 3 + 2] = pos.z;
      const angle = Math.random() * Math.PI * 2;
      const upward = Math.random() * 0.5 + 0.3;
      const speed = Math.random() * 3 + 2;
      velocities.push(new THREE.Vector3(
        Math.cos(angle) * speed,
        upward * speed,
        Math.sin(angle) * speed,
      ));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xff4422,
      size: 0.18,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);

    this.effects.push({
      object: points,
      lifetime: 0.9,
      age: 0,
      updateFn: (eff, dt) => {
        const t = eff.age / eff.lifetime;
        for (let i = 0; i < particleCount; i++) {
          velocities[i].y -= dt * 4; // gravity
          positions[i * 3] += velocities[i].x * dt;
          positions[i * 3 + 1] += velocities[i].y * dt;
          positions[i * 3 + 2] += velocities[i].z * dt;
        }
        (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        mat.opacity = 1.0 - t;
        mat.size = 0.18 * (1 - t * 0.5);
      },
      disposeFn: () => {
        this.scene.remove(points);
        mat.dispose();
        geo.dispose();
      },
    });
  }

  // ---- Ambient Sparks ----

  spawnSparks(pos: Vec3, count = 8): void {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x + (Math.random() - 0.5) * 0.3;
      positions[i * 3 + 1] = pos.y + Math.random() * 0.3;
      positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.3;
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2 + 1;
      velocities.push(new THREE.Vector3(
        Math.cos(angle) * speed,
        Math.random() * 2 + 0.5,
        Math.sin(angle) * speed,
      ));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xffaa44,
      size: 0.08,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);

    this.effects.push({
      object: points,
      lifetime: 0.5,
      age: 0,
      updateFn: (eff, dt) => {
        const t = eff.age / eff.lifetime;
        for (let i = 0; i < count; i++) {
          velocities[i].y -= dt * 6;
          positions[i * 3] += velocities[i].x * dt;
          positions[i * 3 + 1] += velocities[i].y * dt;
          positions[i * 3 + 2] += velocities[i].z * dt;
        }
        (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        mat.opacity = 1.0 - t;
      },
      disposeFn: () => {
        this.scene.remove(points);
        mat.dispose();
        geo.dispose();
      },
    });
  }

  // ---- Update / Cleanup ----

  update(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const eff = this.effects[i];
      eff.age += dt;
      if (eff.age >= eff.lifetime) {
        eff.disposeFn();
        this.effects.splice(i, 1);
      } else {
        eff.updateFn(eff, dt);
      }
    }
  }

  dispose(): void {
    for (const eff of this.effects) {
      eff.disposeFn();
    }
    this.effects = [];
    this.sharedSphereGeo.dispose();
  }
}