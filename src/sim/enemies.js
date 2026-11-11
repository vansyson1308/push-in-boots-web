// Goblins. They are comic bullies, not monsters: every attack has a tell, and once a goblin
// loses its grip it becomes a tumbling projectile that takes its friends with it.
import { ENEMIES, PUSH } from './tune.js';
import { moveBody, floorBelow, groundY } from './world.js';

export function spawnEnemy(s, type, x, y, o = {}) {
  const D = ENEMIES[type], hp = D.hp * (s.hpScale || 1);
  const e = {
    id: s.nextId++, type, x, y, vx: 0, vy: 0, hw: D.hw, h: D.h, hp, maxHp: hp, mass: D.mass, score: D.score,
    face: x > s.cat.x ? -1 : 1, state: 'walk', t: 0, cd: 0.5 + s.rng.next() * 0.8, active: true, grounded: false, onPlat: null,
    wet: 0, rot: 0, spin: 0, stagger: 0, flash: 0, delay: o.delay || 0, shield: type === 'shield' ? D.shieldHits : 0,
    helmet: type === 'armored', open: false, homeY: y, anim: s.rng.next() * 6, cause: null, bowled: [], lock: false,
    cheer: 0, turnT: 0, holding: false, shots: 0, want: 0, skid: 0,
  };
  if (type === 'turret') { e.state = 'closed'; e.cd = 1 + s.rng.next(); }
  s.enemies.push(e);
  return e;
}

// imp: { dmg, px, py, cause, kind, blast, x, y }
export function hitEnemy(s, e, imp) {
  if (e.state === 'gone') return;
  e.taunt = false;
  const hx = imp.x ?? e.x, hy = imp.y ?? e.y + e.h / 2;
  if (e.state === 'tumble') {                       // juggling an airborne goblin
    if (e.plop) return;
    e.vx += (imp.px / e.mass) * 0.55; e.vy = Math.max(e.vy, 0) + Math.max(2.2, (imp.py / e.mass) * 0.5 + 1.8);
    e.flash = 0.08; e.t = Math.min(e.t, 0.3);
    s.ev('hit', { x: hx, y: hy, kind: imp.kind, juggle: true });
    return;
  }
  let dmg = imp.dmg, k = 1;
  const front = imp.px !== 0 && Math.sign(imp.px) === -e.face;
  if (e.type === 'turret' && !e.open && !imp.blast) { s.ev('tink', { x: hx, y: hy }); return; }
  if (e.type === 'shield' && e.shield > 0 && front && !imp.blast && e.stagger <= 0) {
    e.shield -= Math.max(0.5, imp.dmg); e.vx += (imp.px / e.mass) * 0.4; e.flash = 0.05;
    s.ev('block', { x: e.x + e.face * 0.45, y: hy });
    if (e.shield <= 0) { e.shield = 0; e.stagger = 0.6; s.ev('shieldBreak', { x: e.x + e.face * 0.4, y: e.y + 0.7, dir: -e.face }); }
    return;
  }
  if (e.type === 'armored' && e.helmet && !imp.blast) { dmg *= 0.55; k = 0.6; }
  e.hp -= dmg; e.flash = 0.09; e.wet = Math.min(1, e.wet + 0.3);
  if (e.type === 'armored' && e.helmet && e.hp <= e.maxHp / 2) { e.helmet = false; s.ev('helmetOff', { x: e.x, y: e.y + e.h, dir: Math.sign(imp.px) || 1 }); }
  if (e.hp <= 0) { launch(s, e, imp); return; }
  if (e.type !== 'turret') {
    e.vx += (imp.px / e.mass) * k;
    if (e.type === 'balloon') e.vy += (imp.py / e.mass) * 0.5;
    else if (e.grounded && e.type !== 'armored') e.vy = Math.max(e.vy, 1.4 + Math.max(0, imp.py) * 0.3);
    if (e.type !== 'armored') {
      if (e.type === 'bomber' && e.holding) dropBomb(s, e);
      if (e.state === 'tell' || e.state === 'attack') { e.state = 'walk'; e.cd = Math.max(e.cd, 0.6); }
      e.stagger = PUSH.staggerTime;
    }
  }
  s.ev('hit', { x: hx, y: hy, kind: imp.kind });
}

function dropBomb(s, e) {
  e.holding = false;
  s.addBullet({ kind: 'bomb', x: e.x, y: e.y + 0.9, vx: e.vx * 0.5, vy: 2, grav: 24, r: 0.26, fuse: 0.75, shootable: true });
}

function launch(s, e, imp) {
  if (e.type === 'turret') {
    e.state = 'gone'; s.award(e, imp.cause === 'washed' ? 'washed' : imp.cause);
    s.ev('turretDown', { x: e.x, y: e.y });
    s.explode(e.x, e.y + 0.4, 1.7, { friendly: true });
    return;
  }
  if (e.type === 'bomber' && e.holding) dropBomb(s, e);
  if (e.type === 'shield' && e.shield > 0) s.ev('shieldBreak', { x: e.x, y: e.y + 0.7, dir: Math.sign(imp.px) || 1 });
  if (e.type === 'armored' && e.helmet) { e.helmet = false; s.ev('helmetOff', { x: e.x, y: e.y + e.h, dir: Math.sign(imp.px) || 1 }); }
  const dir = Math.sign(imp.px) || (e.x > s.cat.x ? 1 : -1);
  e.cause = e.type === 'balloon' && imp.cause === 'washed' ? 'popped' : imp.cause;
  if (e.type === 'balloon') s.ev('pop', { x: e.x, y: e.y + 1.5 });
  e.state = 'tumble'; e.t = 0;
  e.vx = (dir * (PUSH.launchSide + Math.abs(imp.px) * PUSH.launchPush)) / Math.sqrt(e.mass);
  e.vy = PUSH.launchUp + Math.max(0, imp.py) * 0.3;
  // Collusion: if there is a pit just ahead in the direction of the shove, the goblin skids and
  // plops into it instead of sailing over. Spraying goblins toward holes always pays.
  if (!imp.noAssist) {
    const w = s.world, y0 = e.y;
    let d0 = -1, d1 = -1;
    for (let d = 0.3; d < 9; d += 0.25) {
      const hole = floorBelow(w, e.x + dir * d, y0 + 0.4) < y0 - 3;
      if (d0 < 0) { if (hole) d0 = d; else if (d > 3.6) break; } else if (!hole) { d1 = d; break; }
    }
    if (d0 >= 0) {
      if (d1 < 0) d1 = d0 + 3;
      const D = d0 + Math.min((d1 - d0) * 0.5, 1.1) + 0.35;
      e.vy = 5.2; e.vx = (dir * D) / ((2 * 5.2) / PUSH.tumbleGrav); e.plop = true;
    }
  }
  e.spin = -dir * (9 + s.rng.next() * 6); e.grounded = false; e.onPlat = null;
  e.hw = 0.34; e.h = 0.9;
  s.award(e, e.cause);
}

function gone(e) { e.state = 'gone'; }

function throwAt(s, e, kind, T, o = {}) {
  const c = s.cat, g = o.grav ?? 20;
  const ox = e.x + e.face * 0.3, oy = e.y + 1.15;
  const tx = c.x + c.vx * T * 0.35, ty = c.y + 0.5;
  return s.addBullet({ kind, x: ox, y: oy, vx: (tx - ox) / T, vy: (ty - oy + 0.5 * g * T * T) / T, grav: g, r: o.r || 0.17, shootable: true, fuse: o.fuse ?? 9 });
}

function floorAhead(s, e, dir) {
  // a short drop is fine (goblins hop down ledges); a pit is not
  return floorBelow(s.world, e.x + dir * (e.hw + 0.35), e.y + 0.3) > e.y - 2.4;
}

function cheer(s) {
  for (const o of s.enemies) if (o.active && o.state === 'walk' && o.type !== 'balloon' && s.onScreen(o.x)) o.cheer = 0.9;
}

export function stepEnemies(s, dt) {
  const c = s.cat, w = s.world, list = s.enemies;
  const mercy = c.hearts <= 1 ? 1.45 : 1;          // goblins hesitate when the cat is on its last heart
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e.state === 'gone') { list.splice(i, 1); continue; }
    if (e.delay > 0) { e.delay -= dt; continue; }
    e.t += dt; e.anim += dt; e.cd -= dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.stagger > 0) e.stagger -= dt;
    if (e.cheer > 0) e.cheer -= dt;
    if (e.wet > 0) e.wet -= dt * 0.25;
    if (e.state === 'tumble') { stepTumble(s, e, dt); continue; }
    const dx = c.x - e.x, adx = Math.abs(dx), dy = c.y - e.y, vis = s.onScreen(e.x, 0.5);
    if (e.taunt) { if (adx < 2.4 && Math.abs(dy) < 2) e.taunt = false; else { e.cheer = 0.2; e.face = Math.sign(dx) || -1; } }
    const ok = !c.dead && !s.outcome && e.stagger <= 0 && e.cheer <= 0;
    let want = 0;
    const faceCat = () => { if (adx > 0.15) e.face = Math.sign(dx); };

    switch (e.type) {
      case 'runner': if (e.loot) {
        // the loot goblin: runs from the cat with a sack of coins until it is cornered
        e.face = Math.sign(dx) || 1;
        if (ok && adx < 8.5 && vis) want = -e.face * 4.6 * (e.wet > 0.2 ? 0.75 : 1);
        if (want && e.grounded && !floorAhead(s, e, Math.sign(want))) { want = 0; e.cornered = true; }
        break;
      }
      // falls through
      case 'armored': case 'shield': {
        const D = ENEMIES[e.type], reach = e.type === 'armored' ? 1.25 : 1.0;
        if (e.state === 'walk') {
          if (e.type === 'shield') {                   // slow to turn: get behind it
            if (Math.sign(dx) !== e.face && adx > 0.3) { e.turnT += dt; if (e.turnT > 0.6) { e.face = Math.sign(dx); e.turnT = 0; } } else e.turnT = 0;
          } else faceCat();
          if (ok && adx < reach && Math.abs(dy) < 1.2 && e.cd <= 0 && Math.sign(dx) === e.face) { e.state = 'tell'; e.t = 0; s.ev('tell', { x: e.x, y: e.y + e.h, kind: 'bash' }); }
          else if (ok && adx > 0.75 && (vis || e.lock)) want = e.face * D.speed * (s.speedScale || 1);
        } else if (e.state === 'tell') {
          if (e.t > (e.type === 'armored' ? 0.55 : 0.4) * mercy) { e.state = 'attack'; e.t = 0; e.didHit = false; }
        } else if (e.state === 'attack') {
          want = e.t < 0.16 ? e.face * 6.5 : 0;
          if (!e.didHit && e.t < 0.22 && Math.abs(c.x - e.x) < e.hw + c.hw + 0.3 && c.y < e.y + e.h && c.y + c.h > e.y) { e.didHit = true; if (s.hurtCat(e.face, 'bash')) cheer(s); }
          if (e.t > 0.34) { e.state = 'walk'; e.cd = 1.15 * mercy; }
        }
        break;
      }
      case 'sprinter': {
        if (e.state === 'walk') {
          faceCat();
          if (e.skid > 0) e.skid -= dt;
          else if (ok && adx < 8.5 && Math.abs(dy) < 1.3 && e.cd <= 0 && vis) { e.state = 'tell'; e.t = 0; s.ev('tell', { x: e.x, y: e.y + e.h, kind: 'dash' }); }
          else if (ok && adx > 1 && (vis || e.lock)) want = e.face * 1.7;
        } else if (e.state === 'tell') {
          if (e.t > 0.5 * mercy) { e.state = 'attack'; e.t = 0; e.dash = e.face; e.didHit = false; }
        } else if (e.state === 'attack') {
          want = e.dash * ENEMIES.sprinter.speed * (s.speedScale || 1);
          if (!e.didHit && Math.abs(c.x - e.x) < e.hw + c.hw + 0.1 && c.y < e.y + e.h && c.y + c.h > e.y) { e.didHit = true; if (s.hurtCat(e.dash, 'dash')) cheer(s); }
          const passed = (c.x - e.x) * e.dash < -2.6;
          if (e.t > 1.25 || e.hitWall || passed || (e.grounded && !floorAhead(s, e, e.dash))) { e.state = 'walk'; e.cd = 1.5 * mercy; e.skid = 0.55; s.ev('skid', { x: e.x, y: e.y }); }
        }
        break;
      }
      case 'slinger': case 'sniper': case 'bomber': {
        faceCat();
        if (e.type === 'bomber' && ok && e.state === 'walk') {
          if (adx > 7.5 && (vis || e.lock)) want = e.face * ENEMIES.bomber.speed;
          else if (adx < 3.2) want = -e.face * ENEMIES.bomber.speed;
        }
        // ambush goblins that do not walk still have to come on stage before they act
        if (e.lock && e.state === 'walk' && !s.onScreen(e.x, -1.3)) want = Math.sign(s.cam.x - e.x) * 2.6;
        const range = e.type === 'sniper' ? 13 : 11;
        if (e.state === 'walk') {
          if (ok && vis && adx < range && e.cd <= 0 && (e.type !== 'sniper' || Math.abs(dy) < 2.2)) {
            e.state = 'tell'; e.t = 0; e.holding = e.type === 'bomber';
            s.ev('tell', { x: e.x, y: e.y + e.h, kind: e.type });
          }
        } else if (e.state === 'tell') {
          const tt = (e.type === 'sniper' ? 0.85 : e.type === 'bomber' ? 0.75 : 0.5) * mercy;
          if (e.t > tt) {
            if (e.type === 'slinger') throwAt(s, e, 'pebble', 0.95);
            else if (e.type === 'bomber') { e.holding = false; throwAt(s, e, 'bomb', 1.05, { grav: 22, r: 0.26, fuse: PUSH.bombFuse + 1.05 }); }
            else s.addBullet({ kind: 'bullet', x: e.x + e.face * 0.6, y: e.y + 0.95, vx: e.face * 13.5, vy: 0, grav: 0, r: 0.14 });
            s.ev('enemyShot', { x: e.x, y: e.y + 1, kind: e.type });
            e.state = 'attack'; e.t = 0;
          }
        } else if (e.state === 'attack') {
          if (e.t > 0.3) { e.state = 'walk'; e.cd = (e.type === 'sniper' ? 2.5 : e.type === 'bomber' ? 3.1 : 2.3) * mercy; }
        }
        break;
      }
      case 'turret': {
        faceCat();
        if (e.state === 'closed') {
          e.open = false;
          if (ok && vis && e.cd <= 0) { e.state = 'tell'; e.t = 0; e.open = true; s.ev('tell', { x: e.x, y: e.y + 1, kind: 'turret' }); }
        } else if (e.state === 'tell') {
          if (e.t > 0.55 * mercy) { e.state = 'attack'; e.t = 0; e.shots = 0; }
        } else if (e.state === 'attack') {
          if (e.t > e.shots * 0.42 && e.shots < 3) {
            e.shots++;
            s.addBullet({ kind: 'ball', x: e.x + e.face * 0.7, y: e.y + 0.55, vx: e.face * 8.2, vy: 0, grav: 0, r: 0.22 });
            s.ev('enemyShot', { x: e.x + e.face * 0.7, y: e.y + 0.55, kind: 'turret' });
          }
          if (e.t > 1.9) { e.state = 'closed'; e.cd = 1.7 * mercy; e.open = false; }
        }
        continue;                                     // bolted down: no physics
      }
      case 'balloon': {
        faceCat();
        const tx = adx > 0.6 && ok && (vis || e.lock || adx < s.viewW) ? Math.sign(dx) * ENEMIES.balloon.speed : 0;
        e.vx += (tx - e.vx) * Math.min(1, dt * 2.5);
        const ty = e.homeY + Math.sin(e.anim * 1.7) * 0.25;
        e.vy += ((ty - e.y) * 6 - e.vy * 3) * dt;
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (e.state === 'walk') { if (ok && vis && adx < 1.6 && e.cd <= 0) { e.state = 'tell'; e.t = 0; s.ev('tell', { x: e.x, y: e.y, kind: 'drop' }); } }
        else if (e.state === 'tell') {
          if (e.t > 0.45 * mercy) { s.addBullet({ kind: 'pebble', x: e.x, y: e.y - 0.1, vx: e.vx * 0.5, vy: -1, grav: 18, r: 0.17, shootable: true }); s.ev('enemyShot', { x: e.x, y: e.y, kind: 'balloon' }); e.state = 'walk'; e.cd = 1.9 * mercy; }
        }
        continue;
      }
    }

    // ground physics shared by everything on legs
    e.want = want;
    if (e.state === 'leap') { if (e.grounded && e.t > 0.2) { e.state = 'walk'; e.cd = 0.4; } }
    else if (e.stagger > 0) { if (e.grounded) e.vx -= e.vx * Math.min(1, PUSH.groundDrag * dt); }
    else if (e.grounded) {
      if (want && !floorAhead(s, e, Math.sign(want))) want = 0;       // goblins do not walk off cliffs. They get pushed.
      e.vx += (want - e.vx) * Math.min(1, dt * 14);
    } else if (want && e.vy > 0) e.vx += (want - e.vx) * Math.min(1, dt * 6);   // carrying on over the ledge they hopped
    e.vy -= 34 * dt;
    moveBody(w, e, dt);
    // a ledge in the way: goblins hop up it rather than stand there
    if (e.hitWall && e.grounded && e.want && Math.sign(e.want) === e.hitWall && e.stagger <= 0 && e.wallSolid && e.wallSolid.kind === 'ground' && e.wallSolid.y1 - e.y < 2.1) e.vy = 11.6;
    if (e.hitWall && e.state !== 'attack') e.vx = e.grounded ? 0 : e.hitWall * 2.2;
    if (e.y < s.killY || (s.climb && e.y < s.cam.y - 9)) {
      if (s.climb) { gone(e); continue; }
      e.cause = 'dunked'; s.award(e, 'dunked'); s.ev('plop', { x: e.x, y: 0, type: e.type }); gone(e); continue;
    }
    // keep walkers from stacking into one sprite
    if (e.grounded && e.stagger <= 0) {
      for (let j = i - 1; j >= 0; j--) {
        const o = list[j];
        if (o.state === 'tumble' || o.state === 'gone' || !o.grounded || o.type === 'turret' || o.type === 'balloon') continue;
        const d = e.x - o.x;
        if (Math.abs(d) < 0.55 && Math.abs(e.y - o.y) < 0.5) { const p = (0.55 - Math.abs(d)) * 0.5 * (d >= 0 ? 1 : -1); e.x += p * 0.3; o.x -= p * 0.3; }
      }
    }
  }
}

function stepTumble(s, e, dt) {
  const w = s.world;
  e.vy -= PUSH.tumbleGrav * dt; e.rot += e.spin * dt;
  const vx0 = e.vx;
  moveBody(w, e, dt);
  if (e.hitWall) {
    const sol = e.wallSolid;
    if (Math.abs(vx0) > PUSH.slamSpeed && e.cause !== 'slammed') {
      s.bonus(e, 'slammed'); e.cause = 'slammed'; s.ev('slam', { x: e.x + Math.sign(vx0) * 0.3, y: e.y + 0.5 });
      if (sol && sol.kind === 'gate' && !sol.dead) s.damageSolid(sol, 4);
    }
    e.vx = -vx0 * 0.35; e.spin *= -0.6;
  }
  const speed = Math.hypot(e.vx, e.vy);
  if (speed > 3) {
    for (const o of s.enemies) {
      if (o === e || !o.active || o.delay > 0 || o.state === 'gone' || o.state === 'tumble' || e.bowled.includes(o.id)) continue;
      if (Math.abs(o.x - e.x) < o.hw + PUSH.bowlRadius && e.y < o.y + o.h && e.y + e.h > o.y) {
        e.bowled.push(o.id);
        hitEnemy(s, o, { dmg: PUSH.bowlDmg * (e.mass > 2 ? 2 : 1), px: (Math.sign(e.vx) || 1) * 7 * Math.sqrt(e.mass), py: 3, cause: 'bowled', kind: 'goblin', blast: true, x: o.x, y: o.y + o.h * 0.6 });
        e.vx *= PUSH.bowlKeep;
        s.ev('bowl', { x: o.x, y: o.y + 0.7 });
      }
    }
    for (const p of s.pickups) {
      if (p.open || p.taken || e.bowled.includes('p' + p.i)) continue;
      if (Math.abs(p.x - e.x) < 0.8 && e.y < p.y + 1.2 && e.y + e.h > p.y) { e.bowled.push('p' + p.i); s.damageContainer(p, 3); e.vx *= 0.6; }
    }
    const b = s.boss;
    if (b && b.state === 'fight' && Math.abs(e.x - b.x) < b.def.w / 2 && e.y < b.y + b.def.h) {
      s.bossHitBy(e); s.ev('poof', { x: e.x, y: e.y + 0.4, type: e.type }); gone(e); return;
    }
  }
  if (e.y < s.killY) { s.bonus(e, 'dunked'); s.ev('plop', { x: e.x, y: 0, type: e.type }); gone(e); return; }
  if (e.grounded && e.t > 0.25) { s.ev('poof', { x: e.x, y: e.y + 0.4, type: e.type, flee: true, dir: Math.sign(vx0) || 1 }); gone(e); return; }
  // flung clean off the screen during an ambush: shoved out. On the island they are left to fall in the water.
  if (e.t > 3.5 || (!s.stage.arena && !s.onScreen(e.x, 8))) { if (s.lock) s.bonus(e, 'shoved'); gone(e); }
}
