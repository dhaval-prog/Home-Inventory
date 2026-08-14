/**
 * Deterministic PRNG for one-time procedural layout (cloud puffs, star
 * field, raindrop start positions). Using this instead of Math.random()
 * keeps render-phase generation pure/idempotent (React Compiler requires
 * this) and keeps the layout stable across re-renders — only animation
 * moves things afterward, nothing reshuffles on its own.
 */
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
