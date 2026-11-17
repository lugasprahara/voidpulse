// A tiny seeded RNG (mulberry32) plus helpers.
//
// The live game seeds this from the clock, but the screenshot poses reseed
// it from the ?seed= parameter, so a posed scene is the same every time it
// is rendered. One shared stream keeps the poses deterministic without
// threading an rng object through every call site.

let state = 0x9e3779b9;

export function seedRandom(seed) {
  state = (seed >>> 0) || 0x9e3779b9;
}

export function rand() {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(min, max) {
  return min + rand() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(randRange(min, max + 1));
}

export function pick(list) {
  return list[Math.floor(rand() * list.length) % list.length];
}

export function chance(p) {
  return rand() < p;
}
