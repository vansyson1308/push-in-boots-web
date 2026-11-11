// The three goblin war machines. They are not drained, they are shoved: every hit on the
// weak point (and every goblin or bomb thrown back at them) pushes the machine along its arena.
import { BOSS, PUSH } from './tune.js';
import { groundY } from './world.js';
import { spawnEnemy } from './enemies.js';

const ATTACKS = {
  siege_tower: ['volley', 'minions', 'charge'],
  bridge_crusher: ['slam', 'rollers', 'minions'],
  catapult_fort: ['boulders', 'minions', 'volley'],
};

export function makeBoss(s, d) {
  const def = BOSS[d.type];
  return {
    type: d.type, def, x: d.x, y: Math.max(0, groundY(s.world, d.x)), homeX: d.x, x0: d.arena_start, x1: d.arena_end,
    hp: def.hp, maxHp: def.hp, phase: 1, state: 'wait', t: 0, cd: 1.8, attack: null, step: 0, n: 0, tell: 0,
    flash: 0, shove: 0, vx: 0, wheel: 0, pilot: 'angry', arm: 0, shake: 0, hurtT: 0,
  };
}

export function hitBoss(s, b, shot, imp) {
  if (b.state !== 'fight') return false;
  const d = b.def;
  if (imp.direct) { damage(s, b, imp.dmg); return true; }
  const wx = b.x + d.weak[0], wy = b.y + d.weak[1];
  const r = shot.r || 0.2;
  if (Math.hypot(shot.x - wx, shot.y - wy) < d.weakR + r) {
    damage(s, b, imp.dmg);
    s.ev('weakHit', { x: wx, y: wy });
    return true;
  }
  if (Math.abs(shot.x - b.x) < d.w / 2 + (shot.r > 0.5 ? shot.r : 0) && shot.y > b.y && shot.y < b.y + d.h) {
    if (shot.r > 0.5) damage(s, b, imp.dmg * 0.6);
    else { damage(s, b, imp.dmg * 0.08, true); s.ev('tink', { x: shot.x, y: shot.y, boss: true }); }
    return true;
  }
  return false;
}

function damage(s, b, dmg, quiet) {
  b.hp -= dmg; b.shove += dmg;
  if (!quiet) { b.flash = 0.1; b.hurtT = 0.3; s.ev('bossHurt', { x: b.x, y: b.y + 2, hp: b.hp / b.maxHp }); }
  const ph = b.hp <= b.maxHp / 3 ? 3 : b.hp <= (b.maxHp * 2) / 3 ? 2 : 1;
  if (ph !== b.phase && b.hp > 0) {
    b.phase = ph; b.shake = 0.6; b.pilot = 'panic';
    s.ev('bossPhase', { x: b.x, y: b.y + 2, phase: ph });
    s.slowT = 0.4;
  }
  if (b.hp <= 0) {
    b.hp = 0; b.state = 'down'; b.t = 0; b.pilot = 'dizzy'; b.vx = 1;
    s.slowT = 1.1; s.addScore(5000, b.x, b.y + 4, 'boss');
    s.bullets.length = 0; s.hazards.length = 0;
    for (const e of s.enemies) if (e.state !== 'gone') { e.state = 'gone'; s.ev('poof', { x: e.x, y: e.y + 0.4, type: e.type, flee: true, dir: 1 }); }
    s.ev('bossDown', { x: b.x, y: b.y + 2 });
  }
}

export function stepBoss(s, b, dt) {
  const c = s.cat, d = b.def;
  b.t += dt;
  if (b.flash > 0) b.flash -= dt;
  if (b.shake > 0) b.shake -= dt;
  if (b.hurtT > 0) b.hurtT -= dt;
  if (b.state === 'wait') {
    if (c.x >= b.x0 + 1.2 && c.grounded) {
      b.state = 'intro'; b.t = 0;
      const half = s.viewW / 2;
      s.cam.lockX = Math.max(s.minX + half, Math.min(s.maxX - half, (b.x0 + b.x1) / 2 + 0.6));
      s.respawnAt = { x: b.x0 + 1.5, y: Math.max(0, groundY(s.world, b.x0 + 1.5)) };
      s.ev('bossIntro', { type: b.type });
    }
    return;
  }
  if (b.state === 'intro') { if (b.t > 2.2) { b.state = 'fight'; b.t = 0; } return; }
  if (b.state === 'down') {
    b.vx += 9 * dt; b.x += b.vx * dt; b.wheel -= b.vx * dt * 1.6;
    if (s.rng.chance(0.25)) s.ev('bossSmoke', { x: b.x + s.rng.range(-1.5, 1.5), y: b.y + s.rng.range(0.5, 3.5) });
    if (b.t > 2.4) { b.state = 'gone'; s.cam.lockX = null; }
    return;
  }
  if (b.state !== 'fight') return;

  // the machine is pushed back by damage and creeps forward again when left alone
  const back = Math.min(2.6, (1 - b.hp / b.maxHp) * 2.6);
  let tx = b.homeX + back;
  if (b.attack === 'charge' && b.step === 1) tx = Math.max(b.x0 + d.w / 2 + 3.2, b.homeX - 7);
  const sp = b.attack === 'charge' && b.step === 1 ? 10.5 : 2.4;
  const mv = Math.max(-sp * dt, Math.min(sp * dt, tx - b.x));
  b.x += mv; b.wheel -= mv * 1.6;
  if (b.hurtT <= 0 && b.pilot !== 'angry' && b.shake <= 0) b.pilot = 'angry';

  // the hull is solid; the ram hurts while charging
  const edge = b.x - d.w / 2;
  if (!c.dead && c.x + c.hw > edge && c.y < b.y + d.h) {
    c.x = edge - c.hw; if (c.vx > 0) c.vx = 0;
    if (b.attack === 'charge' && b.step === 1 && mv < 0) s.hurtCat(-1, 'ram');
  }
  if (c.dead) { b.attack = null; b.cd = Math.max(b.cd, 1.2); return; }

  b.cd -= dt;
  const mercy = c.hearts <= 1 ? 1.3 : 1, fast = 1 - (b.phase - 1) * 0.14;
  if (!b.attack) {
    if (b.cd <= 0) {
      const list = ATTACKS[b.type];
      b.attack = list[b.n % list.length]; b.n++;
      if (b.attack === 'minions' && s.enemies.filter((e) => e.state !== 'gone').length >= 3) b.attack = list[b.n++ % list.length];
      b.step = 0; b.t = 0; b.count = 0; b.tell = 0.85 * mercy;
      s.ev('tell', { x: b.x - d.w / 2, y: b.y + d.h, kind: 'boss', attack: b.attack });
    }
    return;
  }
  if (b.step === 0) { if (b.t > b.tell) { b.step = 1; b.t = 0; } return; }
  const done = (cd) => { b.attack = null; b.cd = cd * fast * mercy; };
  switch (b.attack) {
    case 'volley': {                                   // alternating low (jump) and high (duck) shots
      const n = 2 + b.phase;
      if (b.t > b.count * 0.55 && b.count < n) {
        const low = (b.count + b.n) % 2 === 0;
        s.addBullet({ kind: 'ball', x: edge - 0.2, y: b.y + (low ? 0.5 : 1.3), vx: -8.6, vy: 0, grav: 0, r: 0.24 });
        s.ev('enemyShot', { x: edge, y: b.y + 1, kind: 'cannon' }); b.count++;
      }
      if (b.t > n * 0.55 + 0.4) done(1.6);
      break;
    }
    case 'charge': if (b.t > 1.5) { b.step = 2; done(1.8); } break;
    case 'minions': {
      const n = Math.min(3, 1 + b.phase);
      if (b.t > b.count * 0.35 && b.count < n) {
        const e = spawnEnemy(s, b.count === 2 ? 'runner' : d.minion, edge - 0.4, b.y + 2.2, {});
        e.vx = -4 - b.count * 1.6; e.vy = 5; e.state = 'leap'; e.lock = true; b.count++;
        s.ev('spawnHop', { x: e.x, y: e.y });
      }
      if (b.t > 1.3) done(2.6);
      break;
    }
    case 'slam': {                                     // the log comes down and a shockwave runs along the ground
      const n = b.phase;
      b.arm = Math.min(1, b.t / 0.18);
      if (b.t > 0.18 + b.count * 0.7 && b.count < n) {
        s.addBullet({ kind: 'shock', x: edge - 0.3, y: b.y + 0.35, vx: -9.5 - b.count, vy: 0, grav: 0, r: 0.35 });
        s.ev('slamGround', { x: edge - 0.5, y: b.y }); b.count++;
      }
      if (b.t > 0.4 + n * 0.7) { b.arm = 0; done(1.7); }
      break;
    }
    case 'rollers': {                                  // hose them back into the machine
      const n = 1 + b.phase;
      if (b.t > b.count * 0.9 && b.count < n) {
        s.hazards.push({ kind: 'hay', x: edge - 0.7, y: b.y + 0.1, vx: -5.8, vy: 3, r: 0.62, mass: 2.0, rot: 0, delay: 0, hw: 0.5, h: 1.1, flash: 0, hit: [], boss: true });
        s.ev('enemyShot', { x: edge, y: b.y + 0.6, kind: 'roller' }); b.count++;
      }
      if (b.t > n * 0.9 + 0.5) done(2.2);
      break;
    }
    case 'boulders': {
      const n = 2 + b.phase;
      b.arm = Math.min(1, b.t / 0.2);
      if (b.t > 0.2 && b.count < n) {
        for (; b.count < n; b.count++) {
          const x = Math.max(b.x0 + 0.8, Math.min(edge - 1.2, c.x + (b.count - (n - 1) / 2) * 2.3 + s.rng.range(-0.5, 0.5)));
          s.hazards.push({ kind: 'rock', x, y: 0, vy: 0, r: 0.6, delay: 0.05 + b.count * 0.28, warn: 1.0, gy: Math.max(0, groundY(s.world, x)) });
        }
        s.ev('enemyShot', { x: b.x, y: b.y + d.h, kind: 'catapult' });
      }
      if (b.t > 1.6) { b.arm = 0; done(1.9); }
      break;
    }
  }
  // rollers that come back hit the hull
  for (const h of s.hazards) {
    if (h.kind === 'hay' && h.vx > 2 && h.x + 0.5 > edge && h.y < b.y + d.h) {
      h.x = -999; damage(s, b, 10); s.ev('hayBreak', { x: edge, y: b.y + 0.8 }); s.ev('weakHit', { x: edge, y: b.y + 1 });
    }
  }
}
