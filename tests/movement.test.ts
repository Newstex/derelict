/**
 * MovementSystem tests — pure TypeScript, no Three.js or DOM.
 *
 * Tests the collision detection and movement resolution logic.
 * Addresses GitHub issue #9 (Missing Player Collisions).
 */

import { describe, it, expect } from 'vitest';
import {
  MovementSystem,
  type CircleCollider,
  type RectCollider,
  type BoundsCollider,
} from '../src/systems/MovementSystem';

describe('MovementSystem — directionFromInput', () => {
  it('no input → zero vector', () => {
    const d = MovementSystem.directionFromInput(false, false, false, false);
    expect(d.x).toBe(0);
    expect(d.z).toBe(0);
  });

  it('W (forward) → -Z', () => {
    const d = MovementSystem.directionFromInput(true, false, false, false);
    expect(d.z).toBe(-1);
    expect(d.x).toBe(0);
  });

  it('S (back) → +Z', () => {
    const d = MovementSystem.directionFromInput(false, true, false, false);
    expect(d.z).toBe(1);
  });

  it('A (left) → -X', () => {
    const d = MovementSystem.directionFromInput(false, false, true, false);
    expect(d.x).toBe(-1);
  });

  it('D (right) → +X', () => {
    const d = MovementSystem.directionFromInput(false, false, false, true);
    expect(d.x).toBe(1);
  });

  it('W+D (diagonal) is normalized', () => {
    const d = MovementSystem.directionFromInput(true, false, false, true);
    const len = Math.hypot(d.x, d.z);
    expect(len).toBeCloseTo(1.0, 5);
    expect(d.x).toBeGreaterThan(0);
    expect(d.z).toBeLessThan(0);
  });

  it('W+S cancel out → zero', () => {
    const d = MovementSystem.directionFromInput(true, true, false, false);
    expect(d.x).toBe(0);
    expect(d.z).toBe(0);
  });
});

describe('MovementSystem — basic movement (no collisions)', () => {
  const ms = new MovementSystem();

  it('moves at velocity * dt', () => {
    const pos = { x: 0, z: 0 };
    const vel = { x: 5, z: 0 };
    const result = ms.move(pos, vel, 0.5, 1.0);
    expect(result.x).toBeCloseTo(5, 5);
    expect(result.z).toBe(0);
    expect(result.collided).toBe(false);
  });

  it('zero velocity → no movement', () => {
    const pos = { x: 3, z: 4 };
    const vel = { x: 0, z: 0 };
    const result = ms.move(pos, vel, 0.5, 0.05);
    expect(result.x).toBe(3);
    expect(result.z).toBe(4);
    expect(result.collided).toBe(false);
  });
});

describe('MovementSystem — world bounds clamping', () => {
  const ms = new MovementSystem();
  const bounds: BoundsCollider = { halfWidth: 20, halfDepth: 20 };

  it('clamps to +X bound', () => {
    const pos = { x: 19, z: 0 };
    const vel = { x: 10, z: 0 };
    const result = ms.move(pos, vel, 0.5, 1.0, [], [], bounds);
    expect(result.x).toBeCloseTo(19.5, 5); // 20 - 0.5
    expect(result.collided).toBe(true);
  });

  it('clamps to -X bound', () => {
    const pos = { x: -19, z: 0 };
    const vel = { x: -10, z: 0 };
    const result = ms.move(pos, vel, 0.5, 1.0, [], [], bounds);
    expect(result.x).toBeCloseTo(-19.5, 5);
    expect(result.collided).toBe(true);
  });

  it('clamps to +Z bound', () => {
    const pos = { x: 0, z: 19 };
    const vel = { x: 0, z: 10 };
    const result = ms.move(pos, vel, 0.5, 1.0, [], [], bounds);
    expect(result.z).toBeCloseTo(19.5, 5);
    expect(result.collided).toBe(true);
  });

  it('clamps to -Z bound', () => {
    const pos = { x: 0, z: -19 };
    const vel = { x: 0, z: -10 };
    const result = ms.move(pos, vel, 0.5, 1.0, [], [], bounds);
    expect(result.z).toBeCloseTo(-19.5, 5);
    expect(result.collided).toBe(true);
  });

  it('no collision when within bounds', () => {
    const pos = { x: 0, z: 0 };
    const vel = { x: 3, z: 3 };
    const result = ms.move(pos, vel, 0.5, 1.0, [], [], bounds);
    expect(result.x).toBeCloseTo(3, 5);
    expect(result.z).toBeCloseTo(3, 5);
    expect(result.collided).toBe(false);
  });
});

describe('MovementSystem — circle collisions', () => {
  const ms = new MovementSystem();

  it('pushes player out of a circle collider', () => {
    const pos = { x: 5.5, z: 0 };
    const vel = { x: 1, z: 0 };
    const velCopy = { ...vel };
    const circles: CircleCollider[] = [{ x: 6, z: 0, radius: 1 }];
    const result = ms.move(pos, velCopy, 0.5, 1.0, circles);
    // Player moves to 6.5, circle at 6 r1, player r0.5 → minDist 1.5
    // Should be pushed out so distance >= 1.5
    const dist = Math.hypot(result.x - 6, result.z);
    expect(dist).toBeGreaterThanOrEqual(1.5 - 1e-6);
    expect(result.collided).toBe(true);
  });

  it('no collision when circles are far apart', () => {
    const pos = { x: 0, z: 0 };
    const vel = { x: 1, z: 0 };
    const circles: CircleCollider[] = [{ x: 10, z: 10, radius: 1 }];
    const result = ms.move(pos, vel, 0.5, 1.0, circles);
    expect(result.collided).toBe(false);
  });

  it('handles multiple circle colliders', () => {
    const pos = { x: 0, z: 0 };
    const vel = { x: 5, z: 0 };
    const circles: CircleCollider[] = [
      { x: 2, z: 0, radius: 0.5 },
      { x: 5, z: 0, radius: 0.5 },
    ];
    const result = ms.move(pos, vel, 0.5, 1.0, circles);
    expect(result.collided).toBe(true);
  });
});

describe('MovementSystem — rectangle collisions', () => {
  const ms = new MovementSystem();

  it('pushes player out of a rect collider from the side', () => {
    const pos = { x: 8, z: 0 };
    const vel = { x: 3, z: 0 };
    const rects: RectCollider[] = [{ x: 10, z: 0, halfWidth: 1, halfDepth: 1 }];
    const result = ms.move(pos, vel, 0.5, 1.0, [], rects);
    // Player moves to x=11, rect spans [9,11], closestX=11
    // dx = 0, dz = 0 → inside rect → pushed out
    expect(result.collided).toBe(true);
    // Should end up outside the rect
    expect(result.x).toBeLessThanOrEqual(9 - 0.5);
  });

  it('pushes player out of a rect collider from above', () => {
    const pos = { x: 0, z: 8 };
    const vel = { x: 0, z: 3 };
    const rects: RectCollider[] = [{ x: 0, z: 10, halfWidth: 1, halfDepth: 1 }];
    const result = ms.move(pos, vel, 0.5, 1.0, [], rects);
    expect(result.collided).toBe(true);
    expect(result.z).toBeLessThanOrEqual(9 - 0.5 + 1e-6);
  });

  it('no collision when passing beside a rect', () => {
    const pos = { x: 0, z: 0 };
    const vel = { x: 0, z: 1 };
    const rects: RectCollider[] = [{ x: 10, z: 5, halfWidth: 1, halfDepth: 1 }];
    const result = ms.move(pos, vel, 0.5, 1.0, [], rects);
    expect(result.collided).toBe(false);
  });

  it('slides along a wall (diagonal approach)', () => {
    const pos = { x: 8.8, z: 0 };
    const vel = { x: 2, z: 2 };
    const rects: RectCollider[] = [{ x: 10, z: 0, halfWidth: 1, halfDepth: 5 }];
    const result = ms.move(pos, vel, 0.5, 1.0, [], rects);
    expect(result.collided).toBe(true);
    // Player should be pushed back in X but Z movement preserved
    expect(result.x).toBeLessThanOrEqual(9 - 0.5 + 1e-3);
    expect(result.z).toBeGreaterThan(0);
  });
});

describe('MovementSystem — combined collisions', () => {
  const ms = new MovementSystem();
  const bounds: BoundsCollider = { halfWidth: 20, halfDepth: 20 };

  it('handles bounds + circles + rects simultaneously', () => {
    const pos = { x: 18, z: 18 };
    const vel = { x: 5, z: 5 };
    const circles: CircleCollider[] = [{ x: 19, z: 19, radius: 0.8 }];
    const rects: RectCollider[] = [{ x: 18.5, z: 18.5, halfWidth: 0.3, halfDepth: 0.3 }];
    const result = ms.move(pos, vel, 0.5, 1.0, circles, rects, bounds);
    expect(result.collided).toBe(true);
    // Should be clamped within bounds
    expect(result.x).toBeLessThanOrEqual(20);
    expect(result.z).toBeLessThanOrEqual(20);
  });
});