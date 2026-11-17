// All drawing. The renderer reads the world state that main.js hands it and
// paints, in order: the deep-space backdrop, rifts, pickups, bullets, the
// swarm, the player, particles and floating text, then the HUD and whatever
// full-screen state (title, pause, game over) is active.
//
// Juice lives here as much as in the logic: additive glow passes, hit
// flashes, screen shake offsets, a pulsing low-health vignette and a combo
// meter that swells as the chain climbs. Shapes are drawn with paths and
// shadowBlur is kept to the few elements that earn it, so the frame stays
// cheap even when the screen is full.

import { COLORS, ENEMY_STYLE, VIEW_W, VIEW_H } from './config.js';

function poly(ctx, x, y, radius, points, angle, squash = 1) {
  ctx.beginPath();
  for (let i = 0; i < points; i++) {
    const a = angle + (i / points) * Math.PI * 2;
    const px = x + Math.cos(a) * radius;
    const py = y + Math.sin(a) * radius * squash;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function star(ctx, x, y, rOuter, rInner, points, angle) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = angle + (i / (points * 2)) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export class Renderer {
  constructor(ctx) {
    this.ctx = ctx;
    this.stars = [];
    for (let layer = 0; layer < 3; layer++) {
      const count = [90, 60, 34][layer];
      for (let i = 0; i < count; i++) {
        this.stars.push({
          x: Math.random() * VIEW_W,
          y: Math.random() * VIEW_H,
          r: 0.6 + layer * 0.7 + Math.random() * 0.8,
          layer,
          tw: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  drawBackdrop(t, shakeX, shakeY) {
    const { ctx } = this;
    const grad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 80, VIEW_W / 2, VIEW_H / 2, 760);
    grad.addColorStop(0, '#0a0d24');
    grad.addColorStop(0.55, '#060818');
    grad.addColorStop(1, COLORS.void);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.save();
    ctx.translate(shakeX * 0.3, shakeY * 0.3);
    for (const s of this.stars) {
      const a = 0.35 + 0.3 * Math.sin(t * (0.6 + s.layer * 0.4) + s.tw);
      ctx.globalAlpha = a;
      ctx.fillStyle = s.layer === 2 ? '#cfe8ff' : '#7d90c9';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // Faint perspective grid, drifting slowly toward the viewer.
    ctx.save();
    ctx.translate(shakeX * 0.5, shakeY * 0.5);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const step = 64;
    const off = (t * 9) % step;
    ctx.beginPath();
    for (let x = -step + off; x < VIEW_W + step; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, VIEW_H);
    }
    for (let y = -step + off; y < VIEW_H + step; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(VIEW_W, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawRift(rift, t) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(rift.x, rift.y);
    if (rift.phase === 'telegraph') {
      const p = 1 - Math.max(0, rift.timer) / 0.9;
      ctx.strokeStyle = `rgba(255, 77, 94, ${0.35 + 0.45 * Math.abs(Math.sin(t * 10))})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.arc(0, 0, 195 * (0.4 + 0.6 * p), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255, 77, 94, 0.85)';
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('RIFT INCOMING', 0, -206 * p - 8);
      ctx.restore();
      return;
    }
    // Pull field boundary.
    ctx.strokeStyle = 'rgba(180, 107, 255, 0.20)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 195, 0, Math.PI * 2);
    ctx.stroke();
    // Accretion swirl.
    ctx.globalCompositeOperation = 'lighter';
    for (const s of rift.swirl) {
      const x = Math.cos(s.a) * s.r;
      const y = Math.sin(s.a) * s.r * 0.92;
      const fade = 1 - s.r / 195;
      ctx.fillStyle = `rgba(196, 132, 255, ${0.12 + fade * 0.5})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.4 + fade * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // The dark heart, rimmed with charge.
    const chargeFrac = Math.min(1, rift.charge / 100);
    const coreGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 40);
    coreGrad.addColorStop(0, '#000000');
    coreGrad.addColorStop(0.75, '#150329');
    coreGrad.addColorStop(1, 'rgba(88, 28, 180, 0.0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(216, 164, 255, ${0.5 + chargeFrac * 0.5})`;
    ctx.lineWidth = 2 + chargeFrac * 2.5;
    ctx.shadowColor = COLORS.rift;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(0, 0, 30 + Math.sin(t * 5) * 2, rift.spin, rift.spin + Math.PI * (1.2 + chargeFrac));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 30 + Math.cos(t * 4) * 2, -rift.spin + 2, -rift.spin + 2 + Math.PI * (1.2 + chargeFrac));
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (chargeFrac > 0.02) {
      ctx.fillStyle = 'rgba(232, 204, 255, 0.9)';
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.floor(chargeFrac * 100)}%`, 0, 58);
    }
    ctx.restore();
  }

  drawPickup(p, t) {
    const { ctx } = this;
    const bob = Math.sin(t * 3.4 + p.bobPhase) * 3;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.globalCompositeOperation = 'lighter';
    if (p.type === 'core') {
      ctx.fillStyle = COLORS.core;
      ctx.shadowColor = COLORS.core;
      ctx.shadowBlur = 10;
      star(ctx, 0, 0, 7, 3, 4, t * 2.4 + p.bobPhase);
      ctx.fill();
    } else if (p.type === 'heart') {
      ctx.fillStyle = COLORS.heart;
      ctx.shadowColor = COLORS.heart;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.bezierCurveTo(-11, -2, -7, -11, 0, -5);
      ctx.bezierCurveTo(7, -11, 11, -2, 0, 8);
      ctx.fill();
    } else if (p.type === 'overdrive') {
      ctx.strokeStyle = COLORS.overdrive;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = COLORS.overdrive;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(2, -10);
      ctx.lineTo(-5, 1);
      ctx.lineTo(0, 1);
      ctx.lineTo(-2, 10);
      ctx.lineTo(6, -2);
      ctx.lineTo(1, -2);
      ctx.closePath();
      ctx.stroke();
    } else if (p.type === 'aegis') {
      ctx.strokeStyle = COLORS.aegis;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = COLORS.aegis;
      ctx.shadowBlur = 12;
      poly(ctx, 0, 0, 10, 6, t * 1.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBullet(b) {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (b.kind === 'bullet') {
      ctx.strokeStyle = COLORS.bullet;
      ctx.lineWidth = 3;
      ctx.shadowColor = COLORS.player;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    } else {
      ctx.fillStyle = COLORS.enemyBolt;
      ctx.shadowColor = COLORS.enemyBolt;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawEnemy(e, t) {
    const { ctx } = this;
    const style = ENEMY_STYLE[e.type];
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.spawnIn > 0) {
      const p = 1 - e.spawnIn / (e.type === 'boss' ? 1.2 : 0.45);
      ctx.globalAlpha = 0.25 + 0.75 * p;
      ctx.scale(0.5 + 0.5 * p, 0.5 + 0.5 * p);
      ctx.strokeStyle = style.color;
      ctx.lineWidth = 1.5;
      poly(ctx, 0, 0, e.radius + 10 * (1 - p), 6, t * 3);
      ctx.stroke();
    }
    ctx.rotate(e.type === 'boss' ? e.spin : e.angle);
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : style.color;
    ctx.shadowColor = style.color;
    ctx.shadowBlur = e.type === 'boss' ? 26 : 13;
    switch (e.type) {
      case 'weaver':
        ctx.beginPath();
        ctx.moveTo(16, 0);
        ctx.lineTo(-11, 10);
        ctx.lineTo(-6, 0);
        ctx.lineTo(-11, -10);
        ctx.closePath();
        ctx.fill();
        break;
      case 'darter': {
        const aiming = e.state === 'aim';
        if (aiming) {
          ctx.fillStyle = '#ffffff';
        }
        ctx.beginPath();
        ctx.moveTo(15, 0);
        ctx.lineTo(-10, 7);
        ctx.lineTo(-10, -7);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'mini':
        poly(ctx, 0, 0, e.radius, 3, t * 4);
        ctx.fill();
        break;
      case 'splitter':
        poly(ctx, 0, 0, e.radius, 6, t * 1.2);
        ctx.fill();
        ctx.fillStyle = 'rgba(5,6,15,0.55)';
        poly(ctx, 0, 0, e.radius * 0.5, 6, -t * 1.2);
        ctx.fill();
        break;
      case 'orbiter':
        ctx.beginPath();
        ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.void;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = e.flash > 0 ? '#ffffff' : style.color;
        ctx.beginPath();
        ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'brute':
        poly(ctx, 0, 0, e.radius, 5, t * 0.7);
        ctx.fill();
        ctx.fillStyle = 'rgba(5,6,15,0.5)';
        poly(ctx, 0, 0, e.radius * 0.58, 5, -t * 0.7);
        ctx.fill();
        break;
      case 'boss':
        star(ctx, 0, 0, e.radius + 14, e.radius * 0.62, 8, 0);
        ctx.fill();
        ctx.fillStyle = 'rgba(5,6,15,0.6)';
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#ffd7de';
        ctx.beginPath();
        ctx.arc(0, 0, 11 + Math.sin(t * 6) * 2.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      default:
        break;
    }
    ctx.restore();

    // Darter aim line and boss charge telegraph.
    if (e.type === 'darter' && e.state === 'aim') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 176, 61, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 7]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + e.chargeX * 460, e.y + e.chargeY * 460);
      ctx.stroke();
      ctx.restore();
    }
    if (e.type === 'boss' && e.attack === 'warn') {
      ctx.save();
      ctx.strokeStyle = `rgba(255, 56, 96, ${0.3 + 0.3 * Math.sin(t * 18)})`;
      ctx.lineWidth = e.radius * 1.5;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + e.chargeX * 900, e.y + e.chargeY * 900);
      ctx.stroke();
      ctx.restore();
    }

    // Mini health ticks for the tougher regular enemies.
    if ((e.type === 'brute' || e.type === 'splitter') && e.hp < e.maxHp) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(e.x - e.radius, e.y - e.radius - 10, e.radius * 2, 3);
      ctx.fillStyle = style.color;
      ctx.fillRect(e.x - e.radius, e.y - e.radius - 10, e.radius * 2 * (e.hp / e.maxHp), 3);
      ctx.restore();
    }
  }

  drawPlayer(p, t) {
    const { ctx } = this;
    ctx.save();
    // Engine trail.
    ctx.globalCompositeOperation = 'lighter';
    p.trail.forEach((pos, i) => {
      const f = 1 - i / p.trail.length;
      ctx.fillStyle = `rgba(87, 247, 255, ${0.10 * f})`;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, p.radius * 0.8 * f, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(p.x, p.y);
    if (p.invuln > 0 && p.dashTimer <= 0 && Math.sin(t * 34) > 0) ctx.globalAlpha = 0.35;
    ctx.rotate(p.angle);
    // Flame.
    const flame = 8 + Math.sin(t * 41) * 3 + Math.hypot(p.vx, p.vy) * 0.012;
    ctx.fillStyle = 'rgba(255, 170, 60, 0.85)';
    ctx.beginPath();
    ctx.moveTo(-11, 4.5);
    ctx.lineTo(-11 - flame, 0);
    ctx.lineTo(-11, -4.5);
    ctx.closePath();
    ctx.fill();
    // Hull.
    ctx.fillStyle = COLORS.player;
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(19, 0);
    ctx.lineTo(-7, 7);
    ctx.lineTo(-13, 12);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-13, -12);
    ctx.lineTo(-7, -7);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = COLORS.playerCore;
    ctx.beginPath();
    ctx.arc(3, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (p.aegis > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(109, 255, 184, ${0.5 + 0.25 * Math.sin(t * 5)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawParticles(list) {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of list) {
      const f = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = f;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * f), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawTexts(list) {
    const { ctx } = this;
    ctx.save();
    ctx.textAlign = 'center';
    for (const t of list) {
      const f = Math.max(0, 1 - t.age / t.life);
      ctx.globalAlpha = Math.min(1, f * 2);
      ctx.fillStyle = t.color;
      ctx.font = `700 ${t.size}px system-ui, sans-serif`;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawNova(nova, t) {
    const { ctx } = this;
    const p = 1 - nova.life / nova.maxLife;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = nova.radius * (0.2 + 0.8 * p);
    ctx.strokeStyle = `rgba(226, 190, 255, ${(1 - p) * 0.9})`;
    ctx.lineWidth = 5 + (1 - p) * 9;
    ctx.shadowColor = COLORS.rift;
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(nova.x, nova.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 255, 255, ${(1 - p) * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(nova.x, nova.y, r * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // --- HUD and screens ------------------------------------------------------

  drawHUD(game, t) {
    const { ctx } = this;
    const p = game.player;
    ctx.save();
    // Hull bar.
    ctx.fillStyle = 'rgba(10, 14, 34, 0.72)';
    ctx.fillRect(18, 16, 264, 46);
    ctx.strokeStyle = 'rgba(120, 150, 255, 0.35)';
    ctx.strokeRect(18, 16, 264, 46);
    ctx.fillStyle = p.hp > 30 ? COLORS.player : COLORS.heart;
    const hpW = Math.max(0, (p.hp / p.maxHp)) * 232;
    if (p.hp <= 30) ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 9);
    ctx.fillRect(34, 30, hpW, 9);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#dfe9ff';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`HULL ${Math.max(0, Math.ceil(p.hp))}`, 34, 24 + 32);
    // Dash pip.
    ctx.fillStyle = p.dashCooldown <= 0 ? COLORS.aegis : 'rgba(140,160,210,0.4)';
    ctx.fillRect(196, 50, 70, 5);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '700 9px system-ui, sans-serif';
    ctx.fillText('DASH', 196, 46);
    ctx.restore();

    // Score block, top right.
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 30px system-ui, sans-serif';
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 12;
    ctx.fillText(String(game.score).padStart(7, '0'), VIEW_W - 24, 44);
    ctx.shadowBlur = 0;
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(`WAVE ${game.wave}`, VIEW_W - 24, 66);
    if (game.multiplier > 1) {
      ctx.fillStyle = COLORS.core;
      ctx.font = `800 ${15 + Math.min(8, game.chain * 0.3)}px system-ui, sans-serif`;
      ctx.fillText(`COMBO x${game.multiplier}`, VIEW_W - 24, 92);
      const frac = Math.max(0, game.chainTimer / 2.5);
      ctx.fillRect(VIEW_W - 24 - 90 * frac, 98, 90 * frac, 3);
    }
    ctx.restore();

    // Boss bar.
    if (game.boss && !game.boss.dead) {
      const b = game.boss;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffb3c0';
      ctx.font = '800 14px system-ui, sans-serif';
      ctx.fillText('D R E A D   S T A R', VIEW_W / 2, 30);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(VIEW_W / 2 - 260, 38, 520, 8);
      ctx.fillStyle = ENEMY_STYLE.boss.color;
      ctx.fillRect(VIEW_W / 2 - 260, 38, 520 * Math.max(0, b.hp / b.maxHp), 8);
      ctx.restore();
    }

    // Wave banner.
    if (game.banner && game.bannerTimer > 0) {
      ctx.save();
      const a = Math.min(1, game.bannerTimer / 0.5);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 44px system-ui, sans-serif';
      ctx.shadowColor = COLORS.rift;
      ctx.shadowBlur = 24;
      ctx.fillText(game.banner, VIEW_W / 2, 150);
      ctx.restore();
    }

    // Low-hull vignette.
    if (p.hp <= 30 && game.state === 'playing') {
      const pulse = 0.16 + 0.1 * Math.sin(t * 6);
      const grad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 260, VIEW_W / 2, VIEW_H / 2, 720);
      grad.addColorStop(0, 'rgba(255, 30, 60, 0)');
      grad.addColorStop(1, `rgba(255, 30, 60, ${pulse})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (game.muted) {
      ctx.save();
      ctx.fillStyle = COLORS.textDim;
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('MUTED (M)', VIEW_W - 24, VIEW_H - 16);
      ctx.restore();
    }
  }

  drawTitle(game, t) {
    const { ctx } = this;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 92px system-ui, sans-serif';
    ctx.shadowColor = COLORS.rift;
    ctx.shadowBlur = 34;
    ctx.fillText('VOID', VIEW_W / 2, 252);
    ctx.fillStyle = COLORS.player;
    ctx.shadowColor = COLORS.player;
    ctx.fillText('PULSE', VIEW_W / 2, 344);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#c6d4ff';
    ctx.font = '600 19px system-ui, sans-serif';
    ctx.fillText('Bend the rifts. Swallow the swarm. Break the Dread Star.', VIEW_W / 2, 396);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '500 16px system-ui, sans-serif';
    ctx.fillText('WASD / arrows to fly · mouse to aim · hold click or SPACE to fire', VIEW_W / 2, 452);
    ctx.fillText('SHIFT or right-click to dash · feed a rift until it goes nova', VIEW_W / 2, 478);
    const pulse = 0.6 + 0.4 * Math.sin(t * 4);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = COLORS.core;
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.fillText('CLICK OR PRESS ENTER TO LAUNCH', VIEW_W / 2, 548);
    ctx.globalAlpha = 1;
    if (game.best > 0) {
      ctx.fillStyle = COLORS.textDim;
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillText(`BEST ${game.best}`, VIEW_W / 2, 592);
    }
    ctx.restore();
  }

  drawPaused() {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(3, 4, 12, 0.66)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 46px system-ui, sans-serif';
    ctx.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2 - 8);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillText('Esc / P to resume · M to mute', VIEW_W / 2, VIEW_H / 2 + 30);
    ctx.restore();
  }

  drawGameOver(game, t) {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(3, 4, 12, 0.55)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff8296';
    ctx.font = '900 64px system-ui, sans-serif';
    ctx.shadowColor = COLORS.heart;
    ctx.shadowBlur = 26;
    ctx.fillText('SIGNAL LOST', VIEW_W / 2, 268);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.fillText(`SCORE ${game.score}`, VIEW_W / 2, 330);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '600 17px system-ui, sans-serif';
    ctx.fillText(`Reached wave ${game.wave} · Best ${game.best}`, VIEW_W / 2, 362);
    const pulse = 0.6 + 0.4 * Math.sin(t * 4);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = COLORS.core;
    ctx.font = '800 20px system-ui, sans-serif';
    ctx.fillText('PRESS R OR CLICK TO FLY AGAIN', VIEW_W / 2, 428);
    ctx.restore();
  }
}
