// VOIDPULSE — shared tuning and palette.
//
// Everything the other modules need to agree on lives here: the arena size,
// the neon palette, and the balance numbers for the player, the swarm, the
// rifts and the Dread Star. Keeping it in one file means the feel of the
// game can be re-tuned without hunting through the logic.

export const VIEW_W = 1280;
export const VIEW_H = 720;

export const COLORS = {
  void: '#05060f',
  grid: 'rgba(64, 84, 190, 0.16)',
  player: '#57f7ff',
  playerCore: '#eaffff',
  bullet: '#a5fbff',
  enemyBolt: '#ff9a3d',
  heart: '#ff5d7a',
  core: '#ffe95d',
  overdrive: '#c792ff',
  aegis: '#6dffb8',
  rift: '#b46bff',
  riftCore: '#2a0a4a',
  textDim: '#8fa3d9',
};

export const ENEMY_STYLE = {
  weaver:   { color: '#ff4fd8', radius: 15, hp: 3,  speed: 118, score: 100, contact: 12 },
  darter:   { color: '#ffb03d', radius: 12, hp: 2,  speed: 92,  score: 150, contact: 10 },
  mini:     { color: '#7dff6a', radius: 9,  hp: 1,  speed: 168, score: 50,  contact: 8 },
  splitter: { color: '#4dff88', radius: 21, hp: 7,  speed: 58,  score: 200, contact: 14 },
  orbiter:  { color: '#3dc9ff', radius: 16, hp: 4,  speed: 104, score: 250, contact: 12 },
  brute:    { color: '#ff4d5e', radius: 30, hp: 24, speed: 42,  score: 500, contact: 22 },
  boss:     { color: '#ff3860', radius: 64, hp: 340, speed: 34, score: 5000, contact: 30 },
};

export const PLAYER = {
  radius: 13,
  accel: 2600,
  maxSpeed: 345,
  damping: 6.2,
  hp: 100,
  fireInterval: 0.125,
  bulletSpeed: 860,
  bulletDamage: 1,
  dashSpeed: 980,
  dashTime: 0.16,
  dashCooldown: 1.5,
  invulnAfterHit: 0.9,
};

export const RIFT = {
  firstAt: 9,        // seconds into a run before the first rift tears open
  every: 15,         // seconds between rifts after that
  telegraph: 0.9,    // warning-ring time before it goes active
  life: 7.5,         // active seconds before it implodes on its own
  radius: 195,       // pull radius
  coreRadius: 34,    // the swallowing heart of it
  chargeNeeded: 100, // charge that turns it into a nova
  chargePerBullet: 9,
  chargePerSwallow: 16,
  novaRadius: 320,
  novaDamage: 60,
};

export const WAVES = {
  breather: 1.6,     // quiet seconds between waves
  bossEvery: 5,      // a Dread Star arrives on waves 5, 10, 15, ...
};

export const STORAGE_KEY = 'voidpulse-best-v1';
