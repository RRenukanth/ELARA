// Minimal seedable pseudo-random number generator (mulberry32).
//
// Used by limeExplainerService.js to generate perturbed samples. A seedable
// RNG lets tests assert deterministic LIME output; production calls omit
// the seed (falls back to a random one) so repeated explanations of the
// same input sample slightly different neighborhoods, same as the
// reference `lime` Python library's default behavior.

function createRng(seed) {
  let state = seed >>> 0 || Math.floor(Math.random() * 0xffffffff);

  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample via Box-Muller, driven by a uniform RNG function. */
function nextGaussian(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

module.exports = { createRng, nextGaussian };
