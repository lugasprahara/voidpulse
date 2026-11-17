// Deterministic screenshot poses: ?shot=title|action|boss|over&seed=N.
//
// The screenshots in the entry are real renders of this game, captured from
// these poses. A pose reseeds the shared RNG, builds a scene out of the
// game's own entities, and lets the simulation run — the player is made
// invulnerable and (except on the title pose, which is pure attract mode)
// holds still while the swarm, the rift and the boss do their thing, so
// every capture shows live motion, trails and particles rather than a
// frozen diorama.

import { VIEW_W, VIEW_H } from './config.js';
import { seedRandom, randRange } from './random.js';
import { makeEnemy, makeBoss, makePickup } from './entities.js';

export function parseShot() {
  const params = new URLSearchParams(location.search);
  const name = params.get('shot');
  if (!name) return null;
  const seed = Number(params.get('seed') ?? 1) || 1;
  return { name, seed };
}

// Fills the world for the 'action' and 'boss' poses. `game` is the object
// main.js owns; this module only arranges its pieces.
export function poseScene(game, shot) {
  seedRandom(shot.seed * 7919 + 13);
  const { player } = game;
  player.x = VIEW_W * 0.38;
  player.y = VIEW_H * 0.58;
  player.angle = -0.5;
  player.aegis = 1;
  player.overdrive = 6;
  game.wave = shot.name === 'boss' ? 5 : 3;
  game.score = shot.name === 'boss' ? 18450 : 4200;
  game.chain = 14;
  game.chainTimer = 2.2;
  game.invulnerable = true;
  game.autoFire = true; // the posed ship fights back on its own

  const spawn = (type, fx, fy) => {
    const e = makeEnemy(type, VIEW_W * fx, VIEW_H * fy, 1);
    e.spawnIn = 0;
    game.enemies.push(e);
    return e;
  };

  if (shot.name === 'action') {
    spawn('weaver', 0.72, 0.3);
    spawn('weaver', 0.8, 0.44);
    spawn('weaver', 0.66, 0.2);
    spawn('darter', 0.85, 0.72);
    spawn('splitter', 0.6, 0.82);
    spawn('orbiter', 0.9, 0.16);
    spawn('mini', 0.56, 0.86);
    spawn('mini', 0.63, 0.9);
    game.spawnRift(VIEW_W * 0.68, VIEW_H * 0.52, true);
    game.rifts[0].charge = 46;
    for (let i = 0; i < 5; i++) {
      game.pickups.push(makePickup('core', randRange(300, 900), randRange(160, 560)));
    }
    game.pickups.push(makePickup('overdrive', VIEW_W * 0.24, VIEW_H * 0.3));
  }

  if (shot.name === 'boss') {
    const boss = makeBoss(VIEW_W * 0.68, VIEW_H * 0.4, 6);
    boss.spawnIn = 0;
    boss.hp = Math.round(boss.maxHp * 0.58);
    boss.attack = 'stalk';
    game.enemies.push(boss);
    game.boss = boss;
    spawn('weaver', 0.86, 0.78);
    spawn('weaver', 0.14, 0.2);
    spawn('orbiter', 0.2, 0.8);
    game.spawnRift(VIEW_W * 0.2, VIEW_H * 0.42, true);
    game.rifts[0].charge = 22;
    game.pickups.push(makePickup('heart', VIEW_W * 0.5, VIEW_H * 0.24));
    for (let i = 0; i < 4; i++) {
      game.pickups.push(makePickup('core', randRange(340, 980), randRange(180, 560)));
    }
  }
}

// The 'over' pose reuses a composed action scene, then kills the run so the
// real game-over flow (explosion, slow motion, screen) is what renders.
export function poseGameOver(game) {
  game.player.hp = 0;
  game.beginGameOver();
  game.overTimer = 1.35; // far enough in that the screen has faded up
}
