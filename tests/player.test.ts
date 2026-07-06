/**
 * Player tests — vitals management (health, oxygen) and movement state.
 *
 * The Player class owns a THREE.PerspectiveCamera and a mesh, but the
 * vitals logic (takeDamage / heal / consumeOxygen / restoreOxygen) and the
 * movement-direction bookkeeping operate on plain numeric fields and are
 * fully testable without a real WebGL context. We construct the Player with
 * a lightweight camera stub that satisfies the minimal surface the class
 * actually touches (position.set, lookAt, rotation).
 *
 * Addresses issue #2 (Core Game Loop) — Phase 2 player systems.
 */

import { describe, it, expect } from 'vitest';
import { Player, type PlayerStats } from '../src/entities/Player';

/**
 * Minimal camera stub. Player only calls camera.position.set and
 * camera.lookAt in syncCamera(), and reads camera.position in the
 * constructor. We provide a plain object with those methods.
 */
function makeCameraStub(): unknown {
  return {
    position: { set: () => {}, copy: () => {}, x: 0, y: 0, z: 0 },
    lookAt: () => {},
    rotation: { y: 0 },
  };
}

describe('Player — initial stats', () => {
  it('starts at full health and full oxygen', () => {
    const player = new Player(makeCameraStub() as never);
    expect(player.stats.health).toBe(player.stats.maxHealth);
    expect(player.stats.oxygen).toBe(player.stats.maxOxygen);
    expect(player.isAlive).toBe(true);
    expect(player.isSuffocating).toBe(false);
  });

  it('starts at the origin with zero velocity', () => {
    const player = new Player(makeCameraStub() as never);
    expect(player.x).toBe(0);
    expect(player.z).toBe(0);
    expect(player.vx).toBe(0);
    expect(player.vz).toBe(0);
  });

  it('has a positive collision radius', () => {
    const player = new Player(makeCameraStub() as never);
    expect(player.radius).toBeGreaterThan(0);
  });
});

describe('Player — health', () => {
  it('takeDamage reduces health', () => {
    const player = new Player(makeCameraStub() as never);
    player.takeDamage(30);
    expect(player.stats.health).toBe(70);
  });

  it('takeDamage does not go below zero', () => {
    const player = new Player(makeCameraStub() as never);
    player.takeDamage(999);
    expect(player.stats.health).toBe(0);
  });

  it('heal increases health up to maxHealth', () => {
    const player = new Player(makeCameraStub() as never);
    player.takeDamage(50);
    player.heal(20);
    expect(player.stats.health).toBe(70);
    player.heal(999);
    expect(player.stats.health).toBe(player.stats.maxHealth);
  });

  it('isAlive is false at zero health', () => {
    const player = new Player(makeCameraStub() as never);
    player.takeDamage(player.stats.maxHealth);
    expect(player.isAlive).toBe(false);
  });
});

describe('Player — oxygen', () => {
  it('consumeOxygen drains oxygen', () => {
    const player = new Player(makeCameraStub() as never);
    player.consumeOxygen(25);
    expect(player.stats.oxygen).toBe(75);
  });

  it('consumeOxygen does not go below zero', () => {
    const player = new Player(makeCameraStub() as never);
    player.consumeOxygen(999);
    expect(player.stats.oxygen).toBe(0);
  });

  it('restoreOxygen refills oxygen up to maxOxygen', () => {
    const player = new Player(makeCameraStub() as never);
    player.consumeOxygen(40);
    player.restoreOxygen(20);
    expect(player.stats.oxygen).toBe(80);
    player.restoreOxygen(999);
    expect(player.stats.oxygen).toBe(player.stats.maxOxygen);
  });

  it('isSuffocating is true when oxygen reaches zero', () => {
    const player = new Player(makeCameraStub() as never);
    expect(player.isSuffocating).toBe(false);
    player.consumeOxygen(player.stats.maxOxygen);
    expect(player.isSuffocating).toBe(true);
  });

  it('oxygen drains at a steady rate over repeated calls', () => {
    const player = new Player(makeCameraStub() as never);
    const rate = 0.2; // matches MainScene.update atmospheric drain per second
    for (let i = 0; i < 50; i++) {
      player.consumeOxygen(rate);
    }
    // 50 * 0.2 = 10 drained
    expect(player.stats.oxygen).toBeCloseTo(90, 5);
  });
});

describe('Player — movement state', () => {
  it('setMoveDirection sets velocity along the direction', () => {
    const player = new Player(makeCameraStub() as never);
    player.setMoveDirection(1, 0, false);
    expect(player.vx).toBeGreaterThan(0);
    expect(player.vz).toBe(0);
  });

  it('setMoveDirection running multiplies speed', () => {
    const player = new Player(makeCameraStub() as never);
    player.setMoveDirection(1, 0, false);
    const walkVx = player.vx;
    player.setMoveDirection(1, 0, true);
    expect(player.vx).toBeGreaterThan(walkVx);
  });

  it('setMoveDirection updates facing rotation when moving', () => {
    const player = new Player(makeCameraStub() as never);
    player.setMoveDirection(1, 0, false); // +X
    expect(player.rotation).toBeCloseTo(Math.atan2(1, 0), 5);
  });

  it('stop zeroes velocity', () => {
    const player = new Player(makeCameraStub() as never);
    player.setMoveDirection(1, 1, true);
    player.stop();
    expect(player.vx).toBe(0);
    expect(player.vz).toBe(0);
  });

  it('applyPosition updates logical position', () => {
    const player = new Player(makeCameraStub() as never);
    player.applyPosition(5, -3);
    expect(player.x).toBe(5);
    expect(player.z).toBe(-3);
  });
});

describe('Player — stats shape', () => {
  it('PlayerStats contains health, maxHealth, oxygen, maxOxygen', () => {
    const stats: PlayerStats = {
      health: 50,
      maxHealth: 100,
      oxygen: 80,
      maxOxygen: 100,
    };
    expect(stats.health).toBe(50);
    expect(stats.maxHealth).toBe(100);
    expect(stats.oxygen).toBe(80);
    expect(stats.maxOxygen).toBe(100);
  });
});