/**
 * MovementSystem — pure TypeScript movement + collision resolution.
 *
 * No Three.js or DOM dependencies. Operates on plain data structures so it
 * can be unit-tested in isolation and reused by both the sim core and the
 * render layer.
 *
 * Supports:
 *  - Velocity-based displacement with fixed dt
 *  - World bounds clamping (zone walls)
 *  - Circle-vs-circle collision (enemies, obstacles, props)
 *  - Circle-vs-rectangle collision (walls, room partitions)
 *  - Running (sprint) multiplier
 *
 * Addresses GitHub issue #9 (Missing Player Collisions).
 */

// ============================================================
// Types
// ============================================================

/** 2D vector (top-down; y is up in 3D but movement is on the XZ plane). */
export interface Vec2 {
  x: number;
  z: number;
}

/** Circular collider — used for dynamic entities (player, enemies, items). */
export interface CircleCollider {
  x: number;
  z: number;
  radius: number;
}

/** Axis-aligned rectangular collider — used for walls, partitions, props. */
export interface RectCollider {
  x: number; // center
  z: number; // center
  halfWidth: number;
  halfDepth: number;
}

/** World boundary — the playable area extends [-halfWidth, halfWidth]. */
export interface BoundsCollider {
  halfWidth: number;
  halfDepth: number;
}

/** Result of a single movement resolution step. */
export interface MoveResult {
  x: number;
  z: number;
  /** True if the entity collided with anything this step. */
  collided: boolean;
}

// ============================================================
// MovementSystem
// ============================================================

export class MovementSystem {
  /**
   * Resolve a single movement step for a circular entity.
   *
   * @param pos       current position
   * @param velocity  velocity (units/sec) — mutated in place to reflect bounce/slide
   * @param radius    entity collision radius
   * @param dt        delta time in seconds
   * @param circles   dynamic circle colliders to avoid
   * @param rects     static rectangle colliders to avoid
   * @param bounds    world bounds
   * @returns new position and whether any collision occurred
   */
  move(
    pos: Vec2,
    velocity: Vec2,
    radius: number,
    dt: number,
    circles: CircleCollider[] = [],
    rects: RectCollider[] = [],
    bounds: BoundsCollider | null = null,
  ): MoveResult {
    let newX = pos.x + velocity.x * dt;
    let newZ = pos.z + velocity.z * dt;
    let collided = false;

    // --- World bounds ---
    if (bounds) {
      const minX = -bounds.halfWidth + radius;
      const maxX = bounds.halfWidth - radius;
      const minZ = -bounds.halfDepth + radius;
      const maxZ = bounds.halfDepth - radius;
      if (newX < minX) { newX = minX; velocity.x = 0; collided = true; }
      if (newX > maxX) { newX = maxX; velocity.x = 0; collided = true; }
      if (newZ < minZ) { newZ = minZ; velocity.z = 0; collided = true; }
      if (newZ > maxZ) { newZ = maxZ; velocity.z = 0; collided = true; }
    }

    // --- Circle colliders (player vs enemies/obstacles) ---
    for (const c of circles) {
      const dx = newX - c.x;
      const dz = newZ - c.z;
      const dist = Math.hypot(dx, dz);
      const minDist = radius + c.radius;
      if (dist < minDist) {
        if (dist > 1e-6) {
          // Push entity out along the collision normal
          const push = minDist - dist;
          newX += (dx / dist) * push;
          newZ += (dz / dist) * push;
        } else {
          // Exactly overlapping — push out along X axis as fallback
          newX += minDist;
        }
        collided = true;
      }
    }

    // --- Rectangle colliders (player vs walls/partitions) ---
    // Axis-separated resolution: resolve X first (keeping pre-rect Z), then
    // resolve Z (using resolved X). This produces wall-sliding behaviour and
    // pushes the entity back along the axis of motion rather than to the
    // nearest edge (which could be the wrong side when entering at speed).
    const preRectZ = newZ;

    // X pass — only resolve when the entity is actually moving in X. This
    // prevents the Z pass from being pre-empted by a spurious sideways push
    // when the entity enters a rect purely along the Z axis.
    if (velocity.x !== 0) {
      for (const r of rects) {
        const closestX = Math.max(r.x - r.halfWidth, Math.min(newX, r.x + r.halfWidth));
        const closestZ = Math.max(r.z - r.halfDepth, Math.min(preRectZ, r.z + r.halfDepth));
        const dx = newX - closestX;
        const dz = preRectZ - closestZ;
        const dist = Math.hypot(dx, dz);

        if (dist < radius) {
          if (velocity.x > 0) {
            // Moving in +X — stop at the left face of the rect.
            newX = r.x - r.halfWidth - radius;
          } else {
            // Moving in -X — stop at the right face of the rect.
            newX = r.x + r.halfWidth + radius;
          }
          velocity.x = 0;
          collided = true;
        }
      }
    }

    // Z pass — resolve Z using the (possibly adjusted) X position.
    if (velocity.z !== 0) {
      for (const r of rects) {
        const closestX = Math.max(r.x - r.halfWidth, Math.min(newX, r.x + r.halfWidth));
        const closestZ = Math.max(r.z - r.halfDepth, Math.min(newZ, r.z + r.halfDepth));
        const dx = newX - closestX;
        const dz = newZ - closestZ;
        const dist = Math.hypot(dx, dz);

        if (dist < radius) {
          if (velocity.z > 0) {
            // Moving in +Z — stop at the near face of the rect.
            newZ = r.z - r.halfDepth - radius;
          } else {
            // Moving in -Z — stop at the far face of the rect.
            newZ = r.z + r.halfDepth + radius;
          }
          velocity.z = 0;
          collided = true;
        }
      }
    }

    return { x: newX, z: newZ, collided };
  }

  /**
   * Build a normalized movement direction from WASD-style input flags.
   *
   * @param forward  W key
   * @param back     S key
   * @param left     A key
   * @param right    D key
   * @returns normalized {dx, dz} or {0,0} if no input
   *
   * Convention: forward (-Z), back (+Z), left (-X), right (+X).
   */
  static directionFromInput(
    forward: boolean,
    back: boolean,
    left: boolean,
    right: boolean,
  ): Vec2 {
    let dx = 0;
    let dz = 0;
    if (forward) dz -= 1;
    if (back) dz += 1;
    if (left) dx -= 1;
    if (right) dx += 1;

    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return { x: 0, z: 0 };
    return { x: dx / len, z: dz / len };
  }
}