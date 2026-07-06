/**
 * LightingSystem — atmospheric lighting for DERELICT.
 *
 * Dark station interiors with flickering emergency lights, a player
 * flashlight spotlight, and very low ambient. The station should feel
 * dark, claustrophobic, and lit primarily by emergency fixtures.
 */

import * as THREE from 'three';
import { StationBiome } from '../../world_api';

interface EmergencyLight {
  light: THREE.PointLight;
  baseIntensity: number;
  phase: number;
  noiseSeed: number;
}

/** Returns the accent color for a station biome. */
export function biomeAccentColor(biome: StationBiome): THREE.Color {
  switch (biome) {
    case StationBiome.Command: return new THREE.Color(0x3366ff);
    case StationBiome.Habitation: return new THREE.Color(0x33ff66);
    case StationBiome.Engineering: return new THREE.Color(0xff8833);
    case StationBiome.Cargo: return new THREE.Color(0xffdd33);
    case StationBiome.Medical: return new THREE.Color(0xffffff);
    case StationBiome.Hydroponics: return new THREE.Color(0x66ff33);
    case StationBiome.Airlock: return new THREE.Color(0xff3333);
    default: return new THREE.Color(0x3366ff);
  }
}

export class LightingSystem {
  private scene: THREE.Scene;
  private ambient: THREE.AmbientLight;
  private hemisphere: THREE.HemisphereLight;
  private flashlight: THREE.SpotLight;
  private emergencyLights: EmergencyLight[] = [];
  private flickerTime = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Very low ambient — station is dark
    this.ambient = new THREE.AmbientLight(0x202838, 0.12);
    this.hemisphere = new THREE.HemisphereLight(0x223344, 0x080808, 0.06);
    this.scene.add(this.ambient);
    this.scene.add(this.hemisphere);

    // Player flashlight — spotlight that will be attached to the camera
    this.flashlight = new THREE.SpotLight(0xfff0cc, 4.0, 35, Math.PI / 5, 0.4, 1.2);
    this.flashlight.position.set(0, 0, 0);
    this.flashlight.target.position.set(0, -0.2, -1);
    this.scene.add(this.flashlight);
    this.scene.add(this.flashlight.target);
  }

  /** Attach the flashlight to the camera so it follows the player's view. */
  attachFlashlightToCamera(camera: THREE.Object3D): void {
    this.scene.remove(this.flashlight);
    this.scene.remove(this.flashlight.target);
    camera.add(this.flashlight);
    camera.add(this.flashlight.target);
    this.flashlight.position.set(0, 0, 0);
    this.flashlight.target.position.set(0, -0.2, -1);
  }

  /** Add a flickering emergency point light at the given position. */
  addEmergencyLight(pos: THREE.Vector3, color: THREE.Color, intensity = 1.8, distance = 14): void {
    const light = new THREE.PointLight(color.getHex(), intensity, distance, 2);
    light.position.copy(pos);
    this.scene.add(light);
    this.emergencyLights.push({
      light,
      baseIntensity: intensity,
      phase: Math.random() * Math.PI * 2,
      noiseSeed: Math.random() * 1000,
    });
  }

  clearEmergencyLights(): void {
    for (const el of this.emergencyLights) {
      this.scene.remove(el.light);
    }
    this.emergencyLights = [];
  }

  /** Set the biome to tint ambient lighting toward the biome accent. */
  setBiome(biome: StationBiome): void {
    const accent = biomeAccentColor(biome);
    this.ambient.color.copy(accent).multiplyScalar(0.15);
    this.ambient.color.lerp(new THREE.Color(0x202838), 0.7);
  }

  update(dt: number, _biome: StationBiome): void {
    this.flickerTime += dt;

    for (const el of this.emergencyLights) {
      // Sin-based flicker + pseudo-random noise for organic feel
      const sinFlicker = 0.82 + 0.18 * Math.sin(this.flickerTime * 7.5 + el.phase);
      const noise = pseudoNoise(this.flickerTime * 23 + el.noiseSeed);
      const noiseFlicker = 0.65 + 0.35 * noise;
      // Occasional brief dropout for atmospheric failure
      const dropout = noise > 0.985 ? 0.15 : 1.0;
      el.light.intensity = el.baseIntensity * sinFlicker * noiseFlicker * dropout;
    }
  }

  dispose(): void {
    this.clearEmergencyLights();
    this.scene.remove(this.ambient);
    this.scene.remove(this.hemisphere);
    if (this.flashlight.parent === this.scene) {
      this.scene.remove(this.flashlight);
      this.scene.remove(this.flashlight.target);
    }
  }
}

/** Cheap deterministic pseudo-noise in [0, 1). */
function pseudoNoise(x: number): number {
  const v = Math.sin(x * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
}