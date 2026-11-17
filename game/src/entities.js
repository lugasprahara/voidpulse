// Everything that moves: the player, the swarm, the boss, bullets, bolts,
// pickups, particles, floating score text and the gravity rifts.
//
// Entities are plain objects with a `kind`; this module owns their motion
// and behaviour, while render.js owns how they look and main.js owns the
// rules that connect them (damage, score, waves). Angles are radians, the
// world is VIEW_W x VIEW_H, and all speeds are pixels per second.

import { COLORS, ENEMY_STYLE, PLAYER, RIFT, VIEW_W, VIEW_H } from './config.js';
import { rand, randRange, chance } from './random.js';

let nextId = 1;

function base(kind, x, y) {
  return {
    id: nextId++,
    kind,
    x, y,
    vx: 0, vy: 0,
    angle: 0,
    age: 0,
    dead: false,
  };
}

export function makePlayer(x, y) {
  const p = base('player', x, y);
  p.radius = PLAYER.radius;
  p.hp = PLAYER.hp;
  p.maxHp = PLAYER.hp;
  p.fireTimer = 0;
  p.dashTimer = 0;       // > 0 while a dash is in flight
  p.dashCooldown = 0;
  p.dashDirX = 1;
  p.dashDirY = 0;
  p.invuln = 0;          // post-hit grace
  p.overdrive = 0;       // seconds of doubled fire rate left
  p.aegis = 0;           // shield charges that swallow one hit each
  p.trail = [];          // recent positions, for the engine glow
  return p;
}

export function makeEnemy(type, x, y, hpScale = 1) {
  const style = ENEMY_STYLE[type];
  const e = base('enemy', x, y);
  e.type = type;
  e.radius = style.radius;
  e.hp = Math.round(style.hp * hpScale);
  e.maxHp = e.hp;
  e.speed = style.speed * randRange(0.9, 1.1);
  e.score = style.score;
  e.contact = style.contact;
  e.flash = 0;           // white hit-flash timer
  e.spawnIn = 0.45;      // warp-in time before it can act or be hit
  e.state = 'seek';
  e.stateTimer = randRange(0.4, 1.2);
  e.weavePhase = randRange(0, Math.PI * 2);
  e.orbitDir = chance(0.5) ? 1 : -1;
  e.shootTimer = randRange(1.4, 2.6);
  e.chargeX = 0;
  e.chargeY = 0;
  return e;
}

export function makeBoss(x, y, hpScale = 1) {
  const b = makeEnemy('boss', x, y, hpScale);
  b.spawnIn = 1.2;
  b.spin = 0;
  b.attack = 'enter';
  b.attackTimer = 2.2;
  b.ringTimer = 1.1;
  b.chargeWarn = 0;
  return b;
}

export function makeBullet(x, y, angle, friendly) {
  const b = base(friendly ? 'bullet' : 'bolt', x, y);
  const speed = friendly ? PLAYER.bulletSpeed : 265;
  b.vx = Math.cos(angle) * speed;
  b.vy = Math.sin(angle) * speed;
  b.angle = angle;
  b.radius = friendly ? 4 : 6;
  b.life = friendly ? 0.85 : 3.4;
  b.damage = 1;
  return b;
}

export function makePickup(type, x, y) {
  const p = base('pickup', x, y);
  p.type = type; // 'core' | 'heart' | 'overdrive' | 'aegis'
  p.radius = type === 'core' ? 7 : 11;
  p.vx = randRange(-40, 40);
  p.vy = randRange(-40, 40);
  p.bobPhase = randRange(0, Math.PI * 2);
  return p;
}

export function makeText(x, y, str, color, size = 16) {
  const t = base('text', x, y);
  t.str = str;
  t.color = color;
  t.size = size;
  t.life = 0.9;
  return t;
}

// Particle bursts: `burst()` fills an array the renderer draws additively.
export function burst(list, x, y, { count = 10, color = '#ffffff', speed = 260, life = 0.45, size = 3, drag = 3.2 }) {
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const s = speed * randRange(0.25, 1);
    const p = base('particle', x, y);
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s;
    p.life = life * randRange(0.5, 1.15);
    p.maxLife = p.life;
    p.color = color;
    p.size = size * randRange(0.6, 1.5);
    p.drag = drag;
    list.push(p);
  }
}

// A gravity rift: telegraphs, then pulls everything toward its core while
// it charges. Charge it (bullets, swallowed enemies) and it goes nova.
export class Rift {
  constructor(x, y) {
    this.kind = 'rift';
    this.x = x;
    this.y = y;
    this.phase = 'telegraph'; // telegraph -> active -> done
    this.timer = RIFT.telegraph;
    this.life = RIFT.life;
    this.charge = 0;
    this.spin = randRange(0, Math.PI * 2);
    this.dead = false;
    this.swirl = []; // accretion particles, positions relative to centre
    for (let i = 0; i < 42; i++) {
      this.swirl.push({ a: rand() * Math.PI * 2, r: randRange(46, RIFT.radius), s: randRange(0.6, 1.6) });
    }
  }

  get active() {
    return this.phase === 'active';
  }

  update(dt) {
    this.spin += dt * 2.4;
    for (const s of this.swirl) {
      s.a += dt * s.s * 2.2;
      s.r -= dt * 26;
      if (s.r < 30) {
        s.r = RIFT.radius * randRange(0.75, 1);
        s.a = rand() * Math.PI * 2;
      }
    }
    if (this.phase === 'telegraph') {
      this.timer -= dt;
      if (this.timer <= 0) this.phase = 'active';
    } else if (this.phase === 'active') {
      this.life -= dt;
      if (this.life <= 0) this.phase = 'done';
    }
    if (this.phase === 'done') this.dead = true;
  }

  // Acceleration this rift applies to a body at (x, y); `strength` scales
  // per body type so enemies fall in far harder than the player does.
  pull(x, y, strength) {
    const dx = this.x - x;
    const dy = this.y - y;
    const d2 = dx * dx + dy * dy;
    const d = Math.sqrt(d2) || 1;
    if (d > RIFT.radius) return { ax: 0, ay: 0, dist: d };
    const f = strength * (1.15 - d / RIFT.radius) * 1500;
    return { ax: (dx / d) * f, ay: (dy / d) * f, dist: d };
  }
}

// --- per-kind updates -------------------------------------------------------

export function updatePlayer(p, dt, input) {
  const axis = input.moveAxis();
  if (p.dashTimer > 0) {
    p.dashTimer -= dt;
    p.vx = p.dashDirX * PLAYER.dashSpeed;
    p.vy = p.dashDirY * PLAYER.dashSpeed;
  } else {
    p.vx += axis.x * PLAYER.accel * dt;
    p.vy += axis.y * PLAYER.accel * dt;
    const damp = Math.exp(-PLAYER.damping * dt);
    p.vx *= damp;
    p.vy *= damp;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > PLAYER.maxSpeed) {
      p.vx = (p.vx / sp) * PLAYER.maxSpeed;
      p.vy = (p.vy / sp) * PLAYER.maxSpeed;
    }
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.x = Math.max(p.radius, Math.min(VIEW_W - p.radius, p.x));
  p.y = Math.max(p.radius, Math.min(VIEW_H - p.radius, p.y));
  p.angle = Math.atan2(input.mouseY - p.y, input.mouseX - p.x);

  p.fireTimer -= dt;
  p.dashCooldown -= dt;
  p.invuln -= dt;
  p.overdrive -= dt;

  p.trail.unshift({ x: p.x, y: p.y });
  if (p.trail.length > 12) p.trail.pop();
}

export function tryDash(p, input) {
  if (p.dashCooldown > 0 || p.dashTimer > 0) return false;
  const axis = input.moveAxis();
  let dx = axis.x;
  let dy = axis.y;
  if (dx === 0 && dy === 0) {
    dx = Math.cos(p.angle);
    dy = Math.sin(p.angle);
  }
  const len = Math.hypot(dx, dy) || 1;
  p.dashDirX = dx / len;
  p.dashDirY = dy / len;
  p.dashTimer = PLAYER.dashTime;
  p.dashCooldown = PLAYER.dashCooldown;
  return true;
}

// Enemy behaviour. `pulls` is the list of active rifts; their gravity is
// folded into every enemy's acceleration before its own steering.
export function updateEnemy(e, dt, player, pulls) {
  e.age += dt;
  e.flash -= dt;
  if (e.spawnIn > 0) {
    e.spawnIn -= dt;
    return;
  }
  let ax = 0;
  let ay = 0;
  for (const rift of pulls) {
    const pull = rift.pull(e.x, e.y, e.type === 'boss' ? 0.25 : 1);
    ax += pull.ax;
    ay += pull.ay;
  }
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;

  switch (e.type) {
    case 'weaver': {
      const wob = Math.sin(e.age * 5 + e.weavePhase) * 0.55;
      const px = -uy * wob;
      const py = ux * wob;
      ax += (ux + px) * 900;
      ay += (uy + py) * 900;
      break;
    }
    case 'mini': {
      ax += ux * 1250;
      ay += uy * 1250;
      break;
    }
    case 'splitter':
    case 'brute': {
      ax += ux * 620;
      ay += uy * 620;
      break;
    }
    case 'darter': {
      e.stateTimer -= dt;
      if (e.state === 'seek') {
        ax += ux * 700;
        ay += uy * 700;
        if (e.stateTimer <= 0 && dist < 430) {
          e.state = 'aim';
          e.stateTimer = 0.45;
          e.chargeX = ux;
          e.chargeY = uy;
        }
      } else if (e.state === 'aim') {
        e.vx *= 0.86;
        e.vy *= 0.86;
        e.chargeX = ux;
        e.chargeY = uy;
        if (e.stateTimer <= 0) {
          e.state = 'dash';
          e.stateTimer = 0.42;
          e.vx = e.chargeX * 640;
          e.vy = e.chargeY * 640;
        }
      } else if (e.state === 'dash') {
        if (e.stateTimer <= 0) {
          e.state = 'seek';
          e.stateTimer = randRange(0.5, 1.1);
        }
      }
      break;
    }
    case 'orbiter': {
      const want = 265;
      const radial = dist > want + 24 ? 1 : dist < want - 24 ? -1 : 0;
      ax += (ux * radial + -uy * e.orbitDir * 0.8) * 760;
      ay += (uy * radial + ux * e.orbitDir * 0.8) * 760;
      e.shootTimer -= dt;
      break;
    }
    case 'boss': {
      updateBoss(e, dt, ux, uy, dist);
      break;
    }
    default:
      break;
  }

  e.vx += ax * dt;
  e.vy += ay * dt;
  const damp = Math.exp(-2.6 * dt);
  e.vx *= damp;
  e.vy *= damp;
  const sp = Math.hypot(e.vx, e.vy);
  const cap = e.type === 'darter' && e.state === 'dash' ? 680 : e.speed * 2.1;
  if (sp > cap) {
    e.vx = (e.vx / sp) * cap;
    e.vy = (e.vy / sp) * cap;
  }
  e.x += e.vx * dt;
  e.y += e.vy * dt;
  e.x = Math.max(e.radius, Math.min(VIEW_W - e.radius, e.x));
  e.y = Math.max(e.radius, Math.min(VIEW_H - e.radius, e.y));
  if (e.type !== 'boss') e.angle = Math.atan2(e.vy, e.vx);
}

function updateBoss(b, dt, ux, uy, dist) {
  b.spin += dt * 0.9;
  b.attackTimer -= dt;
  if (b.attack === 'enter') {
    b.vx += ux * 300 * dt;
    b.vy += uy * 300 * dt;
    if (dist < 420 || b.attackTimer <= 0) {
      b.attack = 'stalk';
      b.attackTimer = randRange(2.4, 3.4);
    }
    return;
  }
  if (b.attack === 'stalk') {
    b.vx += ux * 210 * dt;
    b.vy += uy * 210 * dt;
    if (b.attackTimer <= 0) {
      b.attack = chance(0.5) ? 'warn' : 'summon';
      b.attackTimer = b.attack === 'warn' ? 0.8 : 0.1;
      b.chargeX = ux;
      b.chargeY = uy;
    }
  } else if (b.attack === 'warn') {
    b.vx *= 0.9;
    b.vy *= 0.9;
    b.chargeX = ux;
    b.chargeY = uy;
    b.chargeWarn += dt;
    if (b.attackTimer <= 0) {
      b.attack = 'charge';
      b.attackTimer = 0.55;
      b.vx = b.chargeX * 560;
      b.vy = b.chargeY * 560;
      b.chargeWarn = 0;
    }
  } else if (b.attack === 'charge') {
    if (b.attackTimer <= 0) {
      b.attack = 'stalk';
      b.attackTimer = randRange(2.2, 3.2);
    }
  } else if (b.attack === 'summon') {
    b.attack = 'stalk';
    b.attackTimer = randRange(2.4, 3.4);
    b.justSummoned = true;
  }
  b.ringTimer -= dt;
}

export function updateBullet(b, dt, pulls) {
  b.age += dt;
  if (b.kind === 'bullet') {
    for (const rift of pulls) {
      const pull = rift.pull(b.x, b.y, 0.35);
      b.vx += pull.ax * dt;
      b.vy += pull.ay * dt;
    }
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  if (b.age > b.life || b.x < -30 || b.x > VIEW_W + 30 || b.y < -30 || b.y > VIEW_H + 30) {
    b.dead = true;
  }
}

export function updatePickup(p, dt, player) {
  p.age += dt;
  const dx = player.x - p.x;
  const dy = player.y - p.y;
  const dist = Math.hypot(dx, dy) || 1;
  const magnet = p.type === 'core' ? 190 : 120;
  if (dist < magnet) {
    const f = (1 - dist / magnet) * 1500 + 260;
    p.vx += (dx / dist) * f * dt;
    p.vy += (dy / dist) * f * dt;
  }
  const damp = Math.exp(-3.4 * dt);
  p.vx *= damp;
  p.vy *= damp;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (p.age > 14) p.dead = true;
}

export function updateParticle(p, dt) {
  p.age += dt;
  p.life -= dt;
  if (p.life <= 0) {
    p.dead = true;
    return;
  }
  const damp = Math.exp(-p.drag * dt);
  p.vx *= damp;
  p.vy *= damp;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
}

export function updateText(t, dt) {
  t.age += dt;
  t.y -= 44 * dt;
  if (t.age > t.life) t.dead = true;
}

export function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function overlaps(a, b) {
  const r = a.radius + b.radius;
  return dist2(a, b) < r * r;
}

export const PLAYER_COLOR = COLORS.player;
