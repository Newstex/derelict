/**
 * Rng — Seeded random number generator (mulberry32).
 *
 * This is the ONLY source of randomness in the sim core.
 * No file in src/sim/ should ever call Math.random, Date.now, or performance.now.
 */

export class Rng {
  private state: number;

  constructor(seed: number) {
    // Normalize to unsigned 32-bit integer
    this.state = seed >>> 0;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [min, max] inclusive. */
  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Picks a random element from a non-empty array. */
  pick<T>(arr: T[]): T {
    if (arr.length === 0) {
      throw new Error('Rng.pick: cannot pick from an empty array');
    }
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Returns true with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Returns a float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Creates an independent RNG whose stream is derived from the current state. */
  fork(): Rng {
    return new Rng(this.nextInt(0, 0xffffffff));
  }
}