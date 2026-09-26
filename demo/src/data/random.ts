/**
 * Seeded randomness, so every sample number in the demo is the same on every
 * device and every reload: the presenter rehearses the exact figures the room
 * will see.
 */

/** FNV-1a: a stable 32-bit seed from any string. */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Random {
  /** Uniform in [0, 1). */
  next(): number;
  /** Integer in [min, max]. */
  int(min: number, max: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /** Poisson-distributed count with mean `lambda`. */
  poisson(lambda: number): number;
  /** Normal with the given mean and standard deviation. */
  normal(mean: number, sd: number): number;
  /** One item, chosen with probability proportional to its weight. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T | undefined;
}

/** Mulberry32. */
export function createRandom(seed: string | number): Random {
  let state = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    poisson(lambda) {
      const limit = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k += 1;
        p *= next();
      } while (p > limit && k < 20);
      return k - 1;
    },
    normal(mean, sd) {
      const u = Math.max(next(), 1e-9);
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    weighted(items, weight) {
      const total = items.reduce((sum, item) => sum + Math.max(0, weight(item)), 0);
      if (total <= 0) return undefined;
      let roll = next() * total;
      for (const item of items) {
        roll -= Math.max(0, weight(item));
        if (roll < 0) return item;
      }
      return items[items.length - 1];
    },
  };
}
