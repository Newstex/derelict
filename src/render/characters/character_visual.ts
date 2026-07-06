/**
 * CharacterVisual — procedural character and entity models.
 *
 * All models are built from Three.js primitive geometry (boxes, spheres,
 * cylinders). No shipped GLB assets. Each entity gets a THREE.Group with
 * named limb references for simple time-based keyframe animation.
 */

import * as THREE from 'three';
import {
  AnimState,
  CharacterClass,
  EntityKind,
  type Entity,
} from '../../world_api';

// ---- Parts / Class ----

interface CharacterParts {
  torso: THREE.Mesh;
  head: THREE.Mesh;
  leftArmGroup: THREE.Group;
  rightArmGroup: THREE.Group;
  leftLegGroup: THREE.Group;
  rightLegGroup: THREE.Group;
  eyeLight?: THREE.PointLight;
}

function classColor(classId?: CharacterClass): number {
  switch (classId) {
    case CharacterClass.Engineer: return 0xcc7722;
    case CharacterClass.Marine: return 0x448833;
    case CharacterClass.Scientist: return 0xdddddd;
    case CharacterClass.Scavenger: return 0x886644;
    default: return 0x888888;
  }
}

function itemColor(visualKey: string): number {
  const key = visualKey.toLowerCase();
  if (key.includes('weapon')) return 0xffaa44;
  if (key.includes('armor')) return 0x4488ff;
  if (key.includes('consumable') || key.includes('heal')) return 0x44ff44;
  if (key.includes('material')) return 0xaaaa44;
  if (key.includes('key')) return 0xff44ff;
  return 0x88ccff;
}

// ---- CharacterVisual ----

export class CharacterVisual {
  readonly group: THREE.Group;
  private animTime = 0;
  private currentAnim: AnimState = AnimState.Idle;
  private readonly visualType: string;

  private readonly torso: THREE.Mesh;
  private readonly head: THREE.Mesh;
  private readonly leftArmGroup: THREE.Group;
  private readonly rightArmGroup: THREE.Group;
  private readonly leftLegGroup: THREE.Group;
  private readonly rightLegGroup: THREE.Group;
  private readonly eyeLight: THREE.PointLight | null;

  constructor(group: THREE.Group, parts: CharacterParts, visualType: string) {
    this.group = group;
    this.torso = parts.torso;
    this.head = parts.head;
    this.leftArmGroup = parts.leftArmGroup;
    this.rightArmGroup = parts.rightArmGroup;
    this.leftLegGroup = parts.leftLegGroup;
    this.rightLegGroup = parts.rightLegGroup;
    this.visualType = visualType;
    this.eyeLight = parts.eyeLight ?? null;
  }

  update(dt: number, animState: AnimState): void {
    this.animTime += dt;
    if (animState !== this.currentAnim) {
      this.currentAnim = animState;
      this.animTime = 0;
    }

    switch (this.currentAnim) {
      case AnimState.Idle: this.animateIdle(); break;
      case AnimState.Walk: this.animateWalk(1.0); break;
      case AnimState.Run: this.animateWalk(1.8); break;
      case AnimState.Attack: this.animateAttack(); break;
      case AnimState.Cast: this.animateCast(); break;
      case AnimState.Hit: this.animateHit(); break;
      case AnimState.Death: this.animateDeath(); break;
      case AnimState.Interact: this.animateInteract(); break;
      default: this.animateIdle(); break;
    }
  }

  // ---- Animations ----

  private animateIdle(): void {
    switch (this.visualType) {
      case 'drone':
      case 'projectile': {
        const bob = Math.sin(this.animTime * 2) * 0.06;
        this.torso.position.y = bob;
        this.head.position.y = (this.visualType === 'drone' ? 0.25 : 0) + bob;
        break;
      }
      case 'item': {
        const bob = Math.sin(this.animTime * 1.5) * 0.08;
        this.torso.position.y = bob;
        this.torso.rotation.y += 0.02;
        break;
      }
      case 'turret': {
        // Scanning sweep
        this.head.rotation.y = Math.sin(this.animTime * 0.8) * 0.6;
        break;
      }
      default: {
        const bob = Math.sin(this.animTime * 2) * 0.02;
        this.torso.position.y = bob;
        this.head.position.y = 0.55 + bob;
        break;
      }
    }
    this.resetLimbs();
  }

  private animateWalk(speed: number): void {
    if (this.visualType === 'drone' || this.visualType === 'projectile' || this.visualType === 'turret') {
      // Hover / no legs
      const bob = Math.sin(this.animTime * 4 * speed) * 0.08;
      this.torso.position.y = bob;
      if (this.visualType === 'drone') this.head.position.y = 0.25 + bob;
      this.resetLimbs();
      return;
    }

    const swing = Math.sin(this.animTime * 8 * speed) * 0.5;
    this.leftLegGroup.rotation.x = swing;
    this.rightLegGroup.rotation.x = -swing;
    this.leftArmGroup.rotation.x = -swing * 0.6;
    this.rightArmGroup.rotation.x = swing * 0.6;

    const bob = Math.abs(Math.sin(this.animTime * 8 * speed)) * 0.04;
    this.torso.position.y = bob;
    this.head.position.y = 0.55 + bob;
  }

  private animateAttack(): void {
    if (this.visualType === 'turret') {
      // Barrel recoil
      const t = Math.min(this.animTime / 0.3, 1.0);
      this.head.position.z = -0.05 * Math.sin(t * Math.PI);
      this.resetLimbs();
      return;
    }

    const t = Math.min(this.animTime / 0.4, 1.0);
    // Wind up then swing forward
    if (t < 0.3) {
      this.rightArmGroup.rotation.x = -1.5 * (t / 0.3);
    } else {
      this.rightArmGroup.rotation.x = -1.5 + 2.5 * ((t - 0.3) / 0.7);
    }
    this.leftArmGroup.rotation.x = 0;
    this.resetLegs();
  }

  private animateCast(): void {
    const t = Math.min(this.animTime / 0.5, 1.0);
    // Raise both arms
    const raise = Math.min(t * 2, 1) * -1.8;
    this.leftArmGroup.rotation.x = raise;
    this.rightArmGroup.rotation.x = raise;
    // Slight bob
    const bob = Math.sin(this.animTime * 6) * 0.02;
    this.torso.position.y = bob;
    this.head.position.y = 0.55 + bob;
    this.resetLegs();
  }

  private animateHit(): void {
    const t = Math.min(this.animTime / 0.3, 1.0);
    const flinch = Math.sin(t * Math.PI) * 0.15;
    this.torso.position.z = flinch;
    this.head.position.z = flinch;
    this.resetLimbs();
  }

  private animateDeath(): void {
    const t = Math.min(this.animTime / 0.8, 1.0);
    const eased = t * t;
    this.group.rotation.x = -eased * Math.PI / 2;
    // Limbs go limp
    this.leftArmGroup.rotation.x = eased * 0.3;
    this.rightArmGroup.rotation.x = eased * 0.2;
    this.leftLegGroup.rotation.x = eased * 0.15;
    this.rightLegGroup.rotation.x = -eased * 0.1;
  }

  private animateInteract(): void {
    const t = Math.min(this.animTime / 0.5, 1.0);
    this.rightArmGroup.rotation.x = -0.8 * Math.sin(t * Math.PI);
    this.leftArmGroup.rotation.x = 0;
    this.resetLegs();
  }

  private resetLimbs(): void {
    this.leftArmGroup.rotation.x = 0;
    this.rightArmGroup.rotation.x = 0;
    this.leftLegGroup.rotation.x = 0;
    this.rightLegGroup.rotation.x = 0;
  }

  private resetLegs(): void {
    this.leftLegGroup.rotation.x = 0;
    this.rightLegGroup.rotation.x = 0;
  }
}

// ---- Factory ----

export function createCharacterVisual(entity: Entity): CharacterVisual {
  const group = new THREE.Group();
  const key = entity.visualKey.toLowerCase();

  if (entity.kind === EntityKind.Player || entity.kind === EntityKind.Npc) {
    return createHumanoid(group, entity);
  }
  if (entity.kind === EntityKind.Enemy) {
    if (key.includes('drone')) return createDrone(group);
    if (key.includes('bot')) return createBot(group);
    if (key.includes('turret')) return createTurret(group);
    if (key.includes('mutant')) return createMutant(group);
    // Default enemy: mutant-style
    return createMutant(group);
  }
  if (entity.kind === EntityKind.Item) {
    return createItemPickup(group, entity);
  }
  if (entity.kind === EntityKind.Prop) {
    return createProp(group);
  }
  if (entity.kind === EntityKind.Projectile) {
    return createProjectileVisual(group);
  }
  return createHumanoid(group, entity);
}

// ---- Model Builders ----

function createHumanoid(group: THREE.Group, entity: Entity): CharacterVisual {
  const color = classColor(entity.classId);
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.4 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.7 });

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), bodyMat);
  group.add(torso);

  // Chest accent
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.33), darkMat);
  chest.position.y = 0.15;
  group.add(chest);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), bodyMat);
  head.position.y = 0.55;
  group.add(head);

  // Visor
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.08, 0.02),
    new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.8 }),
  );
  visor.position.set(0, 0.58, 0.18);
  group.add(visor);

  // Arms (pivot groups)
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.38, 0.32, 0);
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), bodyMat);
  leftArm.position.y = -0.27;
  leftArmGroup.add(leftArm);
  group.add(leftArmGroup);

  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.38, 0.32, 0);
  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), bodyMat);
  rightArm.position.y = -0.27;
  rightArmGroup.add(rightArm);
  group.add(rightArmGroup);

  // Legs
  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.14, -0.38, 0);
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.18), darkMat);
  leftLeg.position.y = -0.32;
  leftLegGroup.add(leftLeg);
  group.add(leftLegGroup);

  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.14, -0.38, 0);
  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.18), darkMat);
  rightLeg.position.y = -0.32;
  rightLegGroup.add(rightLeg);
  group.add(rightLegGroup);

  return new CharacterVisual(group, {
    torso, head, leftArmGroup, rightArmGroup, leftLegGroup, rightLegGroup,
  }, 'humanoid');
}

function createDrone(group: THREE.Group): CharacterVisual {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.4, metalness: 0.8 });

  // Body — floating cylinder
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.35, 12), bodyMat);
  group.add(torso);

  // Sensor dome
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), bodyMat);
  head.position.y = 0.25;
  group.add(head);

  // Eye
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2222 }),
  );
  eye.position.set(0, 0.15, 0.25);
  group.add(eye);

  const eyeLight = new THREE.PointLight(0xff2222, 1.5, 5, 2);
  eyeLight.position.set(0, 0.15, 0.25);
  group.add(eyeLight);

  // Rotor blades
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.9 });
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.08), bladeMat);
    blade.position.set(Math.cos(angle) * 0.3, -0.1, Math.sin(angle) * 0.3);
    blade.rotation.y = angle;
    group.add(blade);
  }

  // Empty limb groups for animation compatibility
  const leftArmGroup = new THREE.Group();
  const rightArmGroup = new THREE.Group();
  const leftLegGroup = new THREE.Group();
  const rightLegGroup = new THREE.Group();
  group.add(leftArmGroup, rightArmGroup, leftLegGroup, rightLegGroup);

  return new CharacterVisual(group, {
    torso, head, leftArmGroup, rightArmGroup, leftLegGroup, rightLegGroup, eyeLight,
  }, 'drone');
}

function createBot(group: THREE.Group): CharacterVisual {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x666655, roughness: 0.5, metalness: 0.7 });

  // Box body
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), bodyMat);
  torso.position.y = 0.3;
  group.add(torso);

  // Sensor head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.25), bodyMat);
  head.position.y = 0.6;
  group.add(head);

  // Eye strip
  const eye = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.05, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xffaa00 }),
  );
  eye.position.set(0, 0.6, 0.13);
  group.add(eye);

  // Wheel
  const wheel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.1, 12),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.3 }),
  );
  wheel.rotation.x = Math.PI / 2;
  wheel.position.y = -0.1;
  group.add(wheel);

  // Manipulator arms
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.3, 0.35, 0);
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), bodyMat);
  leftArm.position.y = -0.15;
  leftArmGroup.add(leftArm);
  group.add(leftArmGroup);

  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.3, 0.35, 0);
  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), bodyMat);
  rightArm.position.y = -0.15;
  rightArmGroup.add(rightArm);
  group.add(rightArmGroup);

  // No legs
  const leftLegGroup = new THREE.Group();
  const rightLegGroup = new THREE.Group();
  group.add(leftLegGroup, rightLegGroup);

  return new CharacterVisual(group, {
    torso, head, leftArmGroup, rightArmGroup, leftLegGroup, rightLegGroup,
  }, 'bot');
}

function createMutant(group: THREE.Group): CharacterVisual {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a5d3a, roughness: 0.9, metalness: 0.1 });

  // Distorted torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.4), bodyMat);
  torso.scale.set(1.1, 1, 0.9);
  group.add(torso);

  // Asymmetric head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), bodyMat);
  head.position.set(0.05, 0.6, 0);
  head.scale.set(1.2, 0.9, 1);
  group.add(head);

  // Glowing eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff4400 });
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), eyeMat);
  leftEye.position.set(-0.08, 0.62, 0.2);
  group.add(leftEye);
  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), eyeMat);
  rightEye.position.set(0.12, 0.64, 0.2);
  group.add(rightEye);

  // Long arms
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.45, 0.35, 0);
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.75, 0.14), bodyMat);
  leftArm.position.y = -0.37;
  leftArmGroup.add(leftArm);
  group.add(leftArmGroup);

  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.45, 0.3, 0);
  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.8, 0.14), bodyMat);
  rightArm.position.y = -0.4;
  rightArmGroup.add(rightArm);
  group.add(rightArmGroup);

  // Bent legs
  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.18, -0.4, 0);
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), bodyMat);
  leftLeg.position.y = -0.35;
  leftLegGroup.add(leftLeg);
  group.add(leftLegGroup);

  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.15, -0.42, 0);
  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.22), bodyMat);
  rightLeg.position.y = -0.34;
  rightLegGroup.add(rightLeg);
  group.add(rightLegGroup);

  return new CharacterVisual(group, {
    torso, head, leftArmGroup, rightArmGroup, leftLegGroup, rightLegGroup,
  }, 'mutant');
}

function createTurret(group: THREE.Group): CharacterVisual {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.4, metalness: 0.8 });

  // Base
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.3, 12), bodyMat);
  torso.position.y = -0.2;
  group.add(torso);

  // Turret head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.35), bodyMat);
  head.position.y = 0.1;
  group.add(head);

  // Barrel
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), bodyMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.1, 0.35);
  group.add(barrel);

  // Targeting light
  const eyeLight = new THREE.PointLight(0xff3333, 0.8, 4, 2);
  eyeLight.position.set(0, 0.1, 0.2);
  group.add(eyeLight);

  // Empty limb groups
  const leftArmGroup = new THREE.Group();
  const rightArmGroup = new THREE.Group();
  const leftLegGroup = new THREE.Group();
  const rightLegGroup = new THREE.Group();
  group.add(leftArmGroup, rightArmGroup, leftLegGroup, rightLegGroup);

  return new CharacterVisual(group, {
    torso, head, leftArmGroup, rightArmGroup, leftLegGroup, rightLegGroup, eyeLight,
  }, 'turret');
}

function createItemPickup(group: THREE.Group, entity: Entity): CharacterVisual {
  const color = itemColor(entity.visualKey);
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 0.3, metalness: 0.7,
    emissive: color, emissiveIntensity: 0.3,
  });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), mat);
  group.add(torso);

  // Glow halo
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 12, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending }),
  );
  group.add(glow);

  // Light
  const light = new THREE.PointLight(color, 0.8, 3, 2);
  group.add(light);

  const head = new THREE.Mesh();
  const leftArmGroup = new THREE.Group();
  const rightArmGroup = new THREE.Group();
  const leftLegGroup = new THREE.Group();
  const rightLegGroup = new THREE.Group();

  return new CharacterVisual(group, {
    torso, head, leftArmGroup, rightArmGroup, leftLegGroup, rightLegGroup,
  }, 'item');
}

function createProp(group: THREE.Group): CharacterVisual {
  const mat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.6, metalness: 0.5 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.5), mat);
  group.add(torso);

  const head = new THREE.Mesh();
  const leftArmGroup = new THREE.Group();
  const rightArmGroup = new THREE.Group();
  const leftLegGroup = new THREE.Group();
  const rightLegGroup = new THREE.Group();

  return new CharacterVisual(group, {
    torso, head, leftArmGroup, rightArmGroup, leftLegGroup, rightLegGroup,
  }, 'prop');
}

function createProjectileVisual(group: THREE.Group): CharacterVisual {
  const mat = new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.9 });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat);
  group.add(torso);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending }),
  );
  group.add(glow);

  const head = new THREE.Mesh();
  const leftArmGroup = new THREE.Group();
  const rightArmGroup = new THREE.Group();
  const leftLegGroup = new THREE.Group();
  const rightLegGroup = new THREE.Group();

  return new CharacterVisual(group, {
    torso, head, leftArmGroup, rightArmGroup, leftLegGroup, rightLegGroup,
  }, 'projectile');
}