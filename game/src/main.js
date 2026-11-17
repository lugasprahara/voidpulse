// VOIDPULSE — the game itself: state machine, wave director, collisions,
// score and the rift/nova economy. Modules: config (tuning), input (poll),
// audio (synth), entities (things that move), render (things that draw),
// shots (screenshot poses). This file is the rules that connect them.
//
// The one-sentence game: fly a neon dart through a swarm, shoot, dash —
// and when a gravity rift tears open, decide whether to fear it or feed it.
// A charged rift goes nova and clears the screen; an ignored one swallows
// your cover and spits nothing back. Every fifth wave, the Dread Star.

import { COLORS, ENEMY_STYLE, PLAYER, RIFT, VIEW_W, VIEW_H, WAVES, STORAGE_KEY } from './config.js';
import { Input } from './input.js';
import { SoundEngine } from './audio.js';
import { Renderer } from './render.js';
import {
  Rift, burst, makeBoss, makeBullet, makeEnemy, makePickup, makePlayer, makeText,
  overlaps, tryDash, updateBullet, updateEnemy, updateParticle, updatePickup,
  updatePlayer, updateText,
} from './entities.js';
import { chance, pick, rand, randRange } from './random.js';
import { parseShot, poseGameOver, poseScene } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = new Input(canvas, VIEW_W, VIEW_H);
const sound = new SoundEngine();
const renderer = new Renderer(ctx);
const shot = parseShot();

const game = {
  state: 'title',
  t: 0,
  timeScale: 1,
  hitstop: 0,
  trauma: 0,
  player: makePlayer(VIEW_W / 2, VIEW_H / 2),
  enemies: [],
  bullets: [],
  bolts: [],
  pickups: [],
  particles: [],
  texts: [],
  rifts: [],
  novas: [],
  boss: null,
  score: 0,
  best: 0,
  wave: 0,
  queue: [],
  spawnTimer: 0,
  breather: 0,
  riftTimer: RIFT.firstAt,
  chain: 0,
  chainTimer: 0,
  multiplier: 1,
  banner: '',
  bannerTimer: 0,
  over: false,
  overTimer: 0,
  overShown: false,
  muted: false,
  invulnerable: false,
};

try {
  game.best = Number(localStorage.getItem(STORAGE_KEY) ?? 0) || 0;
} catch {
  game.best = 0;
}

// --- spawning ---------------------------------------------------------------

function edgePoint(minPlayerDist = 280) {
  for (let tries = 0; tries < 12; tries++) {
    const side = Math.floor(rand() * 4);
    let x = 0;
    let y = 0;
    if (side === 0) { x = randRange(30, VIEW_W - 30); y = 26; }
    if (side === 1) { x = randRange(30, VIEW_W - 30); y = VIEW_H - 26; }
    if (side === 2) { x = 26; y = randRange(30, VIEW_H - 30); }
    if (side === 3) { x = VIEW_W - 26; y = randRange(30, VIEW_H - 30); }
    const d = Math.hypot(x - game.player.x, y - game.player.y);
    if (d >= minPlayerDist) return { x, y };
  }
  return { x: 40, y: 40 };
}

function queueWave(n) {
  const q = [];
  if (n % WAVES.bossEvery === 0) {
    const escorts = 3 + Math.floor(n / WAVES.bossEvery);
    for (let i = 0; i < escorts; i++) q.push(pick(['weaver', 'weaver', 'darter', 'orbiter']));
    return q;
  }
  let budget = 5 + n * 2.2;
  const table = [
    ['weaver', 1, 1],
    ['mini', 1, 1],
    ['darter', 2, 2],
    ['splitter', 2, 3],
    ['orbiter', 3, 4],
    ['brute', 5, 6],
  ];
  while (budget > 0) {
    const options = table.filter(([, cost, from]) => n >= from && cost <= budget + 1);
    const [type, cost] = pick(options);
    q.push(type);
    budget -= cost;
    if (q.length > 42) break;
  }
  return q;
}

function startWave(n) {
  game.wave = n;
  game.queue = queueWave(n);
  game.spawnTimer = 0.7;
  const isBoss = n % WAVES.bossEvery === 0;
  game.banner = isBoss ? 'THE DREAD STAR' : `WAVE ${n}`;
  game.bannerTimer = 1.9;
  sound.waveStart();
  if (isBoss) {
    const boss = makeBoss(VIEW_W / 2, 120, 1 + (n / WAVES.bossEvery - 1) * 0.7);
    game.enemies.push(boss);
    game.boss = boss;
    sound.bossAlarm();
    sound.bossMode = true;
  }
}

game.spawnRift = (x, y, instant = false) => {
  const rift = new Rift(x, y);
  if (instant) rift.phase = 'active';
  game.rifts.push(rift);
  sound.riftOpen();
  return rift;
};

function scheduleRift(dt) {
  game.riftTimer -= dt;
  if (game.riftTimer <= 0) {
    game.riftTimer = RIFT.every * randRange(0.85, 1.2);
    let x = VIEW_W / 2;
    let y = VIEW_H / 2;
    for (let tries = 0; tries < 10; tries++) {
      x = randRange(170, VIEW_W - 170);
      y = randRange(150, VIEW_H - 150);
      if (Math.hypot(x - game.player.x, y - game.player.y) > 250) break;
    }
    game.spawnRift(x, y);
  }
}

// --- combat -------------------------------------------------------------------

function addScore(points, x, y, big = false) {
  const gained = Math.round(points * game.multiplier);
  game.score += gained;
  game.texts.push(makeText(x, y - 14, `+${gained}`, big ? COLORS.core : '#cfe6ff', big ? 21 : 13));
}

function killEnemy(e, award = true) {
  e.dead = true;
  const style = ENEMY_STYLE[e.type];
  burst(game.particles, e.x, e.y, {
    count: e.type === 'boss' ? 90 : e.type === 'brute' ? 30 : 14,
    color: style.color,
    speed: e.type === 'boss' ? 520 : 320,
    life: e.type === 'boss' ? 0.9 : 0.5,
    size: e.type === 'boss' ? 4.4 : 3,
  });
  burst(game.particles, e.x, e.y, { count: 6, color: '#ffffff', speed: 160, life: 0.3, size: 2 });
  sound.enemyDie(e.type === 'brute' || e.type === 'boss');
  if (!award) return;
  game.chain += 1;
  game.chainTimer = 2.5;
  game.multiplier = Math.min(9, 1 + Math.floor(game.chain / 8));
  addScore(e.score, e.x, e.y, e.type === 'brute' || e.type === 'boss');
  const cores = e.type === 'boss' ? 12 : e.type === 'brute' ? 3 : 1;
  for (let i = 0; i < cores; i++) game.pickups.push(makePickup('core', e.x, e.y));
  if (e.type === 'brute' && chance(0.55)) game.pickups.push(makePickup('heart', e.x, e.y));
  else if (chance(0.035)) game.pickups.push(makePickup('heart', e.x, e.y));
  if (chance(0.045)) game.pickups.push(makePickup('overdrive', e.x, e.y));
  if (chance(0.03)) game.pickups.push(makePickup('aegis', e.x, e.y));
  if (e.type === 'splitter') {
    for (let i = 0; i < 3; i++) {
      const mini = makeEnemy('mini', e.x + randRange(-16, 16), e.y + randRange(-16, 16), 1);
      mini.spawnIn = 0.12;
      game.enemies.push(mini);
    }
  }
  if (e.type === 'boss') {
    game.boss = null;
    sound.bossMode = false;
    game.trauma = 1;
    game.hitstop = 0.12;
    game.texts.push(makeText(e.x, e.y - 60, 'DREAD STAR DOWN', COLORS.core, 30));
  } else if (e.type === 'brute') {
    game.trauma = Math.min(1, game.trauma + 0.35);
  }
}

function damagePlayer(amount) {
  const p = game.player;
  if (game.invulnerable || p.invuln > 0 || p.dashTimer > 0 || game.over) return;
  if (p.aegis > 0) {
    p.aegis -= 1;
    p.invuln = 0.9;
    game.texts.push(makeText(p.x, p.y - 26, 'AEGIS', COLORS.aegis, 15));
    burst(game.particles, p.x, p.y, { count: 12, color: COLORS.aegis, speed: 240, life: 0.35, size: 2.6 });
    sound.pickup();
    return;
  }
  p.hp -= amount;
  p.invuln = PLAYER.invulnAfterHit;
  game.trauma = Math.min(1, game.trauma + 0.45);
  game.hitstop = Math.max(game.hitstop, 0.045);
  burst(game.particles, p.x, p.y, { count: 14, color: COLORS.heart, speed: 300, life: 0.4, size: 3 });
  sound.playerHit();
  if (p.hp <= 0) game.beginGameOver();
}

game.beginGameOver = () => {
  if (game.over) return;
  game.over = true;
  game.overTimer = 0;
  const p = game.player;
  p.dead = true;
  burst(game.particles, p.x, p.y, { count: 70, color: COLORS.player, speed: 520, life: 0.9, size: 4 });
  burst(game.particles, p.x, p.y, { count: 40, color: COLORS.core, speed: 340, life: 0.7, size: 3 });
  game.trauma = 1;
  sound.enemyDie(true);
};

function finishGameOver() {
  game.state = 'over';
  game.overShown = true;
  if (game.score > game.best) {
    game.best = game.score;
    try {
      localStorage.setItem(STORAGE_KEY, String(game.best));
    } catch {
      // Private modes may refuse storage; the best score is a nicety only.
    }
  }
  sound.gameOver();
  sound.bossMode = false;
}

function detonateRift(rift) {
  rift.dead = true;
  game.novas.push({ x: rift.x, y: rift.y, radius: RIFT.novaRadius, life: 0.5, maxLife: 0.5 });
  burst(game.particles, rift.x, rift.y, { count: 60, color: '#d8a4ff', speed: 560, life: 0.7, size: 3.6 });
  burst(game.particles, rift.x, rift.y, { count: 24, color: '#ffffff', speed: 300, life: 0.4, size: 2.4 });
  game.trauma = 1;
  game.hitstop = Math.max(game.hitstop, 0.08);
  sound.nova();
  let kills = 0;
  for (const e of game.enemies) {
    if (e.spawnIn > 0) continue;
    const d = Math.hypot(e.x - rift.x, e.y - rift.y);
    if (d < RIFT.novaRadius) {
      e.hp -= RIFT.novaDamage;
      e.flash = 0.09;
      if (e.hp <= 0 && !e.dead) {
        killEnemy(e);
        kills += 1;
      }
    }
  }
  if (kills > 0) addScore(150 * kills, rift.x, rift.y - 40, true);
  game.texts.push(makeText(rift.x, rift.y + 52, 'NOVA', '#e8ccff', 26));
}

// --- per-frame update -----------------------------------------------------------

function fireBullet() {
  const p = game.player;
  const spread = randRange(-0.022, 0.022);
  const noseX = p.x + Math.cos(p.angle) * 20;
  const noseY = p.y + Math.sin(p.angle) * 20;
  game.bullets.push(makeBullet(noseX, noseY, p.angle + spread, true));
  p.fireTimer = PLAYER.fireInterval * (p.overdrive > 0 ? 0.48 : 1);
  sound.shoot();
}

function bossExtras(boss, dt) {
  if (boss.ringTimer <= 0 && boss.attack !== 'enter') {
    const n = 14;
    const baseA = boss.spin * 2;
    for (let i = 0; i < n; i++) {
      const a = baseA + (i / n) * Math.PI * 2;
      game.bolts.push(makeBullet(boss.x, boss.y, a, false));
    }
    boss.ringTimer = boss.hp < boss.maxHp * 0.4 ? 2.0 : 2.7;
    sound.enemyHit();
  }
  if (boss.justSummoned) {
    boss.justSummoned = false;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rand();
      const e = makeEnemy('weaver', boss.x + Math.cos(a) * 90, boss.y + Math.sin(a) * 90, 1);
      game.enemies.push(e);
    }
  }
}

function updatePlaying(dt) {
  const p = game.player;

  if (!game.over) {
    if (input.dashQueued() && tryDash(p, input)) {
      sound.dash();
      burst(game.particles, p.x, p.y, { count: 8, color: COLORS.player, speed: 150, life: 0.3, size: 2.4 });
    }
    updatePlayer(p, dt, input);
    // Rift gravity tugs the player too — gently; a dash always escapes it.
    for (const rift of game.rifts) {
      if (!rift.active) continue;
      const pull = rift.pull(p.x, p.y, 0.34);
      p.x += pull.ax * dt * dt * 60;
      p.y += pull.ay * dt * dt * 60;
    }
    if (game.autoFire) {
      // Screenshot poses only: the ship aims at the nearest foe and fires,
      // so a capture shows a real fight. startRun() clears this flag.
      let target = null;
      let bestD = Infinity;
      for (const e of game.enemies) {
        if (e.spawnIn > 0) continue;
        const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
        if (d < bestD) {
          bestD = d;
          target = e;
        }
      }
      if (target) {
        p.angle = Math.atan2(target.y - p.y, target.x - p.x);
        if (p.fireTimer <= 0) fireBullet();
      }
    } else if (input.firing() && p.fireTimer <= 0) {
      fireBullet();
    }
    scheduleRift(dt);
  }

  // Spawning.
  if (game.queue.length > 0) {
    game.spawnTimer -= dt;
    if (game.spawnTimer <= 0) {
      const type = game.queue.shift();
      const at = edgePoint();
      const hpScale = 1 + (game.wave - 1) * 0.07;
      game.enemies.push(makeEnemy(type, at.x, at.y, hpScale));
      game.spawnTimer = Math.max(0.26, 0.6 - game.wave * 0.012);
    }
  } else if (game.enemies.length === 0 && !game.over) {
    game.breather -= dt;
    if (game.breather <= 0) {
      game.breather = WAVES.breather;
      startWave(game.wave + 1);
    }
  }

  // Rifts.
  const activeRifts = game.rifts.filter((r) => r.active);
  for (const rift of game.rifts) {
    rift.update(dt);
    if (rift.phase === 'done' && !rift.dead) {
      rift.dead = true;
      burst(game.particles, rift.x, rift.y, { count: 16, color: COLORS.rift, speed: 200, life: 0.35, size: 2.6 });
    }
    if (rift.active && rift.charge >= 100) detonateRift(rift);
  }

  // Enemies.
  for (const e of game.enemies) {
    updateEnemy(e, dt, p, activeRifts);
    if (e.type === 'boss') bossExtras(e, dt);
    if (e.type === 'orbiter' && e.spawnIn <= 0 && e.shootTimer <= 0) {
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      game.bolts.push(makeBullet(e.x, e.y, a, false));
      e.shootTimer = randRange(2.0, 2.9);
    }
    // Swallowed by a rift's core.
    for (const rift of activeRifts) {
      const d = Math.hypot(e.x - rift.x, e.y - rift.y);
      if (d < RIFT.coreRadius && e.type !== 'boss' && e.spawnIn <= 0) {
        e.dead = true;
        rift.charge = Math.min(120, rift.charge + RIFT.chargePerSwallow);
        burst(game.particles, e.x, e.y, { count: 8, color: COLORS.rift, speed: 170, life: 0.3, size: 2.4 });
      }
    }
    // Contact with the player.
    if (!game.over && e.spawnIn <= 0 && overlaps(e, p)) {
      damagePlayer(e.contact);
      const push = Math.atan2(e.y - p.y, e.x - p.x);
      e.vx += Math.cos(push) * 260;
      e.vy += Math.sin(push) * 260;
    }
  }
  // Gentle separation so the swarm reads as individuals, not a blob.
  const foes = game.enemies;
  for (let i = 0; i < foes.length; i++) {
    for (let j = i + 1; j < foes.length; j++) {
      const a = foes[i];
      const b = foes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const rr = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.01 && d2 < rr * rr) {
        const d = Math.sqrt(d2);
        const push = ((rr - d) / d) * 26 * dt;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
      }
    }
  }

  // Bullets.
  for (const b of game.bullets) {
    updateBullet(b, dt, activeRifts);
    if (b.dead) continue;
    for (const rift of activeRifts) {
      if (Math.hypot(b.x - rift.x, b.y - rift.y) < RIFT.coreRadius + 4) {
        b.dead = true;
        rift.charge = Math.min(120, rift.charge + RIFT.chargePerBullet);
        burst(game.particles, b.x, b.y, { count: 4, color: '#d8a4ff', speed: 130, life: 0.25, size: 2 });
        break;
      }
    }
    if (b.dead) continue;
    for (const e of game.enemies) {
      if (e.dead || e.spawnIn > 0) continue;
      if (overlaps(b, e)) {
        b.dead = true;
        e.hp -= PLAYER.bulletDamage;
        e.flash = 0.08;
        burst(game.particles, b.x, b.y, { count: 3, color: ENEMY_STYLE[e.type].color, speed: 190, life: 0.25, size: 2 });
        if (e.hp <= 0) killEnemy(e);
        else sound.enemyHit();
        break;
      }
    }
  }
  for (const b of game.bolts) {
    updateBullet(b, dt, []);
    if (!b.dead && !game.over && overlaps(b, p)) {
      b.dead = true;
      damagePlayer(9);
    }
  }

  // Pickups.
  for (const pk of game.pickups) {
    for (const rift of activeRifts) {
      const pull = rift.pull(pk.x, pk.y, 0.7);
      pk.vx += pull.ax * dt;
      pk.vy += pull.ay * dt;
      if (Math.hypot(pk.x - rift.x, pk.y - rift.y) < RIFT.coreRadius) pk.dead = true;
    }
    updatePickup(pk, dt, p);
    if (!game.over && overlaps(pk, p)) {
      pk.dead = true;
      collectPickup(pk);
    }
  }

  // Particles, texts, novas.
  for (const pt of game.particles) updateParticle(pt, dt);
  for (const t of game.texts) updateText(t, dt);
  for (const n of game.novas) {
    n.life -= dt;
    if (n.life <= 0) n.dead = true;
  }

  // Combo decay.
  if (game.chainTimer > 0) {
    game.chainTimer -= dt;
    if (game.chainTimer <= 0) {
      game.chain = 0;
      game.multiplier = 1;
    }
  }
  game.bannerTimer -= dt;

  // Sweep the dead.
  game.enemies = game.enemies.filter((e) => !e.dead);
  game.bullets = game.bullets.filter((b) => !b.dead);
  game.bolts = game.bolts.filter((b) => !b.dead);
  game.pickups = game.pickups.filter((pk) => !pk.dead);
  game.particles = game.particles.filter((pt) => !pt.dead);
  game.texts = game.texts.filter((t) => !t.dead);
  game.rifts = game.rifts.filter((r) => !r.dead);
  game.novas = game.novas.filter((n) => !n.dead);
  if (game.boss && game.boss.dead) game.boss = null;

  if (game.over) {
    game.overTimer += dt;
    if (game.overTimer > 1.25 && !game.overShown) finishGameOver();
  }
}

function collectPickup(pk) {
  const p = game.player;
  if (pk.type === 'core') {
    game.score += 25 * game.multiplier;
    sound.pickup();
  } else if (pk.type === 'heart') {
    p.hp = Math.min(p.maxHp, p.hp + 26);
    game.texts.push(makeText(p.x, p.y - 26, '+HULL', COLORS.heart, 15));
    sound.powerup();
  } else if (pk.type === 'overdrive') {
    p.overdrive = 8;
    game.texts.push(makeText(p.x, p.y - 26, 'OVERDRIVE', COLORS.overdrive, 16));
    sound.powerup();
  } else if (pk.type === 'aegis') {
    p.aegis = Math.min(2, p.aegis + 1);
    game.texts.push(makeText(p.x, p.y - 26, 'AEGIS', COLORS.aegis, 15));
    sound.powerup();
  }
  burst(game.particles, pk.x, pk.y, { count: 7, color: '#ffffff', speed: 150, life: 0.3, size: 2.2 });
}

function startRun() {
  game.player = makePlayer(VIEW_W / 2, VIEW_H / 2);
  game.enemies = [];
  game.bullets = [];
  game.bolts = [];
  game.pickups = [];
  game.particles = [];
  game.texts = [];
  game.rifts = [];
  game.novas = [];
  game.boss = null;
  game.score = 0;
  game.chain = 0;
  game.chainTimer = 0;
  game.multiplier = 1;
  game.riftTimer = RIFT.firstAt;
  game.breather = 0;
  game.over = false;
  game.overShown = false;
  game.overTimer = 0;
  game.trauma = 0;
  game.autoFire = false;
  game.invulnerable = false;
  game.state = 'playing';
  startWave(1);
}

// Title-screen ambience: a slow rift and a few wandering weavers.
function updateTitle(dt) {
  for (const rift of game.rifts) rift.update(dt);
  game.rifts = game.rifts.filter((r) => !r.dead);
  const ghost = { x: VIEW_W / 2 + Math.cos(game.t * 0.24) * 260, y: VIEW_H / 2 + Math.sin(game.t * 0.31) * 150 };
  for (const e of game.enemies) {
    e.spawnIn = 0;
    updateEnemy(e, dt, ghost, game.rifts.filter((r) => r.active));
  }
  for (const pt of game.particles) updateParticle(pt, dt);
  game.particles = game.particles.filter((pt) => !pt.dead);
  if (chance(dt * 0.25) && game.particles.length < 60) {
    burst(game.particles, randRange(0, VIEW_W), randRange(0, VIEW_H), {
      count: 3, color: COLORS.rift, speed: 60, life: 1.1, size: 2,
    });
  }
}

// --- render ----------------------------------------------------------------------

function render() {
  const shakeAmp = game.trauma * game.trauma * 17;
  const sx = randRange(-1, 1) * shakeAmp;
  const sy = randRange(-1, 1) * shakeAmp;
  renderer.drawBackdrop(game.t, sx, sy);
  ctx.save();
  ctx.translate(sx, sy);
  for (const rift of game.rifts) renderer.drawRift(rift, game.t);
  for (const pk of game.pickups) renderer.drawPickup(pk, game.t);
  for (const b of game.bullets) renderer.drawBullet(b);
  for (const b of game.bolts) renderer.drawBullet(b);
  for (const e of game.enemies) renderer.drawEnemy(e, game.t);
  if (game.state !== 'title' && !game.player.dead) renderer.drawPlayer(game.player, game.t);
  for (const n of game.novas) renderer.drawNova(n, game.t);
  renderer.drawParticles(game.particles);
  renderer.drawTexts(game.texts);
  ctx.restore();

  if (game.state === 'title') {
    renderer.drawTitle(game, game.t);
  } else {
    renderer.drawHUD(game, game.t);
    if (game.state === 'paused') renderer.drawPaused();
    if (game.state === 'over') renderer.drawGameOver(game, game.t);
  }
}

// --- top-level loop -----------------------------------------------------------------

let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  let rawDt = Math.min(0.033, (now - last) / 1000);
  last = now;
  game.t += rawDt;

  if (input.pressed.has('KeyM')) {
    game.muted = !game.muted;
    sound.setMuted(game.muted);
  }

  if (game.state === 'title') {
    updateTitle(rawDt);
    if (input.clicked || input.pressed.has('Enter') || input.pressed.has('Space')) {
      sound.unlock();
      startRun();
    }
  } else if (game.state === 'playing') {
    if (input.pressed.has('Escape') || input.pressed.has('KeyP')) {
      game.state = 'paused';
    } else {
      if (game.hitstop > 0) {
        game.hitstop -= rawDt;
      } else {
        const scale = game.over && game.overTimer < 0.9 ? 0.3 : 1;
        updatePlaying(rawDt * scale);
      }
    }
  } else if (game.state === 'paused') {
    if (input.pressed.has('Escape') || input.pressed.has('KeyP')) game.state = 'playing';
  } else if (game.state === 'over') {
    updateTitle(rawDt * 0.4);
    if (game.t - (game.overAt ?? 0) > 0.4 && (input.pressed.has('KeyR') || input.clicked)) {
      sound.unlock();
      startRun();
    }
  }

  game.trauma = Math.max(0, game.trauma - rawDt * 1.7);
  sound.bossMode = Boolean(game.boss);
  if (game.state === 'playing' || game.state === 'title') sound.update();
  render();
  input.endFrame();
  if (game.state === 'over' && !game.overAt) game.overAt = game.t;
  if (game.state !== 'over') game.overAt = 0;
}

// --- screenshot poses ---------------------------------------------------------------

if (shot) {
  if (shot.name === 'title') {
    game.spawnRift(VIEW_W * 0.78, VIEW_H * 0.3, true);
    game.enemies.push(makeEnemy('weaver', VIEW_W * 0.2, VIEW_H * 0.3, 1));
    game.enemies.push(makeEnemy('weaver', VIEW_W * 0.3, VIEW_H * 0.75, 1));
    game.enemies.push(makeEnemy('orbiter', VIEW_W * 0.85, VIEW_H * 0.72, 1));
  } else if (shot.name === 'boss' || shot.name === 'action') {
    game.state = 'playing';
    poseScene(game, shot);
    game.breather = 9999;
    game.riftTimer = 9999;
  } else if (shot.name === 'over') {
    game.state = 'playing';
    poseScene(game, { name: 'action', seed: shot.seed });
    game.breather = 9999;
    game.riftTimer = 9999;
    poseGameOver(game);
  }
}

requestAnimationFrame(frame);
