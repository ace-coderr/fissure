// A port of Fissure's PRNG (src/prng.fe) to BigInt. 256-bit wrapping arithmetic,
// exactly as the Fe code. `npm run data` checks this port against values the Fe
// code itself produced (site/data/raw/original.txt) and fails if any differ, so
// whatever this file generates on the site is what Fissure's PRNG generates.

const MASK = (1n << 256n) - 1n;
const GAMMA = 0x9e3779b97f4a7c15f39cc0605cedc834n;
const M1 = 0xbf58476d1ce4e5b9n;
const M2 = 0x94d049bb133111ebn;
const D1 = 0x9e3779b97f4a7c15n;
const D2 = 0x632be59bd9b4e019n;

export class FissurePrng {
  private state: bigint;

  constructor(seed: bigint) {
    this.state = seed & MASK;
  }

  /** The next 256-bit word (`Draw::next`). */
  next(): bigint {
    this.state = (this.state + GAMMA) & MASK;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * M1) & MASK;
    z = ((z ^ (z >> 27n)) * M2) & MASK;
    z = z ^ (z >> 31n);
    z = (z ^ (z << 128n)) & MASK;
    return z;
  }

  /** A value in [0, n) (`Draw::below`; 0 when n is 0). */
  below(n: number): number {
    if (n <= 0) return 0;
    return Number(this.next() % BigInt(n));
  }
}

/** `Prng::derive(seed, index)`: the seed of a sub-stream. */
export function derive(seed: bigint, index: bigint): bigint {
  const state = (seed & MASK) ^ ((index * D1 + D2) & MASK);
  return new FissurePrng(state).next();
}
