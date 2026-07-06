/**
 * StationBuilder — procedural station geometry from Zone data.
 *
 * Builds corridor walls, floor panels, ceiling, doors, emergency light
 * fixtures, room structures, and hazard visuals from the Zone's rooms
 * and hazards. All geometry is composed from Three.js primitives —
 * no shipped 3D assets.
 */

import * as THREE from 'three';
import {
  HazardType,
  RoomType,
  StationBiome,
  type Hazard,
  type Room,
  type Zone,
} from '../../world_api';
import { biomeAccentColor } from '../effects/lighting';

const WALL_HEIGHT = 3.8;
const WALL_THICKNESS = 0.25;
const DOOR_WIDTH = 2.0;

export class StationBuilder {
  private zoneObjects: THREE.Object3D[] = [];
  private lightPositions: THREE.Vector3[] = [];
  private hazardUpdaters: Array<(dt: number) => void> = [];
  private time = 0;

  /** Positions where emergency lights were placed during buildZone. */
  getLightPositions(): THREE.Vector3[] {
    return this.lightPositions;
  }

  // ---- Zone Lifecycle ----

  buildZone(zone: Zone, scene: THREE.Scene): void {
    this.lightPositions = [];
    this.hazardUpdaters = [];
    this.time = 0;

    const accent = biomeAccentColor(zone.biome);
    const wallColor = 0x2a2e36;
    const floorColor = 0x1a1e26;
    const ceilingColor = 0x15181f;

    this.buildFloorCeiling(zone, scene, floorColor, ceilingColor, accent.getHex());
    this.buildOuterWalls(zone, scene, wallColor, accent.getHex());

    for (const room of zone.rooms) {
      this.buildRoom(room, scene, wallColor, accent);
    }

    for (const hazard of zone.hazards) {
      this.buildHazard(hazard, scene);
    }
  }

  clearZone(scene: THREE.Scene): void {
    for (const obj of this.zoneObjects) {
      scene.remove(obj);
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          const mat = child.material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
          } else if (mat) {
            (mat as THREE.Material).dispose();
          }
        }
      });
    }
    this.zoneObjects = [];
    this.lightPositions = [];
    this.hazardUpdaters = [];
  }

  update(dt: number): void {
    this.time += dt;
    for (const updater of this.hazardUpdaters) {
      updater(dt);
    }
  }

  // ---- Floor & Ceiling ----

  private buildFloorCeiling(
    zone: Zone,
    scene: THREE.Scene,
    floorColor: number,
    ceilingColor: number,
    panelColor: number,
  ): void {
    const { width, depth } = zone.bounds;

    // Floor
    const floorGeo = new THREE.PlaneGeometry(width, depth);
    const floorMat = new THREE.MeshStandardMaterial({
      color: floorColor, roughness: 0.8, metalness: 0.5,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    this.zoneObjects.push(floor);

    // Floor emissive panel strips
    const stripSpacing = 4;
    const stripCount = Math.max(1, Math.floor(width / stripSpacing));
    for (let i = 0; i < stripCount; i++) {
      const x = -width / 2 + (i + 0.5) * (width / stripCount);
      const stripGeo = new THREE.PlaneGeometry(0.08, depth);
      const stripMat = new THREE.MeshBasicMaterial({
        color: panelColor,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
      });
      const strip = new THREE.Mesh(stripGeo, stripMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(x, 0.01, 0);
      scene.add(strip);
      this.zoneObjects.push(strip);
    }

    // Ceiling
    const ceilingGeo = new THREE.PlaneGeometry(width, depth);
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: ceilingColor, roughness: 0.9, metalness: 0.3,
      side: THREE.DoubleSide,
    });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, WALL_HEIGHT, 0);
    scene.add(ceiling);
    this.zoneObjects.push(ceiling);
  }

  // ---- Walls ----

  private buildOuterWalls(
    zone: Zone,
    scene: THREE.Scene,
    wallColor: number,
    panelColor: number,
  ): void {
    const { width, depth } = zone.bounds;
    const h = WALL_HEIGHT;

    // North (-Z), South (+Z), East (+X), West (-X)
    this.buildWallWithDoor(scene, new THREE.Vector3(0, h / 2, -depth / 2), width, false, wallColor, panelColor);
    this.buildWallWithDoor(scene, new THREE.Vector3(0, h / 2, depth / 2), width, false, wallColor, panelColor);
    this.buildWallWithDoor(scene, new THREE.Vector3(width / 2, h / 2, 0), depth, true, wallColor, panelColor);
    this.buildWallWithDoor(scene, new THREE.Vector3(-width / 2, h / 2, 0), depth, true, wallColor, panelColor);
  }

  private buildWallWithDoor(
    scene: THREE.Scene,
    center: THREE.Vector3,
    length: number,
    rotated: boolean,
    wallColor: number,
    panelColor: number,
  ): void {
    const h = WALL_HEIGHT;
    const t = WALL_THICKNESS;
    const dw = DOOR_WIDTH;
    const segLen = (length - dw) / 2;

    if (segLen <= 0.5) {
      // Wall too short for a door opening — build solid
      this.addBox(scene, center, rotated ? t : length, h, rotated ? length : t, wallColor);
      return;
    }

    // Left segment
    const left = center.clone();
    if (rotated) left.z -= dw / 2 + segLen / 2;
    else left.x -= dw / 2 + segLen / 2;
    this.addBox(scene, left, rotated ? t : segLen, h, rotated ? segLen : t, wallColor);

    // Right segment
    const right = center.clone();
    if (rotated) right.z += dw / 2 + segLen / 2;
    else right.x += dw / 2 + segLen / 2;
    this.addBox(scene, right, rotated ? t : segLen, h, rotated ? segLen : t, wallColor);

    // Header above doorway
    const header = center.clone();
    header.y = h - 0.6;
    this.addBox(scene, header, rotated ? t : dw, 1.2, rotated ? dw : t, wallColor);

    // Emissive door light strip
    const strip = center.clone();
    strip.y = h - 0.5;
    this.addBox(
      scene,
      strip,
      rotated ? t + 0.02 : dw + 0.02,
      0.06,
      rotated ? dw + 0.02 : t + 0.02,
      panelColor,
      true,
    );
  }

  // ---- Rooms ----

  private buildRoom(
    room: Room,
    scene: THREE.Scene,
    wallColor: number,
    accent: THREE.Color,
  ): void {
    const { pos, width, depth } = room;
    const h = WALL_HEIGHT;

    // Room perimeter walls with door gaps
    this.buildWallWithDoor(scene, new THREE.Vector3(pos.x, h / 2, pos.z - depth / 2), width, false, wallColor, accent.getHex());
    this.buildWallWithDoor(scene, new THREE.Vector3(pos.x, h / 2, pos.z + depth / 2), width, false, wallColor, accent.getHex());
    this.buildWallWithDoor(scene, new THREE.Vector3(pos.x + width / 2, h / 2, pos.z), depth, true, wallColor, accent.getHex());
    this.buildWallWithDoor(scene, new THREE.Vector3(pos.x - width / 2, h / 2, pos.z), depth, true, wallColor, accent.getHex());

    // Emergency light fixture at room center
    const lightPos = new THREE.Vector3(pos.x, h - 0.3, pos.z);
    this.buildLightFixture(scene, lightPos, accent);
    this.lightPositions.push(lightPos);

    // Room-type-specific decorations
    this.buildRoomDecor(room, scene, accent);
  }

  private buildRoomDecor(room: Room, scene: THREE.Scene, accent: THREE.Color): void {
    switch (room.type) {
      case RoomType.Reactor:
        this.buildReactorCore(scene, room, accent);
        break;
      case RoomType.Medbay:
        this.buildMedbayDecor(scene, room, accent);
        break;
      case RoomType.Bridge:
        this.buildBridgeDecor(scene, room, accent);
        break;
      case RoomType.Storage:
      case RoomType.Armory:
        this.buildStorageDecor(scene, room);
        break;
      default:
        break;
    }
  }

  private buildReactorCore(scene: THREE.Scene, room: Room, accent: THREE.Color): void {
    const { pos } = room;

    const coreGeo = new THREE.CylinderGeometry(0.8, 1.0, 2.5, 16);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x333333, roughness: 0.4, metalness: 0.8,
      emissive: accent.getHex(), emissiveIntensity: 0.3,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(pos.x, 1.25, pos.z);
    scene.add(core);
    this.zoneObjects.push(core);

    const ringGeo = new THREE.TorusGeometry(1.2, 0.08, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: accent.getHex(), transparent: true, opacity: 0.5,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(pos.x, 1.5, pos.z);
    scene.add(ring);
    this.zoneObjects.push(ring);

    this.hazardUpdaters.push(() => {
      coreMat.emissiveIntensity = 0.3 + 0.2 * Math.sin(this.time * 3);
      ringMat.opacity = 0.35 + 0.25 * Math.sin(this.time * 2);
      ring.rotation.z += 0.005;
    });
  }

  private buildMedbayDecor(scene: THREE.Scene, room: Room, accent: THREE.Color): void {
    for (let i = 0; i < 2; i++) {
      const bx = room.pos.x + (i === 0 ? -1.5 : 1.5);
      const bz = room.pos.z;
      this.addBox(scene, new THREE.Vector3(bx, 0.4, bz), 1.0, 0.5, 2.0, 0x444444);
      this.addBox(scene, new THREE.Vector3(bx, 0.68, bz), 0.9, 0.1, 1.8, 0xdddddd);
      this.addBox(scene, new THREE.Vector3(bx, 0.74, bz), 0.8, 0.02, 1.7, accent.getHex(), true);
    }
  }

  private buildBridgeDecor(scene: THREE.Scene, room: Room, accent: THREE.Color): void {
    // Central console
    this.addBox(scene, new THREE.Vector3(room.pos.x, 0.6, room.pos.z), 2.0, 0.8, 1.5, 0x333344);
    this.addBox(scene, new THREE.Vector3(room.pos.x, 1.1, room.pos.z), 1.8, 0.3, 0.1, accent.getHex(), true);

    // Holographic display
    const holoGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.02, 24);
    const holoMat = new THREE.MeshBasicMaterial({
      color: accent.getHex(),
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
    });
    const holo = new THREE.Mesh(holoGeo, holoMat);
    holo.position.set(room.pos.x, 1.5, room.pos.z);
    scene.add(holo);
    this.zoneObjects.push(holo);

    this.hazardUpdaters.push(() => {
      holo.rotation.y += 0.01;
      holoMat.opacity = 0.2 + 0.15 * Math.sin(this.time * 3);
    });
  }

  private buildStorageDecor(scene: THREE.Scene, room: Room): void {
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const r = 1.5;
      const cx = room.pos.x + Math.cos(angle) * r;
      const cz = room.pos.z + Math.sin(angle) * r;
      this.addBox(scene, new THREE.Vector3(cx, 0.5, cz), 1.0, 1.0, 1.0, 0x554433);
    }
  }

  // ---- Light Fixtures ----

  private buildLightFixture(scene: THREE.Scene, pos: THREE.Vector3, accent: THREE.Color): void {
    // Housing
    const housingGeo = new THREE.BoxGeometry(0.6, 0.15, 0.3);
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x222222, roughness: 0.5, metalness: 0.8,
    });
    const housing = new THREE.Mesh(housingGeo, housingMat);
    housing.position.copy(pos);
    scene.add(housing);
    this.zoneObjects.push(housing);

    // Emissive strip
    const stripGeo = new THREE.BoxGeometry(0.5, 0.08, 0.2);
    const stripMat = new THREE.MeshBasicMaterial({
      color: accent.getHex(), transparent: true, opacity: 0.8,
    });
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.position.copy(pos);
    strip.position.y -= 0.05;
    scene.add(strip);
    this.zoneObjects.push(strip);
  }

  // ---- Hazards ----

  private buildHazard(hazard: Hazard, scene: THREE.Scene): void {
    switch (hazard.type) {
      case HazardType.Fire:
        this.buildFireHazard(scene, hazard);
        break;
      case HazardType.Electric:
        this.buildElectricHazard(scene, hazard);
        break;
      case HazardType.Radiation:
        this.buildRadiationHazard(scene, hazard);
        break;
      case HazardType.Vacuum:
        this.buildVacuumHazard(scene, hazard);
        break;
      case HazardType.Steam:
        this.buildSteamHazard(scene, hazard);
        break;
    }
  }

  private buildFireHazard(scene: THREE.Scene, hazard: Hazard): void {
    const { pos, radius } = hazard;
    const particleCount = 40;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.8;
      positions[i * 3] = pos.x + Math.cos(angle) * r;
      positions[i * 3 + 1] = pos.y + Math.random() * 0.3;
      positions[i * 3 + 2] = pos.z + Math.sin(angle) * r;
      velocities[i * 3] = (Math.random() - 0.5) * 0.3;
      velocities[i * 3 + 1] = Math.random() * 0.8 + 0.4;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xff4422, size: 0.25, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    this.zoneObjects.push(points);

    // Flickering point light
    const light = new THREE.PointLight(0xff6633, 3, radius * 3, 2);
    light.position.set(pos.x, pos.y + 0.5, pos.z);
    scene.add(light);
    this.zoneObjects.push(light);

    this.hazardUpdaters.push((dt) => {
      const arr = (geo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        arr[i * 3] += velocities[i * 3] * dt;
        arr[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        arr[i * 3 + 2] += velocities[i * 3 + 2] * dt;
        if (arr[i * 3 + 1] > pos.y + 1.5) {
          const angle = Math.random() * Math.PI * 2;
          const r = Math.random() * radius * 0.8;
          arr[i * 3] = pos.x + Math.cos(angle) * r;
          arr[i * 3 + 1] = pos.y;
          arr[i * 3 + 2] = pos.z + Math.sin(angle) * r;
        }
      }
      (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      light.intensity = 2 + Math.sin(this.time * 15) * 0.5 + Math.random() * 0.5;
    });
  }

  private buildElectricHazard(scene: THREE.Scene, hazard: Hazard): void {
    const { pos, radius } = hazard;
    const segmentCount = 20;
    const positions = new Float32Array(segmentCount * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.LineBasicMaterial({
      color: 0x66ddff, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
    const lines = new THREE.LineSegments(geo, mat);
    scene.add(lines);
    this.zoneObjects.push(lines);

    this.hazardUpdaters.push(() => {
      for (let i = 0; i < segmentCount; i++) {
        const a1 = Math.random() * Math.PI * 2;
        const a2 = Math.random() * Math.PI * 2;
        const r1 = Math.random() * radius;
        const r2 = Math.random() * radius;
        positions[i * 6] = pos.x + Math.cos(a1) * r1;
        positions[i * 6 + 1] = pos.y + Math.random() * 1.5;
        positions[i * 6 + 2] = pos.z + Math.sin(a1) * r1;
        positions[i * 6 + 3] = pos.x + Math.cos(a2) * r2;
        positions[i * 6 + 4] = pos.y + Math.random() * 1.5;
        positions[i * 6 + 5] = pos.z + Math.sin(a2) * r2;
      }
      (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      mat.opacity = 0.4 + Math.random() * 0.4;
    });
  }

  private buildRadiationHazard(scene: THREE.Scene, hazard: Hazard): void {
    const { pos, radius } = hazard;
    const geo = new THREE.SphereGeometry(radius, 16, 12);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x44ff22,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, pos.y + 0.5, pos.z);
    scene.add(mesh);
    this.zoneObjects.push(mesh);

    const light = new THREE.PointLight(0x44ff22, 1.5, radius * 2, 2);
    light.position.set(pos.x, pos.y + 0.5, pos.z);
    scene.add(light);
    this.zoneObjects.push(light);

    this.hazardUpdaters.push(() => {
      mat.opacity = 0.08 + 0.06 * Math.sin(this.time * 2);
      light.intensity = 1 + 0.5 * Math.sin(this.time * 3);
    });
  }

  private buildVacuumHazard(scene: THREE.Scene, hazard: Hazard): void {
    const { pos, radius } = hazard;
    const geo = new THREE.SphereGeometry(radius, 16, 12);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.7,
      side: THREE.BackSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, pos.y + 0.5, pos.z);
    scene.add(mesh);
    this.zoneObjects.push(mesh);

    // Distortion ring
    const ringGeo = new THREE.TorusGeometry(radius, 0.05, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x4466aa, transparent: true, opacity: 0.3,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(pos.x, pos.y + 0.5, pos.z);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    this.zoneObjects.push(ring);

    this.hazardUpdaters.push(() => {
      ring.rotation.z += 0.02;
      ringMat.opacity = 0.2 + 0.15 * Math.sin(this.time * 4);
    });
  }

  private buildSteamHazard(scene: THREE.Scene, hazard: Hazard): void {
    const { pos, radius } = hazard;
    const particleCount = 30;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = pos.x + (Math.random() - 0.5) * radius;
      positions[i * 3 + 1] = pos.y + Math.random() * 0.5;
      positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * radius;
      velocities[i * 3] = (Math.random() - 0.5) * 0.2;
      velocities[i * 3 + 1] = Math.random() * 0.3 + 0.1;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xbbccee, size: 0.2, transparent: true, opacity: 0.35,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    this.zoneObjects.push(points);

    this.hazardUpdaters.push((dt) => {
      const arr = (geo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        arr[i * 3] += velocities[i * 3] * dt;
        arr[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        arr[i * 3 + 2] += velocities[i * 3 + 2] * dt;
        if (arr[i * 3 + 1] > pos.y + 2) {
          arr[i * 3] = pos.x + (Math.random() - 0.5) * radius;
          arr[i * 3 + 1] = pos.y;
          arr[i * 3 + 2] = pos.z + (Math.random() - 0.5) * radius;
        }
      }
      (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    });
  }

  // ---- Helper ----

  private addBox(
    scene: THREE.Scene,
    pos: THREE.Vector3,
    w: number,
    h: number,
    d: number,
    color: number,
    emissive = false,
  ): void {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = emissive
      ? new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.6,
          blending: THREE.AdditiveBlending,
        })
      : new THREE.MeshStandardMaterial({
          color, roughness: 0.7, metalness: 0.6,
        });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    scene.add(mesh);
    this.zoneObjects.push(mesh);
  }
}