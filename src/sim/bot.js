// A simple player made of rules. It proves every stage can be finished (tests run it headless)
// and it can demo the game with ?bot=1. It only sees what a player sees and only presses buttons.
import { floorBelow, groundY } from './world.js';
import { SPLASH } from './tune.js';

export class Bot {
  constructor() { this.jumpHold = 0; this.release = 0; this.stuckT = 0; this.lastX = 0; this.lastY = 0; this.t = 0; this.backT = 0; this.queued = 0; }

  press(frames = 14) { if (this.release <= 0 && this.jumpHold <= 0 && !this.queued) this.jumpHold = frames; }
  // a second press needs a released frame first (that is how a thumb does it, too)
  again(frames) { if (this.queued || this.release > 0) return; this.jumpHold = 0; this.release = 1; this.queued = frames; }

  decide(sim) {
    const c = sim.cat, w = sim.world;
    this.t++;
    let mx = 1, my = 0, fire = true, special = false;
    const tap = () => this.press(16);
    const alive = sim.enemies.filter((e) => e.active && e.delay <= 0 && e.state !== 'gone' && e.state !== 'tumble');
    let near = null, nd = 1e9;
    for (const e of alive) { const d = Math.hypot(e.x - c.x, (e.y - c.y) * 1.5); if (d < nd) { nd = d; near = e; } }

    if (sim.climb) return this.climb(sim, near, nd);

    const boss = sim.boss && sim.boss.state === 'fight' ? sim.boss : null;
    const fighting = sim.lock || boss || sim.stage.arena;
    if (fighting) {
      // hold a spot, face the nearest goblin, keep a little distance
      mx = 0;
      let cx = sim.cam.lockX != null ? sim.cam.lockX : c.x;
      if (sim.stage.arena) cx = (sim.stage.arena.L + sim.stage.arena.R) / 2;
      if (boss) cx = boss.x - boss.def.w / 2 - 5.5;
      if (near && nd < 9) {
        const dx = near.x - c.x;
        if (Math.abs(dx) < 2.2 && Math.abs(near.y - c.y) < 1.5) mx = -Math.sign(dx) || 1;      // back off
        else mx = Math.sign(dx) * 0.4;                                                          // face it
        if (near.y - c.y > 1.2 && Math.abs(dx) < 3.5) my = 1;
        if (Math.abs(dx) < 1.4 && (near.state === 'tell' || near.state === 'attack')) tap();
      } else if (boss) {
        const wx = boss.x + boss.def.weak[0], wy = boss.y + boss.def.weak[1];
        mx = c.x < cx - 0.6 ? 1 : c.x > cx + 0.6 ? -1 : 0.4;
        if (wy - c.y > 1.9) { if (c.grounded) tap(); }
        if (boss.attack === 'charge') mx = -1;
        void wx;
      } else if (Math.abs(c.x - cx) > 2.5) mx = Math.sign(cx - c.x);
      // a goblin waiting underneath: drop down to it
      if (near && c.onPlat && near.y < c.y - 1.2 && nd < 8) { my = -1; mx = 0; tap(); }
      // never back off a ledge
      if (mx && floorBelow(w, c.x + Math.sign(mx) * 0.9, c.y + 0.3) < c.y - 1.2) mx = -mx * 0.4;
      if (sim.splash >= SPLASH.need && alive.length >= 3) special = true;
    } else {
      if (near && nd < 2.0 && near.x > c.x && Math.abs(near.y - c.y) < 1.4 && near.type !== 'turret' && !near.taunt) { this.backT = 14; }
      if (this.backT > 0) { this.backT--; mx = this.backT > 7 ? -0.6 : 0.4; }
      if (near && near.x > c.x && near.y - c.y > 1.5 && Math.abs(near.x - c.x) < 3.5) { my = 1; if (Math.abs(near.x - c.x) > 1.5) mx = Math.min(mx, 0.4); }
      // something unbroken in the way?
      for (const p of sim.pickups) if (!p.open && !p.taken && p.x > c.x && p.x - c.x < 2.5 && Math.abs(p.y - c.y) < 1) mx = Math.min(mx, 0.4);
      for (const s of w.solids) if (s.kind === 'gate' && !s.dead && s.x0 > c.x && s.x0 - c.x < 2.2) mx = Math.min(mx, 0.4);
    }

    // dodge what is flying or rolling at the cat
    for (const b of sim.bullets) {
      const dx = b.x - c.x, closing = dx * b.vx < 0;
      if ((b.kind === 'ball' || b.kind === 'bullet' || b.kind === 'shock') && closing && Math.abs(dx) < Math.abs(b.vx) * 0.34 && b.y < c.y + 1.7 && b.y > c.y - 0.3) tap();
      if (b.kind === 'bomb' && Math.abs(dx) < 2.2 && b.landed) mx = dx > 0 ? -1 : 1;
      if (b.kind === 'pebble' && Math.abs(dx) < 1.2 && b.vy < 0 && b.y - c.y < 3 && b.y > c.y) mx = mx >= 0 ? 1 : -1;
    }
    for (const h of sim.hazards) {
      if (h.kind === 'hay' && h.delay <= 0 && h.vx < -1 && h.x > c.x && h.x - c.x < 2.4 && Math.abs(h.y - c.y) < 1.2) tap();
      if (h.kind === 'rock' && h.warn > 0 && Math.abs(h.x - c.x) < 1.4) mx = fighting ? (h.x > c.x ? -1 : 1) : 1;
    }
    for (const b of sim.bullets) if (b.kind === 'rock' && Math.abs(b.x - c.x) < 1.1 && b.y > c.y && b.y - c.y < 5) mx = b.x > c.x ? -1 : 1;

    // terrain: pits and steps in the direction of travel
    const dir = Math.sign(mx) || c.face;
    if (mx && c.grounded) {
      const ahead = floorBelow(w, c.x + dir * 0.75, c.y + 0.4);
      const wall = groundY(w, c.x + dir * 0.8) > c.y + 0.3 || w.solids.some((s) => !s.dead && s.kind !== 'ground' && s.kind !== 'gate' && c.x + dir * 0.8 > s.x0 && c.x + dir * 0.8 < s.x1 && s.y1 > c.y + 0.3 && s.y0 < c.y + 1.4);
      if (wall) tap();
      else if (ahead < c.y - 0.6 && !fighting) {
        let land = false;
        for (let d = 1.2; d < 8.5; d += 0.4) if (floorBelow(w, c.x + dir * d, c.y + 1.2) > c.y - 2.5) { land = true; break; }
        if (land && Math.abs(c.vx) > 3) tap(); else if (!land) mx = 0;
      }
    }
    if (!c.grounded && c.vy < -1 && c.airJumps > 0 && floorBelow(w, c.x + dir * 0.4, c.y + 0.2) < c.y - 3.5 && floorBelow(w, c.x + dir * 1.6, c.y + 0.2) < c.y - 3.5) this.again(14);
    if (!c.grounded && !fighting) mx = Math.max(mx, 1);

    // unstick: if nothing changes for a while, hop
    if (Math.abs(c.x - this.lastX) < 0.02 && !fighting) this.stuckT++; else this.stuckT = 0;
    this.lastX = c.x;
    if (this.stuckT > 90 && c.grounded) { tap(); if (this.stuckT > 240) this.stuckT = 0; }
    return this.out(mx, my, fire, special);
  }

  climb(sim, near, nd) {
    const c = sim.cat, w = sim.world;
    let mx = 0, my = 0;
    const st = sim.stage;
    // next foothold: the lowest platform above that a (double) jump can reach
    let best = null, score = 1e9;
    const reachUp = st.double_jump ? 3.7 : 2.3;
    const feet = c.grounded ? c.y : this.fromY ?? c.y;
    if (c.grounded) this.fromY = c.y;
    for (const p of w.plats) {
      if (p.fallen) continue;
      const dy = p.y - feet; if (dy < 0.35 || dy > reachUp) continue;
      const tx = Math.max(p.x0 + 0.45, Math.min(p.x1 - 0.45, c.x)), dx = Math.abs(tx - c.x);
      const sc = dy * 1.0 + dx * 0.5 - (dy > 1.2 ? 1.5 : 0);
      if (sc < score) { score = sc; best = p; this.tx = tx; }
    }
    if (best) {
      const dx = this.tx - c.x, dy = best.y - c.y;
      mx = Math.abs(dx) > 0.2 ? Math.sign(dx) : 0;
      if (c.grounded) { if (Math.abs(dx) < (dy > 2.3 ? 3.2 : 2.4)) this.press(24); }
      else if (c.vy < 0.5 && c.airJumps > 0 && c.y < best.y + 0.25) this.again(22);
      if (!c.grounded && c.y > best.y + 0.1 && Math.abs(dx) < 0.3) mx = 0;
    } else if (c.grounded && c.y < st.goal_y - 0.5) mx = (Math.floor(this.t / 120) % 2) ? 1 : -1;
    if (near && nd < 6) {
      if (near.y - c.y > 1.3 && Math.abs(near.x - c.x) < 2.5) my = 1;
      else if (c.grounded && Math.abs(near.y - c.y) < 1 && !mx) mx = Math.sign(near.x - c.x) * 0.4;
    }
    if (Math.abs(c.y - this.lastY) < 0.02 && Math.abs(c.x - this.lastX) < 0.02) this.stuckT++; else this.stuckT = 0;
    this.lastY = c.y; this.lastX = c.x;
    if (this.stuckT > 120) { mx = (Math.floor(this.t / 90) % 2) ? 1 : -1; if (c.grounded) this.press(22); }
    return this.out(mx, my, true, false);
  }

  out(mx, my, fire, special) {
    let jump = false;
    if (this.release > 0) this.release--;
    else if (this.queued) { this.jumpHold = this.queued; this.queued = 0; }
    if (this.release <= 0 && this.jumpHold > 0) { jump = true; this.jumpHold--; if (this.jumpHold === 0) this.release = 2; }
    return { mx, my, jump, fire, special };
  }
}
