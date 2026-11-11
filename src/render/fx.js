// Particles and floating text. Purely cosmetic: nothing in here feeds back into the simulation.
export class Fx {
  constructor() { this.p = []; this.texts = []; this.reduced = false; }
  clear() { this.p.length = 0; this.texts.length = 0; }

  // water droplets
  drops(x, y, n, o = {}) {
    if (this.reduced) n = Math.ceil(n / 2);
    for (let i = 0; i < n && this.p.length < 700; i++) {
      const a = (o.a ?? Math.PI / 2) + (Math.random() - 0.5) * (o.spread ?? Math.PI), v = (o.v ?? 5) * (0.4 + Math.random() * 0.8);
      this.p.push({ k: 0, x, y, vx: Math.cos(a) * v + (o.vx || 0), vy: Math.sin(a) * v + (o.vy || 0), g: o.g ?? 22, life: 0, max: (o.life ?? 0.5) * (0.6 + Math.random() * 0.6), r: (o.r ?? 0.07) * (0.6 + Math.random() * 0.8), c: o.c || '#7fd6ff' });
    }
  }
  // one sprite, optionally an animation (frames) or a tumbling chunk
  sprite(name, x, y, o = {}) {
    if (this.p.length > 900) return;
    this.p.push({ k: 1, name, frames: o.frames, x, y, vx: o.vx || 0, vy: o.vy || 0, g: o.g || 0, life: 0, max: o.life ?? 0.4, sc: o.sc ?? 1, grow: o.grow || 0, rot: o.rot || 0, vr: o.vr || 0, flip: !!o.flip, fade: o.fade ?? 0.35, a: o.alpha ?? 1, tint: o.tint, back: !!o.back });
  }
  ring(x, y, o = {}) { this.p.push({ k: 2, x, y, vx: 0, vy: 0, g: 0, life: 0, max: o.life ?? 0.35, r: o.r ?? 0.3, grow: o.grow ?? 4, c: o.c || '#ffffff', w: o.w ?? 0.12 }); }
  text(str, x, y, o = {}) {
    this.texts.push({ str, x, y, vy: o.vy ?? 1.6, life: 0, max: o.life ?? 0.9, size: o.size ?? 0.42, c: o.c || '#fff8e0', stroke: o.stroke || '#3a2414', screen: !!o.screen, pop: o.pop ?? 1, rot: o.rot || 0 });
    if (this.texts.length > 40) this.texts.shift();
  }
  step(dt) {
    const p = this.p;
    for (let i = p.length - 1; i >= 0; i--) {
      const q = p[i];
      q.life += dt;
      if (q.life >= q.max) { p[i] = p[p.length - 1]; p.pop(); continue; }
      q.vy -= q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.vr) q.rot += q.vr * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life += dt; t.y += t.vy * dt; t.vy *= 0.94;
      if (t.life >= t.max) this.texts.splice(i, 1);
    }
  }
  draw(v, back) {
    const ctx = v.ctx, ppu = v.ppu;
    for (const q of this.p) {
      if (q.k === 1 && !!q.back !== !!back) continue;
      if (q.k !== 1 && back) continue;
      const t = q.life / q.max;
      if (q.k === 0) {
        ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
        ctx.fillStyle = q.c;
        ctx.beginPath(); ctx.arc(v.sx(q.x), v.sy(q.y), Math.max(1, q.r * ppu * (1 - t * 0.4)), 0, 6.283); ctx.fill();
      } else if (q.k === 1) {
        const name = q.frames ? q.frames[Math.min(q.frames.length - 1, Math.floor(t * q.frames.length))] : q.name;
        const al = q.a * (t > 1 - q.fade ? (1 - t) / q.fade : 1);
        v.spr(name, q.x, q.y, { sc: q.sc * (1 + q.grow * t), rot: q.rot, flip: q.flip, alpha: al, ax: 0.5, ay: 0.5, tint: q.tint });
      } else {
        ctx.globalAlpha = 1 - t; ctx.strokeStyle = q.c; ctx.lineWidth = Math.max(1, q.w * ppu * (1 - t));
        ctx.beginPath(); ctx.arc(v.sx(q.x), v.sy(q.y), (q.r + q.grow * t * (2 - t) * 0.5) * ppu, 0, 6.283); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  drawTexts(v) {
    const ctx = v.ctx;
    for (const t of this.texts) {
      const k = t.life / t.max, pop = t.life < 0.12 ? 0.6 + (t.life / 0.12) * 0.6 * t.pop : 1 + Math.max(0, 0.2 - (t.life - 0.12)) * t.pop;
      const px = t.size * v.ppu * pop;
      ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      v.label(t.str, v.sx(t.x), v.sy(t.y), px, t.c, t.stroke, 'center', t.rot);
    }
    ctx.globalAlpha = 1;
  }
}
