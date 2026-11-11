// The whole game as a deterministic simulation: no rendering, no audio, no DOM.
// The renderer reads state and drains `events`; tests run this headless in Node.
import { DT, CAT, BLASTERS, ENEMIES, PUSH, SCORE, SPLASH, POINT_BLANK, VIEW_H } from './tune.js';
import { Rng } from './rng.js';
import { buildWorld, stepPlatforms, moveBody, groundY, floorBelow } from './world.js';
import { spawnEnemy, stepEnemies, hitEnemy } from './enemies.js';
import { makeBoss, stepBoss, hitBoss } from './boss.js';
import { stepDirector } from './arena.js';

export const KITTENS = ['biscuit', 'socks', 'mochi', 'luna', 'inky', 'maple', 'pip', 'nugget', 'pepper', 'pudding', 'clover'];

export class Sim {
  constructor(stage, opts = {}) {
    this.stage = stage;
    this.mode = opts.mode || 'story';            // story | daily | endless
    this.opts = { viewW: 16, pressure: 0, tank: 0, hearts: CAT.hearts, magnet: 0, autoFire: false, opened: [], ...opts };
    this.rng = new Rng(opts.seed || stage.seed || 1);
    this.climb = stage.kind === 'climb';
    this.world = buildWorld(stage);
    this.time = 0; this.events = [];
    this.minX = 0;
    this.maxX = Math.max(stage.goal_x + 9, ...(stage.ground || []).map((g) => g[1]));
    if (this.climb) { this.minX = 0; this.maxX = 12.8; }
    if (stage.bounds) { this.minX = stage.bounds[0]; this.maxX = stage.bounds[1]; }
    this.killY = -5;
    const c = this.cat = {
      x: stage.start_x, y: stage.start_y, vx: 0, vy: 0, hw: CAT.hw, h: CAT.h, face: 1, grounded: true, onPlat: null,
      coyote: 0, jumpBuf: 0, jumpHeld: false, canCut: false, airJumps: 0, spinT: 0, prone: false, dropT: 0,
      ax: 1, ay: 0, fireCd: 0, firing: false, shotFlash: 0, hover: CAT.hoverFuel, hovering: false,
      hearts: this.opts.hearts, maxHearts: this.opts.hearts, inv: 0, hurtT: 0, dead: false, deadT: 0,
      blaster: opts.blaster || 'pea', rush: 0, shield: false, landT: 0, idleT: 0, winT: 0, runDist: 0,
    };
    this.safe = { x: c.x, y: c.y };
    this.respawnAt = { x: c.x, y: c.y };
    this.enemies = []; this.shots = []; this.bullets = []; this.hazards = []; this.waves = [];
    this.nextId = 1;
    this.score = 0; this.coins = 0; this.sacks = 0; this.kos = 0; this.hits = 0;
    this.pushed = 0; this.causes = {};
    this.chain = { n: 0, t: 0, best: 0, mult: 1, window: SCORE.chainWindow };
    this.splash = 0; this.slowT = 0; this.freeze = 0;
    this.outcome = null; this.outcomeT = 0;
    this.kittens = [];
    this.falls = {};
    this.cam = { x: c.x, y: VIEW_H / 2 - 1.6, lockX: null };
    this.setupStage();
    this.snapCamera();
  }

  ev(t, o) { const e = o || {}; e.t = t; this.events.push(e); return e; }

  setupStage() {
    const st = this.stage, w = this.world;
    // enemy spawns waiting for their trigger
    this.spawns = (st.enemies || []).map((d, i) => ({ ...d, i, done: false }));
    this.hazDefs = (st.hazards || []).map((d) => ({ ...d, done: false }));
    this.pickups = (st.pickups || []).map((d, i) => ({
      i, x: d.x, y: d.y, content: d.content, container: d.container || 'free', hidden: !!d.hidden,
      hp: d.container === 'cage' ? 5 : d.container === 'barrel' ? 2 : 0, open: d.container === 'free',
      taken: false, vy: 0, flash: 0, bob: (i * 0.37) % 1, wasOpened: false,
    }));
    let cage = 0;
    for (const p of this.pickups) {
      if (p.container !== 'cage') continue;
      p.cage = cage++;
      p.kitten = KITTENS[((st.kittenBase || 0) + p.cage) % KITTENS.length];
      if (this.opts.opened.includes(p.cage)) { p.taken = true; p.wasOpened = true; }
    }
    this.cageCount = cage;
    this.sackCount = this.pickups.filter((p) => p.content === 'seed').length;
    this.checkpoints = (st.checkpoints || []).map((v) => {
      if (this.climb) {
        let best = null;
        for (const p of w.plats) if (!best || Math.abs(p.y - v) < Math.abs(best.y - v)) best = p;
        return { v, x: best ? (best.x0 + best.x1) / 2 : 6, y: best ? best.y : v, hit: false };
      }
      return { v, x: v, y: Math.max(0, groundY(w, v)), hit: false };
    });
    this.locks = (st.locks || []).map((l) => ({ x: l.x, waves: l.waves, done: false }));
    this.lock = null;
    this.boss = st.boss ? makeBoss(this, st.boss) : null;
    this.totalEnemies = this.spawns.reduce((n, d) => n + (d.count || 1), 0) +
      this.locks.reduce((n, l) => n + l.waves.reduce((m, wv) => m + wv.reduce((k, e) => k + (e.count || 1), 0), 0), 0);
  }

  get viewW() { return this.opts.viewW; }
  camLeft() { return this.cam.x - this.viewW / 2; }
  camRight() { return this.cam.x + this.viewW / 2; }
  onScreen(x, m = 0) { return x > this.camLeft() - m && x < this.camRight() + m; }
  progress() {
    const st = this.stage;
    if (this.climb) return Math.max(0, Math.min(1, this.cat.y / st.goal_y));
    return Math.max(0, Math.min(1, (this.cat.x - st.start_x) / (st.goal_x - st.start_x)));
  }

  // ---- main step -------------------------------------------------------
  step(input) {
    const dt = DT;
    if (this.freeze > 0) { this.freeze -= dt; return; }
    this.time += dt;
    if (this.outcome) this.outcomeT += dt;
    stepPlatforms(this.world, this.time, dt);
    this.stepCat(input, dt);
    this.stepTriggers();
    if (this.stage.arena) stepDirector(this, dt);
    this.stepLock(dt);
    stepEnemies(this, dt);
    if (this.boss) stepBoss(this, this.boss, dt);
    this.stepShots(dt);
    this.stepWaves(dt);
    this.stepBullets(dt);
    this.stepHazards(dt);
    this.stepPickups(dt);
    this.stepChain(dt);
    this.stepCamera(dt);
    for (const s of this.world.solids) if (s.flash > 0) s.flash -= dt;
  }

  // ---- cat ---------------------------------------------------------------
  stepCat(input, dt) {
    const c = this.cat, w = this.world;
    if (c.dead) {
      c.deadT += dt; c.vy -= CAT.gravity * dt; c.vx *= 0.96;
      moveBody(w, c, dt);
      if (c.deadT > CAT.respawnDelay && !this.outcome) {
        if (this.mode === 'endless') this.finish('lose');
        else {
          // the daily always runs its full 90 seconds: a nap costs points, not the run
          if (this.mode === 'daily') { this.score = Math.max(0, this.score - 1000); this.ev('penalty', { x: c.x, y: c.y + 1.5, pts: 1000 }); }
          this.respawn();
        }
      }
      return;
    }
    c.inv = Math.max(0, c.inv - dt); c.hurtT = Math.max(0, c.hurtT - dt);
    c.shotFlash = Math.max(0, c.shotFlash - dt); c.landT = Math.max(0, c.landT - dt);
    c.spinT = Math.max(0, c.spinT - dt); c.dropT = Math.max(0, c.dropT - dt);
    if (c.rush > 0) { c.rush -= dt; if (c.rush <= 0) this.ev('rushEnd'); }
    const won = this.outcome === 'win';
    const stun = c.hurtT > 0 || won;
    let mx = stun ? 0 : input.mx || 0, my = stun ? 0 : input.my || 0;
    if (Math.abs(mx) < 0.25) mx = 0; else mx = Math.sign(mx) * Math.min(1, (Math.abs(mx) - 0.25) / 0.5 + 0.35);
    const jump = !stun && !!input.jump, fire = !stun && !!input.fire;

    c.prone = c.grounded && my < -0.55 && !won;
    if (mx && !c.prone) c.face = Math.sign(mx);
    else if (mx && c.prone) c.face = Math.sign(mx);
    // aim
    let ax = c.face, ay = 0;
    if (my > 0.5) { ay = 1; ax = mx ? c.face : 0; }
    else if (my < -0.5 && !c.grounded) { ay = -1; ax = mx ? c.face : 0; }
    const al = Math.hypot(ax, ay); c.ax = ax / al; c.ay = ay / al;

    // run
    const top = CAT.run * (c.rush > 0 ? CAT.rushSpeed : 1);
    const target = c.prone ? 0 : mx * top;
    const acc = (c.grounded ? (target === 0 ? CAT.friction : CAT.accel) : CAT.airAccel) * dt;
    if (!stun || c.grounded) {
      if (c.vx < target) c.vx = Math.min(target, c.vx + acc); else if (c.vx > target) c.vx = Math.max(target, c.vx - acc);
    }

    // jump
    if (jump && !c.jumpHeld) c.jumpBuf = CAT.buffer;
    c.jumpHeld = jump;
    c.coyote = c.grounded ? CAT.coyote : c.coyote - dt;
    if (c.grounded) { c.airJumps = this.stage.double_jump ? 1 : 0; c.hover = Math.min(CAT.hoverFuel, c.hover + dt * 3); }
    if (c.jumpBuf > 0) {
      c.jumpBuf -= dt;
      if (c.prone && c.onPlat) { c.dropT = 0.22; c.jumpBuf = 0; c.grounded = false; c.onPlat = null; }
      else if (c.coyote > 0) {
        c.vy = CAT.jumpV; c.coyote = 0; c.jumpBuf = 0; c.canCut = true; c.grounded = false; c.onPlat = null; c.prone = false;
        this.ev('jump', { x: c.x, y: c.y });
      } else if (c.airJumps > 0) {
        c.airJumps--; c.vy = CAT.doubleV; c.jumpBuf = 0; c.canCut = true; c.spinT = 0.42;
        this.ev('djump', { x: c.x, y: c.y });
      }
    }
    if (!jump && c.canCut && c.vy > 0) { c.vy *= CAT.jumpCut; c.canCut = false; }
    if (c.vy <= 0) c.canCut = false;

    // fire (auto-fire picks a moment when something is in the line of fire)
    let firing = fire;
    if (!firing && this.opts.autoFire && !stun) firing = this.targetInSight(c);
    c.firing = firing;
    c.fireCd -= dt;
    const B = BLASTERS[c.blaster];
    if (firing && c.fireCd <= 0) { this.shoot(c, B); c.fireCd = 1 / (B.rate * (c.rush > 0 ? CAT.rushRate : 1)); }

    // recoil hop: spraying downward in the air holds the cat up
    c.hovering = false;
    if (!c.grounded && firing && c.ay < -0.5 && c.hover > 0) {
      c.hover -= dt; c.hovering = true;
      c.vy = Math.min(CAT.hoverMaxUp, c.vy + CAT.hoverAccel * dt);
      if (c.ax) c.vx -= c.ax * 6 * dt;
    }

    c.vy = Math.max(-CAT.maxFall, c.vy - CAT.gravity * dt);
    const wasGrounded = c.grounded, vyBefore = c.vy;
    c.h = c.prone ? CAT.proneH : CAT.h;
    moveBody(w, c, dt);
    if (c.hitWall) c.vx = 0;
    if (c.grounded && !wasGrounded && vyBefore < -6) { c.landT = 0.16; this.ev('land', { x: c.x, y: c.y, v: -vyBefore }); }
    if (c.grounded && c.onPlat && c.onPlat.kind === 'collapse' && !c.onPlat.shake) { c.onPlat.shake = 0.001; this.ev('crumble', { x: c.x, y: c.y }); }
    if (c.grounded && Math.abs(c.vx) > 1) c.runDist += Math.abs(c.vx) * dt;
    c.idleT = (c.grounded && !c.vx && !firing && !c.prone) ? c.idleT + dt : 0;

    // bounds, lock walls
    let lo = this.minX + c.hw, hi = this.maxX - c.hw;
    if (this.cam.lockX != null) { lo = Math.max(lo, this.cam.lockX - this.viewW / 2 + 0.4); hi = Math.min(hi, this.cam.lockX + this.viewW / 2 - 0.4); }
    if (c.x < lo) { c.x = lo; c.vx = Math.max(0, c.vx); } else if (c.x > hi) { c.x = hi; c.vx = Math.min(0, c.vx); }

    // safe spot, pits
    if (c.grounded && (!c.onPlat || c.onPlat.kind === 'static') && !this.nearEdge(c)) { this.safe.x = c.x; this.safe.y = c.y; }
    const floor = this.climb ? this.cam.y - VIEW_H / 2 - 2.5 : this.killY;
    if (c.y < floor) this.fellInPit();

    // checkpoints and goal
    const pos = this.climb ? c.y : c.x;
    for (const cp of this.checkpoints) {
      if (!cp.hit && pos >= cp.v && c.grounded) {
        cp.hit = true; this.respawnAt = { x: c.x, y: c.y };
        if (c.hearts < c.maxHearts) c.hearts++;
        this.addScore(SCORE.checkpoint, cp.x, cp.y + 1.5);
        this.ev('checkpoint', { x: cp.x, y: cp.y });
      }
    }
    if (!this.outcome && !this.stage.arena) {
      const st = this.stage;
      if (this.boss) { if (this.boss.state === 'gone') this.finish('win'); }
      else if (this.climb ? (c.grounded && c.y >= st.goal_y - 0.4) : (c.x >= st.goal_x && c.grounded)) this.finish('win');
    }
  }

  nearEdge(c) {
    if (this.climb) return false;
    return groundY(this.world, c.x - 0.7, c.y) < c.y - 0.5 || groundY(this.world, c.x + 0.7, c.y) < c.y - 0.5;
  }

  targetInSight(c) {
    const B = BLASTERS[c.blaster], range = B.speed * B.life + 0.6;
    const ox = c.x, oy = c.y + (c.prone ? 0.3 : 0.85);
    const test = (x, y) => {
      const dx = x - ox, dy = y - oy, d = Math.hypot(dx, dy);
      if (d > range || d < 0.01) return false;
      return (dx * c.ax + dy * c.ay) / d > 0.9;
    };
    for (const e of this.enemies) if (e.state !== 'tumble' && e.state !== 'gone' && e.active && test(e.x, e.y + e.h * 0.5)) return true;
    for (const p of this.pickups) if (!p.open && !p.taken && test(p.x, p.y + 0.5)) return true;
    for (const h of this.hazards) if (h.kind === 'hay' && test(h.x, h.y + 0.5)) return true;
    for (const b of this.bullets) if (b.shootable && test(b.x, b.y)) return true;
    for (const s of this.world.solids) if (s.kind === 'gate' && !s.dead && test(c.ax > 0 ? s.x0 : s.x1, Math.min(s.y1 - 0.3, oy))) return true;
    const b = this.boss;
    if (b && b.state === 'fight' && test(b.x + b.def.weak[0], b.y + b.def.weak[1])) return true;
    return false;
  }

  shoot(c, B) {
    const up = this.opts.pressure;
    const mx = c.x + c.ax * 0.8, my = c.y + (c.prone ? 0.3 : 0.86) + c.ay * 0.7;
    let ang = Math.atan2(c.ay, c.ax);
    // a little aim assist toward the nearest goblin near the line of fire
    let best = 0.24, off = 0;
    for (const e of this.enemies) {
      if (e.state === 'gone' || !e.active) continue;
      const a = Math.atan2(e.y + e.h * 0.55 - my, e.x - mx), d = Math.hypot(e.x - mx, e.y - my);
      let da = a - ang; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      if (Math.abs(da) < best && d < B.speed * B.life + 1 && d > 0.8) { best = Math.abs(da); off = da; }
    }
    if (B.grav < 10) ang += off * 0.85;
    const rush = c.rush > 0 ? CAT.rushPush : 1;
    for (let i = 0; i < B.pellets; i++) {
      const sp = B.pellets > 1 ? ((i / (B.pellets - 1)) - 0.5) * B.spread : 0;
      let a = ang + (sp + this.rng.range(-B.jitter, B.jitter)) * Math.PI / 180;
      let vx = Math.cos(a) * B.speed, vy = Math.sin(a) * B.speed;
      if (B.loft && c.ay === 0) vy += B.speed * B.loft;
      this.shots.push({
        x: mx, y: my, px: mx, py: my, vx: vx + c.vx * 0.35, vy, life: B.life, age: 0, kind: c.blaster, r: B.r, grav: B.grav,
        dmg: B.dmg * (1 + 0.06 * up), push: B.push * (1 + 0.1 * up) * rush, pierce: B.pierce, blast: B.blast || 0, hit: null,
      });
    }
    c.shotFlash = 0.07;
    if (c.grounded) c.vx -= c.ax * CAT.recoil * B.recoil;
    this.ev('shot', { x: mx, y: my, kind: c.blaster, a: ang });
  }

  hurtCat(dir = 0, cause = 'hit') {
    const c = this.cat;
    if (c.inv > 0 || c.dead || this.outcome) return false;
    if (c.shield) { c.shield = false; c.inv = 1; this.ev('shieldPop', { x: c.x, y: c.y + 0.8 }); return false; }
    c.hearts--; this.hits++;
    c.inv = CAT.invuln; c.hurtT = CAT.hurtStun; c.vx = (dir || -c.face) * 5.5; c.vy = 6.5; c.grounded = false; c.onPlat = null;
    this.ev('hurt', { x: c.x, y: c.y + 0.8, cause });
    if (c.hearts <= 0) this.killCat();
    return true;
  }
  killCat() {
    const c = this.cat;
    c.dead = true; c.deadT = 0; c.hearts = 0; this.kos++;
    this.chain.n = 0; this.chain.t = 0; this.chain.mult = 1;
    this.ev('catKo', { x: c.x, y: c.y });
  }
  fellInPit() {
    const c = this.cat;
    if (!this.climb && this.mode === 'story') {
      // two falls into the same gap and a plank appears: the game quietly helps
      const g = this.gapAt(c.x);
      if (g) {
        const k = Math.round(g.x0 * 10);
        this.falls[k] = (this.falls[k] || 0) + 1;
        if (this.falls[k] === 2) {
          const len = g.x1 - g.x0, y = Math.min(g.y0, g.y1) - 0.02;
          this.world.plats.push({ id: 900 + k, x0: g.x0 + len * 0.22, x1: g.x1 - len * 0.22, y, bx: g.x0 + len * 0.22, by: y, w: len * 0.56, kind: 'static', dx: 0, dy: 0, period: 1, vx: 0, vy: 0, helper: true });
          this.ev('helper', { x: (g.x0 + g.x1) / 2, y });
        }
      }
    }
    c.hearts--; this.hits++;
    this.ev('fell', { x: c.x, y: this.climb ? this.cam.y - VIEW_H / 2 : 0 });
    if (c.hearts <= 0) { c.y = Math.max(c.y, this.killY - 1); this.killCat(); c.deadT = CAT.respawnDelay * 0.5; return; }
    c.x = this.safe.x; c.y = this.safe.y + 0.05; c.vx = 0; c.vy = 0; c.inv = CAT.invuln; c.hover = CAT.hoverFuel;
    this.ev('respawn', { x: c.x, y: c.y });
  }
  gapAt(x) {
    const g = (this.stage.ground || []).slice().sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < g.length - 1; i++) if (x > g[i][1] - 0.5 && x < g[i + 1][0] + 0.5 && g[i + 1][0] - g[i][1] > 0.4) return { x0: g[i][1], x1: g[i + 1][0], y0: g[i][2], y1: g[i + 1][2] };
    return null;
  }
  respawn() {
    const c = this.cat, r = this.lock ? { x: this.cam.lockX, y: Math.max(0, groundY(this.world, this.cam.lockX)) + 0.05 } : this.respawnAt;
    if (this.stage.arena) for (const e of this.enemies) if (Math.abs(e.x - r.x) < 3 && e.state !== 'tumble') e.vx += Math.sign(e.x - r.x || 1) * 9;
    c.dead = false; c.hearts = c.maxHearts; c.x = r.x; c.y = r.y + 0.05; c.vx = 0; c.vy = 0; c.inv = 2; c.hurtT = 0;
    c.rush = 0; c.hover = CAT.hoverFuel;
    this.safe = { x: c.x, y: c.y };
    this.bullets.length = 0;
    this.ev('respawn', { x: c.x, y: c.y, full: true });
  }
  finish(outcome) {
    if (this.outcome) return;
    this.outcome = outcome; this.outcomeT = 0;
    if (outcome === 'win') { this.cat.vx = 0; this.bullets.length = 0; }
    this.ev(outcome);
  }

  // ---- scoring -----------------------------------------------------------
  addScore(pts, x, y, tag) {
    pts = Math.round(pts);
    this.score += pts;
    this.ev('score', { x, y, pts, tag });
  }
  // A goblin has been washed out. `cause` decides the bonus; chains multiply everything.
  award(e, cause) {
    const ch = this.chain;
    ch.n = ch.t > 0 ? ch.n + 1 : 1;
    ch.t = ch.window = Math.max(SCORE.chainMinWindow, SCORE.chainWindow - ch.n * SCORE.chainShrink);   // long chains get harder to hold
    ch.mult = Math.min(SCORE.chainMaxMult, 1 + (ch.n - 1) * SCORE.chainStep);
    if (ch.n > ch.best) ch.best = ch.n;
    const pts = Math.round(e.score * (SCORE.cause[cause] || 1) * ch.mult);
    this.score += pts; this.pushed++;
    this.causes[cause] = (this.causes[cause] || 0) + 1;
    if (this.splash < SPLASH.need) {
      this.splash = Math.min(SPLASH.need, this.splash + (cause === 'washed' ? 1 : 1.5) * (1 + 0.15 * this.opts.tank));
      if (this.splash >= SPLASH.need) this.ev('splashReady');
    }
    if (ch.n >= SCORE.slowmoAt && (ch.n === SCORE.slowmoAt || ch.n % 4 === 0)) this.slowT = 0.5;
    this.ev('ko', { x: e.x, y: e.y + e.h * 0.5, cause, pts, n: ch.n, type: e.type, mult: ch.mult });
    // the goblins stole the farm's coins: every one you wash out gives some back, more on a long chain
    if (!this.stage.arena) this.dropCoins(e.x, e.y + e.h * 0.5, e.loot ? 14 : 1 + (ch.n >= 5 ? 1 : 0) + (cause === 'dunked' ? 1 : 0));
  }
  dropCoins(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.pickups.push({ i: 5000 + this.nextId++, x, y, content: 'coin', container: 'free', hidden: false, hp: 0, open: true, taken: false, flash: 0, bob: this.rng.next(),
        vy: 5 + this.rng.next() * 5, vx: (this.rng.next() - 0.5) * 7, home: 0.35 + i * 0.05 });
    }
  }
  bonus(e, cause) {
    const m = (SCORE.cause[cause] || 1) - (SCORE.cause[e.cause] || 1);
    if (m <= 0) return;
    const pts = Math.round(e.score * m * this.chain.mult);
    this.score += pts; this.chain.t = Math.max(this.chain.t, (this.chain.window || SCORE.chainWindow) * 0.6);
    this.causes[cause] = (this.causes[cause] || 0) + 1;
    this.ev('bonus', { x: e.x, y: e.y + 0.6, cause, pts });
  }
  stepChain(dt) {
    const ch = this.chain;
    if (ch.t > 0) { ch.t -= dt; if (ch.t <= 0) { if (ch.n >= 3) this.ev('chainEnd', { n: ch.n }); ch.n = 0; ch.mult = 1; } }
  }

  // ---- water ---------------------------------------------------------------
  stepShots(dt) {
    const w = this.world;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.px = s.x; s.py = s.y;
      s.age += dt; s.life -= dt; s.vy -= s.grav * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      let dead = s.life <= 0;
      const pb = s.age < POINT_BLANK.age ? POINT_BLANK.push : 1;
      const dirx = Math.sign(s.vx) || 0, sp = Math.hypot(s.vx, s.vy) || 1;
      const imp = { dmg: s.dmg, px: (s.vx / sp) * s.push * pb, py: (s.vy / sp) * s.push * pb, cause: 'washed', kind: s.kind, x: s.x, y: s.y };
      if (!dead) {
        for (const so of w.solids) {
          if (so.dead || !(s.x > so.x0 && s.x < so.x1 && s.y > so.y0 && s.y < so.y1)) continue;
          if (so.kind === 'gate') this.damageSolid(so, s.dmg);
          dead = true; break;
        }
      }
      if (!dead) {
        for (const e of this.enemies) {
          if (e.state === 'gone' || !e.active || e.plop || (s.hit && s.hit.includes(e.id))) continue;
          if (Math.abs(s.x - e.x) < e.hw + s.r && s.y > e.y - s.r && s.y < e.y + e.h + s.r) {
            if (s.blast) { dead = true; break; }
            hitEnemy(this, e, imp);
            if (s.pierce > 0) { s.pierce--; (s.hit || (s.hit = [])).push(e.id); } else dead = true;
            if (dead) break;
          }
        }
      }
      if (!dead) {
        for (const p of this.pickups) {
          if (p.open || p.taken) continue;
          const hh = p.container === 'cage' ? 1.35 : 0.95, hw = p.container === 'cage' ? 0.7 : 0.45;
          if (Math.abs(s.x - p.x) < hw + s.r && s.y > p.y && s.y < p.y + hh) { this.damageContainer(p, s.dmg); dead = !s.pierce; break; }
        }
      }
      if (!dead) {
        for (const h of this.hazards) {
          if (h.kind !== 'hay') continue;
          if (Math.hypot(s.x - h.x, s.y - (h.y + h.r)) < h.r + s.r) {
            h.vx += imp.px / h.mass; h.flash = 0.1; dead = !s.pierce;
            this.ev('hit', { x: s.x, y: s.y, kind: s.kind, heavy: true }); break;
          }
        }
      }
      if (!dead) {
        for (const b of this.bullets) {
          if (!b.shootable || Math.hypot(s.x - b.x, s.y - b.y) > b.r + s.r + 0.1) continue;
          if (b.kind === 'bomb') { b.vx += imp.px / 0.45; b.vy += imp.py / 0.45 + 2.5; b.returned = true; }
          else { b.dead = true; this.ev('hit', { x: b.x, y: b.y, kind: s.kind }); }
          dead = !s.pierce; break;
        }
      }
      if (!dead && this.boss && this.boss.state === 'fight') { if (hitBoss(this, this.boss, s, imp)) dead = !s.pierce || true; }
      if (dead) {
        if (s.blast) this.geyser(s.x, s.y, s.blast, s.dmg, s.push);
        else if (s.life > 0) this.ev('hit', { x: s.x, y: s.y, kind: s.kind });
        this.shots.splice(i, 1);
      }
    }
  }
  geyser(x, y, r, dmg, push) {
    this.ev('geyser', { x, y, r });
    for (const e of this.enemies) {
      if (e.state === 'gone' || !e.active) continue;
      const dx = e.x - x, dy = e.y + e.h * 0.5 - y;
      if (Math.hypot(dx, dy) < r + e.hw) hitEnemy(this, e, { dmg, px: Math.sign(dx || 1) * push * 0.35, py: push, cause: 'washed', kind: 'fizz', blast: true, x, y });
    }
    for (const p of this.pickups) if (!p.open && !p.taken && Math.hypot(p.x - x, p.y + 0.5 - y) < r + 0.4) this.damageContainer(p, dmg);
    for (const h of this.hazards) if (h.kind === 'hay' && Math.hypot(h.x - x, h.y - y) < r + h.r) { h.vy = 6; h.vx += Math.sign(h.x - x || 1) * 3; }
    for (const b of this.bullets) if (b.kind === 'bomb' && Math.hypot(b.x - x, b.y - y) < r) { b.vy = 8; b.vx += Math.sign(b.x - x || 1) * 4; b.returned = true; }
    if (this.boss && this.boss.state === 'fight') hitBoss(this, this.boss, { x, y, r }, { dmg: dmg * 1.5, px: push, py: 0, kind: 'fizz' });
    for (const so of this.world.solids) if (so.kind === 'gate' && !so.dead && x > so.x0 - r && x < so.x1 + r && y < so.y1 + r) this.damageSolid(so, dmg * 1.5);
  }
  damageSolid(so, dmg) {
    so.hp -= dmg; so.flash = 0.08;
    this.ev('tink', { x: (so.x0 + so.x1) / 2, y: so.y0 + 1.2, gate: true });
    if (so.hp <= 0) { so.dead = true; this.addScore(300, (so.x0 + so.x1) / 2, so.y1); this.ev('gateBreak', { x: (so.x0 + so.x1) / 2, y: so.y0, h: so.y1 - so.y0 }); }
  }
  damageContainer(p, dmg) {
    p.hp -= dmg; p.flash = 0.08;
    this.ev('tink', { x: p.x, y: p.y + 0.6, cage: p.container === 'cage' });
    if (p.hp > 0) return;
    p.open = true;
    if (p.container === 'cage') {
      p.taken = true;
      this.kittens.push(p.cage);
      this.addScore(SCORE.kitten, p.x, p.y + 1.6);
      this.ev('kitten', { x: p.x, y: p.y, name: p.kitten, cage: p.cage });
    } else { p.vy = 6.5; this.ev('barrel', { x: p.x, y: p.y }); }
  }
  bossHitBy(e) { hitBoss(this, this.boss, null, { dmg: 8 * (e.mass > 2 ? 1.5 : 1), direct: true, kind: 'goblin' }); }
  bigSplash() {
    const c = this.cat;
    if (this.splash < SPLASH.need || c.dead) return false;
    this.splash = 0;
    for (const dir of [1, -1]) this.waves.push({ x: c.x, y: c.y, dir, dist: 0, hit: [] });
    c.inv = Math.max(c.inv, 0.8);
    this.ev('bigSplash', { x: c.x, y: c.y });
    return true;
  }
  stepWaves(dt) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wv = this.waves[i];
      wv.x += wv.dir * SPLASH.speed * dt; wv.dist += SPLASH.speed * dt;
      for (const e of this.enemies) {
        if (e.state === 'gone' || !e.active || wv.hit.includes(e.id)) continue;
        if (Math.abs(e.x - wv.x) < 1.2 && e.y < wv.y + SPLASH.height && e.y + e.h > wv.y - 1.5) {
          wv.hit.push(e.id);
          hitEnemy(this, e, { dmg: SPLASH.dmg, px: wv.dir * SPLASH.push, py: 5, cause: 'splash', kind: 'wave', blast: true, x: e.x, y: e.y });
        }
      }
      for (const b of this.bullets) if (Math.abs(b.x - wv.x) < 1.2 && b.y < wv.y + SPLASH.height) b.dead = true;
      for (const h of this.hazards) if (h.kind === 'hay' && Math.abs(h.x - wv.x) < 1.2) h.vx = wv.dir * 12;
      for (const p of this.pickups) if (!p.open && !p.taken && Math.abs(p.x - wv.x) < 1 && Math.abs(p.y - wv.y) < SPLASH.height) this.damageContainer(p, 9);
      if (this.boss && this.boss.state === 'fight' && !wv.hitBoss && Math.abs(this.boss.x - wv.x) < this.boss.def.w / 2) {
        wv.hitBoss = true; hitBoss(this, this.boss, null, { dmg: 10, px: wv.dir * 8, py: 0, kind: 'wave', direct: true });
      }
      if (wv.dist > this.viewW * 0.9) this.waves.splice(i, 1);
    }
  }

  // ---- things that fly at the cat ----------------------------------------
  addBullet(b) { b.age = 0; b.dead = false; this.bullets.push(b); return b; }
  explode(x, y, r, opts = {}) {
    this.ev('explode', { x, y, r });
    for (const e of this.enemies) {
      if (e.state === 'gone' || !e.active) continue;
      const dx = e.x - x, dy = e.y + e.h * 0.5 - y, d = Math.hypot(dx, dy);
      if (d < r + e.hw) hitEnemy(this, e, { dmg: PUSH.bombDmg, px: Math.sign(dx || 1) * PUSH.bombPush * 0.8, py: PUSH.bombPush * 0.6, cause: 'kaboom', kind: 'bomb', blast: true, x, y });
    }
    const c = this.cat;
    if (!opts.friendly && Math.hypot(c.x - x, c.y + 0.7 - y) < r * 0.72) this.hurtCat(Math.sign(c.x - x) || 1, 'bomb');
    for (const b of this.bullets) if (b.kind === 'bomb' && !b.dead && Math.hypot(b.x - x, b.y - y) < r) b.fuse = Math.min(b.fuse, 0.12);
    for (const p of this.pickups) if (!p.open && !p.taken && Math.hypot(p.x - x, p.y + 0.5 - y) < r + 0.3) this.damageContainer(p, 9);
    for (const so of this.world.solids) if (so.kind === 'gate' && !so.dead && x > so.x0 - r && x < so.x1 + r && y < so.y1 + r) this.damageSolid(so, 5);
    if (this.boss && this.boss.state === 'fight') hitBoss(this, this.boss, { x, y, r }, { dmg: 9, px: 6, py: 0, kind: 'bomb' });
  }
  stepBullets(dt) {
    const c = this.cat, w = this.world;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.age += dt; b.vy -= (b.grav || 0) * dt; b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.kind === 'bomb') {
        b.fuse -= dt;
        const gy = floorBelow(w, b.x, b.y + 0.4);
        if (b.y - b.r <= gy && b.vy < 0) { b.y = gy + b.r; b.vy = -b.vy * 0.35; b.vx *= 0.6; if (Math.abs(b.vy) < 1.2) b.vy = 0; b.landed = true; }
        if (b.landed && b.fuse > 0.5) b.fuse = 0.5;
        if (b.fuse <= 0) { b.dead = true; this.explode(b.x, b.y, PUSH.bombRadius, { friendly: false }); }
      } else {
        if (!c.dead && c.inv <= 0 && Math.abs(b.x - c.x) < c.hw + b.r && b.y + b.r > c.y && b.y - b.r < c.y + c.h) {
          b.dead = true; this.hurtCat(Math.sign(b.vx) || 1, b.kind);
        }
        const gy = groundY(w, b.x);
        if (b.y < gy && b.age > 0.05) { b.dead = true; this.ev('thud', { x: b.x, y: gy, kind: b.kind }); }
        if (b.kind === 'rock' && !b.dead) {
          for (const e of this.enemies) if (e.active && e.state !== 'gone' && e.state !== 'tumble' && Math.abs(e.x - b.x) < e.hw + b.r && Math.abs(e.y + e.h / 2 - b.y) < e.h / 2 + b.r) hitEnemy(this, e, { dmg: 9, px: 0, py: 4, cause: 'kaboom', kind: 'rock', blast: true, x: b.x, y: b.y });
        }
      }
      if (b.dead || b.age > 7 || b.y < this.killY - 2 || (!this.climb && !this.onScreen(b.x, 6))) this.bullets.splice(i, 1);
    }
  }

  stepHazards(dt) {
    const c = this.cat, w = this.world;
    for (const d of this.hazDefs) {
      if (d.done || c.x < d.trigger) continue;
      d.done = true;
      for (let i = 0; i < (d.count || 1); i++) {
        if (d.type === 'hay') this.hazards.push({ kind: 'hay', x: this.camRight() + 1.2, y: d.y, vx: -5.6, vy: 0, r: 0.62, mass: 2.4, rot: 0, delay: i * (d.gap || 1) * 1.15, hw: 0.5, h: 1.1, flash: 0, hit: [] });
        else this.hazards.push({ kind: 'rock', x: d.x + i * (d.gap || 1.5), y: 0, vy: 0, r: 0.6, delay: 0.25 + i * 0.4, warn: 0.95, gy: Math.max(0, groundY(w, d.x + i * (d.gap || 1.5))) });
      }
      if (d.type === 'hay') this.ev('stampede', { x: this.camRight() });
    }
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      if (h.delay > 0) { h.delay -= dt; if (h.kind === 'hay') h.x = Math.max(h.x, this.camRight() + 1.2); if (h.delay <= 0 && h.kind === 'rock') this.ev('tell', { x: h.x, y: h.gy, kind: 'rock' }); continue; }
      if (h.kind === 'rock') {
        if (h.warn > 0) { h.warn -= dt; if (h.warn <= 0) { this.addBullet({ kind: 'rock', x: h.x, y: this.cam.y + VIEW_H / 2 + 1, vx: 0, vy: -3, grav: 26, r: 0.55 }); this.hazards.splice(i, 1); } }
        continue;
      }
      // rolling hay: jump it, or hose it back the way it came
      h.flash = Math.max(0, h.flash - dt);
      h.vy -= 30 * dt;
      h.hw = 0.5; h.h = 1.1;
      moveBody(w, h, dt);
      h.rot -= (h.vx / h.r) * dt;
      if (h.grounded && h.vx < 0 && h.vx > -5.6) h.vx -= 2 * dt;
      let gone = h.y < this.killY || h.x < this.camLeft() - 5 || h.x > this.camRight() + 8;
      if (h.hitWall) { gone = true; this.ev('hayBreak', { x: h.x, y: h.y + 0.6 }); }
      if (!gone && !c.dead && Math.abs(h.vx) > 1.5 && Math.abs(c.x - h.x) < c.hw + 0.45 && c.y < h.y + 1.05 && c.y + c.h > h.y) {
        if (this.hurtCat(Math.sign(h.vx), 'hay')) { /* keeps rolling */ }
      }
      if (!gone && Math.abs(h.vx) > 2.5) {
        for (const e of this.enemies) {
          if (!e.active || e.state === 'gone' || e.state === 'tumble' || h.hit.includes(e.id) || e.type === 'balloon') continue;
          if (Math.abs(e.x - h.x) < e.hw + 0.5 && e.y < h.y + 1.1 && e.y + e.h > h.y && (h.vx > 0 || e.type !== 'turret')) {
            if (h.vx > 0) { h.hit.push(e.id); hitEnemy(this, e, { dmg: 6, px: 8, py: 4, cause: 'bowled', kind: 'hay', blast: true, x: h.x, y: h.y }); h.vx *= 0.8; }
          }
        }
      }
      if (gone) { if (h.y < this.killY) this.ev('plop', { x: h.x, y: 0 }); this.hazards.splice(i, 1); }
    }
  }

  stepPickups(dt) {
    const c = this.cat, w = this.world;
    const mag = CAT.magnet + this.opts.magnet * 0.7;
    for (const p of this.pickups) {
      if (p.taken) continue;
      if (p.flash > 0) p.flash -= dt;
      if (!p.open) continue;
      if (p.home == null && (p.vy || (p.container === 'barrel' && p.vy !== null))) {
        if (p.container === 'barrel') {
          p.vy -= 24 * dt; p.y += p.vy * dt;
          const gy = floorBelow(w, p.x, p.y + 1);
          if (p.y <= gy + 0.35 && p.vy < 0) { p.y = gy + 0.35; p.vy = null; }
        }
      }
      if (c.dead) continue;
      const dx = c.x - p.x, dy = c.y + 0.7 - p.y, d = Math.hypot(dx, dy);
      if (p.home != null) {                         // a coin shaken loose from a goblin: pops up, then flies to the cat
        if (p.home > 0) { p.home -= dt; p.vy -= 22 * dt; p.x += p.vx * dt; p.y += p.vy * dt; continue; }
        const sp = 16 + (0 - p.home) * 30; p.home -= dt;
        if (d > 0.01) { p.x += (dx / d) * Math.min(d, sp * dt); p.y += (dy / d) * Math.min(d, sp * dt); }
        if (d < 0.6) this.take(p);
        continue;
      }
      if (p.content === 'coin' && d < mag && d > 0.01) { p.x += (dx / d) * 11 * dt; p.y += (dy / d) * 11 * dt; }
      if (d < 0.75 || (Math.abs(dx) < c.hw + 0.35 && p.y > c.y - 0.3 && p.y < c.y + c.h + 0.3)) this.take(p);
    }
  }
  take(p) {
    const c = this.cat;
    p.taken = true;
    if (p.home != null && this.pickups.length > 400) this.pickups = this.pickups.filter((q) => !(q.taken && q.home != null));
    switch (p.content) {
      case 'coin': this.coins++; this.score += SCORE.coin; break;
      case 'seed': this.sacks++; this.addScore(SCORE.sack, p.x, p.y + 0.6); break;
      case 'heart': if (c.hearts < c.maxHearts) c.hearts++; else this.addScore(200, p.x, p.y + 0.6); break;
      case 'catnip': c.rush = CAT.rushTime; break;
      case 'bubble': c.shield = true; break;
      case 'yarn': this.splash = SPLASH.need; this.ev('splashReady'); break;
      default: if (BLASTERS[p.content]) c.blaster = p.content;
    }
    this.ev('pickup', { x: p.x, y: p.y, content: p.content });
  }

  // ---- spawning ------------------------------------------------------------
  stepTriggers() {
    const c = this.cat, pos = this.climb ? c.y + 1.5 : c.x;
    for (const d of this.spawns) {
      if (d.done || pos < d.trigger) continue;
      d.done = true;
      const n = d.count || 1;
      for (let i = 0; i < n; i++) {
        let x = d.x, y = d.y;
        if (d.edge && !this.climb) { x = Math.max(d.x, this.camRight() + 1) + i * (0.9 + (d.gap || 0.6)); if (d.type !== 'balloon') y = this.spawnY(x, d.y); }
        const en = spawnEnemy(this, d.type, x, y, {}); if (d.taunt) en.taunt = true; if (d.loot) { en.loot = true; en.score = 400; en.hp = 3; en.maxHp = 3; }
      }
    }
  }
  spawnY(x, fallback = 0) {
    const g = groundY(this.world, x);
    return g > -50 ? g : fallback;
  }
  stepLock(dt) {
    const c = this.cat;
    if (!this.lock) {
      for (const l of this.locks) {
        if (l.done || c.x < l.x || c.dead) continue;
        const half = this.viewW / 2;
        const cx = Math.max(this.minX + half, Math.min(this.maxX - half, l.x + 1.5));
        this.lock = { def: l, wave: -1, t: 0, pause: 0.5, ids: [] };
        this.cam.lockX = cx;
        this.ev('lockStart', { x: cx, waves: l.waves.length });
        break;
      }
      return;
    }
    const L = this.lock;
    L.t += dt;
    // a straggler that has wandered or been knocked out of reach for good gives up and goes home
    for (const e of this.enemies) {
      if (!e.lock || e.state === 'gone' || e.state === 'tumble') continue;
      e.away = this.onScreen(e.x, 0.5) ? 0 : (e.away || 0) + dt;
      if (e.away > 7) { e.state = 'gone'; this.ev('poof', { x: e.x, y: e.y + 0.4, type: e.type }); }
    }
    const alive = this.enemies.some((e) => e.lock && e.state !== 'gone' && e.state !== 'tumble');
    if (!alive || L.t > 16) {
      L.pause -= dt;
      if (L.pause > 0) return;
      L.wave++; L.t = 0; L.pause = 0.7;
      if (L.wave >= L.def.waves.length) {
        if (alive) { L.wave--; return; }
        L.def.done = true; this.lock = null; this.cam.lockX = null;
        this.addScore(500, c.x, c.y + 2.2);
        this.ev('lockClear');
        return;
      }
      const half = this.viewW / 2;
      for (const sp of L.def.waves[L.wave]) {
        for (let i = 0; i < (sp.count || 1); i++) {
          const side = sp.side === 'left' ? -1 : 1;
          if (sp.type === 'balloon') { const e = spawnEnemy(this, sp.type, this.cam.lockX + side * (half + 1.5 + i * 1.4), 3.6, { delay: (sp.delay || 0) + i * 0.2 }); e.lock = true; continue; }
          // Ambushers vault in over the edge of the screen and land inside the arena, whatever the
          // ground outside it looks like, so nobody is ever left stranded behind a ledge.
          let lx = this.cam.lockX + side * (half - 1.4 - (i % 3) * 0.9), ly = groundY(this.world, lx);
          for (let k = 0; k < 30 && ly < -50; k++) { lx -= side * 0.5; ly = groundY(this.world, lx); }
          if (ly < -50) ly = 0;
          const e = spawnEnemy(this, sp.type, sp.type === 'turret' ? lx : this.cam.lockX + side * (half + 1.1), sp.type === 'turret' ? ly : ly + 0.6, { delay: (sp.delay || 0) + i * 0.32 });
          e.lock = true; e.face = -side;
          if (sp.type !== 'turret') { e.state = 'leap'; e.vx = -side * (5.2 + (i % 3) * 1.6); e.vy = 8.5; }
        }
      }
      this.ev('wave', { n: L.wave + 1, of: L.def.waves.length });
    }
  }

  // ---- camera --------------------------------------------------------------
  camTarget() {
    const c = this.cat, half = this.viewW / 2;
    let tx = this.cam.lockX != null ? this.cam.lockX : c.x + c.face * 1.6 + c.vx * 0.12;
    if (this.maxX - this.minX <= this.viewW) tx = (this.minX + this.maxX) / 2;
    else tx = Math.max(this.minX + half, Math.min(this.maxX - half, tx));
    let ty;
    if (this.climb) ty = Math.max(VIEW_H / 2 - 1.6, c.y + 1.6);
    else ty = VIEW_H / 2 - 1.6 + Math.max(0, Math.min(8, (c.grounded ? c.y : Math.min(c.y, this.safe.y + 3)) - 2.2)) * 0.75;
    return [tx, ty];
  }
  snapCamera() { const [x, y] = this.camTarget(); this.cam.x = x; this.cam.y = y; }
  stepCamera(dt) {
    const [tx, ty] = this.camTarget();
    this.cam.x += (tx - this.cam.x) * Math.min(1, dt * (this.cam.lockX != null ? 3 : 5));
    this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 3.5);
  }
}

export { DT };
