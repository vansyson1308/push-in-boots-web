// Canvas renderer. Reads simulation state, never writes it.
import { A } from '../assets.js';
import { VIEW_H, SPLASH, CAT, BLASTERS } from '../sim/tune.js';

export const FONT = '"Baloo 2", "Fredoka", "Nunito", system-ui, sans-serif';
const HS = 1.36;   // hero art scale
const GS = 1.16;   // goblin art scale

// hood colour per goblin type: [hue, saturation x, lightness x]
const TEAM = {
  runner: [112, 0.85, 0.8], sprinter: [26, 1.1, 1.02], shield: [214, 1, 1], slinger: [47, 1.1, 1.06], sniper: [272, 0.9, 0.92],
  armored: [222, 0.22, 0.72], bomber: [2, 1.05, 0.95], balloon: [176, 0.9, 1], turret: [222, 0.22, 0.72],
};
// where the forward paw is in each body pose (fraction of the image, facing right)
const HAND = {
  blaster_shoulder_body: [0.86, 0.6], crouch_body: [0.9, 0.66], fall_body: [0.9, 0.5], jump_up_body: [0.9, 0.56],
  land_squash_body: [0.9, 0.58], prone_body: [0.93, 0.66], hero_walk_1: [0.74, 0.6], hero_walk_2: [0.74, 0.6],
  hero_walk_3: [0.74, 0.6], hero_walk_4: [0.74, 0.6],
};
export const JETS = {
  blue: { core: '#dff6ff', mid: '#58c7ff', edge: '#1f86e0', hit: 'rapid' },
  pink: { core: '#fff0f6', mid: '#ff8fc0', edge: '#e0468e', hit: 'fan' },
  lime: { core: '#f6ffe0', mid: '#a8e84a', edge: '#5aa81e', hit: 'pea' },
  gold: { core: '#fffbe0', mid: '#ffd24a', edge: '#e89a14', hit: 'fizz' },
  ice: { core: '#ffffff', mid: '#b8f0ff', edge: '#62c4e8', hit: 'beam' },
};
const WORLD = {
  1: { sky: '#4aa7ee', water: '#3fa9e6', deep: '#2c7fc4', out: '#4a2a12' },
  2: { sky: '#5cb6f0', water: '#3aa0de', deep: '#2877bd', out: '#4a3a2a' },
  3: { sky: '#79c2ee', water: '#4aa2d6', deep: '#2f78b4', out: '#4a2412' },
};

export class View {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.cam = { x: 0, y: 0 }; this.shakeX = 0; this.shakeY = 0; this.zoom = 1;
    this.tints = {}; this.patterns = {}; this.jet = JETS.blue; this.time = 0; this.smug = 0;
    this.resize();
  }
  resize() {
    const c = this.canvas, cw = c.clientWidth || 1280, ch = c.clientHeight || 720;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    while (cw * ch * dpr * dpr > 2.4e6 && dpr > 1) dpr -= 0.25;
    const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    this.W = W; this.H = H; this.dpr = dpr; this.portrait = H > W * 1.05;
    if (!this.portrait) { this.vh = H; this.vw = Math.min(W, Math.round(H * 22 / 9)); this.ox = Math.round((W - this.vw) / 2); this.oy = 0; }
    this.touchScale = dpr * Math.max(1, Math.min(1.6, Math.min(cw, ch) / 390));
    if (this.portrait) {
      // upright phone: the game sits in the upper part of the screen, thumbs get the rest
      this.vw = W; this.vh = Math.round(Math.min(H * 0.56, W / (11.6 / 9))); this.ox = 0;
      const zone = 250 * this.touchScale;
      this.oy = Math.round(Math.max(56 * dpr, (H - this.vh - zone) * 0.42));
    }
    this.ppu = this.vh / VIEW_H;
    this.viewW = Math.max(11, this.vw / this.ppu);
    this.ui = Math.max(0.55, Math.min(1.5, this.vh / 720));   // HUD scale in device px
  }
  sx(x) { return this.ox + this.vw / 2 + (x - this.cam.x) * this.ppu * this.zoom + this.shakeX; }
  sy(y) { return this.oy + this.vh / 2 - (y - this.cam.y) * this.ppu * this.zoom + this.shakeY; }

  // draw a named sprite with its pivot (or ax, ay) at world position x, y
  spr(name, x, y, o) {
    const f = A.frames[name];
    if (!f) return;
    const ctx = this.ctx, k = this.ppu * this.zoom, sc = (o && o.sc) || 1;
    const dw = f.uw * sc * (o && o.sxm ? o.sxm : 1) * k, dh = f.uh * sc * (o && o.sym ? o.sym : 1) * k;
    const px = o && o.ax != null ? o.ax : f.px, py = o && o.ay != null ? o.ay : f.py;
    const X = this.sx(x), Y = this.sy(y);
    if (X + dw * 1.5 < 0 || X - dw * 1.5 > this.W || Y + dh * 1.5 < 0 || Y - dh * 1.5 > this.H) return;
    const img = (o && o.tint && this.tintPage(o.tint)) || A.pages[f.page];
    if (!img) return;
    const sy0 = o && o.tint && this.tints[o.tint] ? f.y - this.tints[o.tint].y0 : f.y;
    if (o && o.alpha != null) ctx.globalAlpha = o.alpha;
    if (o && (o.rot || o.flip)) {
      ctx.save(); ctx.translate(X, Y);
      if (o.rot) ctx.rotate(-o.rot);
      if (o.flip) ctx.scale(-1, 1);
      ctx.drawImage(img, f.x, sy0, f.w, f.h, -px * dw, -py * dh, dw, dh);
      if (o.flash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.75; ctx.drawImage(img, f.x, sy0, f.w, f.h, -px * dw, -py * dh, dw, dh); }
      ctx.restore();
    } else {
      ctx.drawImage(img, f.x, sy0, f.w, f.h, X - px * dw, Y - py * dh, dw, dh);
      if (o && o.flash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.75; ctx.drawImage(img, f.x, sy0, f.w, f.h, X - px * dw, Y - py * dh, dw, dh); ctx.globalCompositeOperation = 'source-over'; }
    }
    if (o && (o.alpha != null || o.flash)) ctx.globalAlpha = 1;
  }
  label(str, X, Y, px, fill, stroke, align = 'center', rot = 0) {
    const ctx = this.ctx;
    ctx.font = `800 ${Math.round(px)}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, px * 0.24);
    if (rot) { ctx.save(); ctx.translate(X, Y); ctx.rotate(rot); X = 0; Y = 0; }
    if (stroke) { ctx.strokeStyle = stroke; ctx.strokeText(str, X, Y); }
    ctx.fillStyle = fill; ctx.fillText(str, X, Y);
    if (rot) ctx.restore();
  }

  // Goblin hoods are painted magenta; each type gets its own colour, recoloured once and cached.
  tintPage(type) {
    const cached = this.tints[type];
    if (cached) return cached.canvas;
    const page = A.pages.gob_0, col = TEAM[type];
    if (!page || !col) return null;
    let y0 = 1e9, y1 = 0;
    for (const [n, f] of Object.entries(A.frames)) if (f.page === 'gob_0' && /\/(cheer|flee|hop|ko_spin|light_fuse|panic_run_a|panic_run_b|trip|white_flag|windup_bash|windup_throw|head_dizzy)$/.test(n)) { y0 = Math.min(y0, f.y); y1 = Math.max(y1, f.y + f.h); }
    const cv = document.createElement('canvas'); cv.width = page.width; cv.height = y1 - y0;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(page, 0, -y0);
    const id = cx.getImageData(0, 0, cv.width, cv.height), d = id.data;
    const [th, ts, tl] = col;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dl = mx - mn;
      if (dl < 0.12) continue;
      let h;
      if (mx === r) h = ((g - b) / dl) % 6; else if (mx === g) h = (b - r) / dl + 2; else h = (r - g) / dl + 4;
      h *= 60; if (h < 0) h += 360;
      if (h < 288 || h > 345) continue;
      let s = dl / (1 - Math.abs(2 * l - 1));
      if (s < 0.3) continue;
      s = Math.min(1, s * ts); const L = Math.min(1, l * tl);
      const C = (1 - Math.abs(2 * L - 1)) * s, hp = th / 60, X = C * (1 - Math.abs((hp % 2) - 1)), m = L - C / 2;
      let R = 0, G = 0, B = 0;
      if (hp < 1) { R = C; G = X; } else if (hp < 2) { R = X; G = C; } else if (hp < 3) { G = C; B = X; } else if (hp < 4) { G = X; B = C; } else if (hp < 5) { R = X; B = C; } else { R = C; B = X; }
      d[i] = (R + m) * 255; d[i + 1] = (G + m) * 255; d[i + 2] = (B + m) * 255;
    }
    cx.putImageData(id, 0, 0);
    this.tints[type] = { canvas: cv, y0 };
    return cv;
  }

  dirtPattern(n) {
    if (this.patterns[n]) return this.patterns[n];
    const f = A.frames[`w${n}/floor`], page = A.pages[`w${n}_0`];
    if (!f || !page) return null;
    const cw = Math.round(f.w * 0.76), chh = Math.round(f.h * 0.3);
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = chh;
    const cx = cv.getContext('2d');
    cx.drawImage(page, f.x + f.w * 0.12, f.y + f.h * 0.52, cw, chh, 0, 0, cw, chh);
    // soften the seam between repeats
    cx.globalAlpha = 0.5; cx.drawImage(page, f.x + f.w * 0.12, f.y + f.h * 0.52, cw, 6, 0, chh - 6, cw, 6); cx.globalAlpha = 1;
    const p = { pat: this.ctx.createPattern(cv, 'repeat'), pxu: f.w / f.uw };
    const px = cx.getImageData(Math.round(cw / 2), Math.round(chh * 0.2), 1, 1).data;
    p.color = `rgb(${px[0]},${px[1]},${px[2]})`;
    return (this.patterns[n] = p);
  }

  // ---------------------------------------------------------------------------
  begin(sim, shake) {
    this.sim = sim; this.n = sim.stage.world || 1; this.wd = WORLD[this.n];
    this.cam.x = sim.cam.x; this.cam.y = sim.cam.y;
    this.shakeX = shake ? shake[0] * this.ppu : 0; this.shakeY = shake ? shake[1] * this.ppu : 0;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#231712'; ctx.fillRect(0, 0, this.W, this.H);
    ctx.save();
    ctx.beginPath(); ctx.rect(this.ox, this.oy, this.vw, this.vh); ctx.clip();
  }
  end() { this.ctx.restore(); }

  drawWorld(sim, fx, o = {}) {
    this.time = sim.time;
    this.background(sim);
    this.ambient(sim);
    this.decor(sim, 'back');
    this.pitWater(sim);
    fx.draw(this, true);
    this.terrain(sim);
    this.markers(sim);
    this.decor(sim, 'play');
    this.pickups(sim);
    this.hazards(sim);
    if (sim.boss) this.boss(sim, sim.boss);
    this.enemies(sim);
    if (o.buddy) this.buddy(sim, o.buddy);
    this.cat(sim);
    this.shots(sim);
    this.bullets(sim);
    this.waves(sim);
    fx.draw(this, false);
    this.decor(sim, 'fore');
    this.foreground(sim);
    fx.drawTexts(this);
  }

  background(sim) {
    const ctx = this.ctx, n = this.n, sky = A.images[`w${n}_sky`], hills = A.images[`w${n}_hills`];
    ctx.fillStyle = this.wd.sky; ctx.fillRect(this.ox, this.oy, this.vw, this.vh);
    const base = VIEW_H / 2 - 1.6;
    if (sky) {
      const s = (this.vh / sky.height) * 1.06, tw = sky.width * s, th = sky.height * s;
      const y = this.oy - th * 0.03 + Math.min(this.vh * 0.9, (this.cam.y - base) * this.ppu * 0.06);
      let off = -((this.cam.x * this.ppu * 0.05) % (tw * 2)); if (off > 0) off -= tw * 2;
      for (let i = 0, x = this.ox + off; x < this.ox + this.vw; i++, x += tw) {
        if (x + tw < this.ox) continue;
        if (i % 2) { ctx.save(); ctx.translate(x + tw, y); ctx.scale(-1, 1); ctx.drawImage(sky, 0, 0, tw + 1, th); ctx.restore(); }
        else ctx.drawImage(sky, x, y, tw + 1, th);
      }
    }
    if (hills) {
      const hu = 21, tw = hu * this.ppu, th = tw * (hills.height / hills.width);
      const y = this.sy(0) + 0.9 * this.ppu - th + (this.cam.y - base) * this.ppu * 0.45;
      let off = -((this.cam.x * this.ppu * 0.3) % tw); if (off > 0) off -= tw;
      for (let x = this.ox + off; x < this.ox + this.vw; x += tw) ctx.drawImage(hills, x, y, tw + 1, th);
    }
  }

  // Clouds, birds and butterflies: the meadow is alive even when nothing is attacking.
  ambient(sim) {
    const n = this.n, t = sim.time, k = this.ppu, W = this.viewW, cx = this.cam.x, top = this.cam.y + VIEW_H / 2;
    const wrap = (v, span) => ((v % span) + span) % span;
    for (let i = 0; i < 4; i++) {
      const span = W + 12, x = cx * 0.88 - W / 2 - 6 + wrap(i * 7.3 + t * (0.18 + i * 0.03) - cx * 0.88, span);
      this.spr(i % 2 ? 'fx/cloud_a' : 'fx/cloud_b', x, top - 1.3 - (i * 1.37) % 2.6, { sc: 2.6 + (i % 3) * 0.7, ax: 0.5, ay: 0.5, alpha: 0.85 });
    }
    const flyers = { 1: ['w1/sparrow_1', 'w1/sparrow_2', 'w1/sparrow_3'], 2: ['w2/duck_1', 'w2/duck_2', 'w2/duck_3'], 3: ['w3/bird_1', 'w3/bird_2', 'w3/bird_3'] }[n];
    for (let i = 0; i < 3; i++) {
      const span = W + 20, sp = 1.6 + i * 0.5, dir = i % 2 ? -1 : 1;
      const x = cx * 0.7 - span / 2 + wrap(dir * t * sp + i * 13.7 - cx * 0.7 + span / 2, span);
      const y = top - 2.2 - i * 0.9 + Math.sin(t * 1.3 + i * 2) * 0.35;
      this.spr(flyers[Math.floor(t * 7 + i) % 3], x, y, { sc: 1.5, ax: 0.5, ay: 0.5, flip: dir < 0 });
    }
    const far = n === 3 ? 'w3/hawk_' + (1 + Math.floor(t * 2) % 2) : `w${n}/flock_1`;
    if (A.frames[far]) { const span = W + 30; this.spr(far, cx * 0.9 - span / 2 + wrap(t * 0.7 - cx * 0.9 + span / 2, span), top - 1.5, { sc: n === 3 ? 1.2 : 1.6, ax: 0.5, ay: 0.5, alpha: 0.8 }); }
    if (n === 1 || n === 2) {
      const nm = n === 1 ? ['w1/butterfly_1', 'w1/butterfly_2'] : ['w2/dragonfly_1', 'w2/dragonfly_2'];
      const first = Math.floor((cx - W / 2 - 2) / 9);
      for (let j = first; j < first + Math.ceil(W / 9) + 2; j++) {
        const bx = j * 9 + 3 + Math.sin(t * 0.7 + j * 1.9) * 1.6, by = 1.4 + ((j * 7) % 3) * 0.5 + Math.sin(t * 1.9 + j) * 0.5;
        this.spr(nm[Math.floor(t * 9 + j) % 2], bx, by + (sim.climb ? this.cam.y - 3 : 0), { sc: 1.4, ax: 0.5, ay: 0.5, flip: Math.cos(t * 0.7 + j * 1.9) < 0 });
      }
    }
    void k;
  }

  // Big soft shapes in front of the camera give the scene depth.
  foreground(sim) {
    if (sim.climb || this.portrait) return;
    const n = this.n, par = 1.35, cx = this.cam.x, W = this.viewW;
    const base = this.cam.y - VIEW_H / 2;
    const first = Math.floor((cx * par - W / 2 - 4) / 13);
    for (let j = first; j <= first + Math.ceil(W / 13) + 1; j++) {
      const id = 1 + ((j % 6) + 6) % 6, f = A.frames[`w${n}/fg_${id}`];
      if (!f || id === 2 && n === 1) continue;
      const wx = j * 13 + ((j * 5) % 7) - cx * par + cx;
      this.spr(`w${n}/fg_${id}`, wx, base - 0.35 - ((j * 3) % 4) * 0.12, { sc: 1.15, ax: 0.5, ay: 0.72, alpha: 0.96 });
    }
  }

  pitWater(sim) {
    if (sim.climb) return;
    const ctx = this.ctx, y = this.sy(-1.55), t = sim.time;
    if (y > this.oy + this.vh) return;
    ctx.fillStyle = this.wd.deep; ctx.fillRect(this.ox, y, this.vw, this.oy + this.vh - y);
    ctx.fillStyle = this.wd.water;
    ctx.beginPath(); ctx.moveTo(this.ox, this.oy + this.vh);
    const step = this.ppu * 0.5;
    for (let x = this.ox; x <= this.ox + this.vw + step; x += step) {
      const wx = (x - this.sx(0)) / this.ppu;
      ctx.lineTo(x, y + Math.sin(wx * 2.1 + t * 2.2) * this.ppu * 0.07 + this.ppu * 0.1);
    }
    ctx.lineTo(this.ox + this.vw, this.oy + this.vh); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = Math.max(1.5, this.ppu * 0.035);
    ctx.beginPath();
    for (let x = this.ox; x <= this.ox + this.vw + step; x += step) {
      const wx = (x - this.sx(0)) / this.ppu, yy = y + Math.sin(wx * 2.1 + t * 2.2) * this.ppu * 0.07 + this.ppu * 0.1;
      if (x === this.ox) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  terrain(sim) {
    const ctx = this.ctx, n = this.n, k = this.ppu, P = this.dirtPattern(n);
    const f = A.frames[`w${n}/floor`], page = A.pages[`w${n}_0`];
    const bottom = this.oy + this.vh + 2;
    if (P && P.pat.setTransform) P.pat.setTransform(new DOMMatrix().translateSelf(this.sx(0), this.sy(0)).scaleSelf(k / P.pxu));
    const body = (x0, x1, yTop, yBot) => {
      ctx.fillStyle = P ? P.pat : '#9a6a3a'; ctx.fillRect(x0, yTop, x1 - x0, yBot - yTop);
      const g = ctx.createLinearGradient(0, yTop, 0, yTop + k * 5);
      g.addColorStop(0, 'rgba(40,20,8,0)'); g.addColorStop(1, 'rgba(40,20,8,.42)');
      ctx.fillStyle = g; ctx.fillRect(x0, yTop, x1 - x0, yBot - yTop);
    };
    const ow = Math.max(2, k * 0.055);
    // walls (the shaft of a climb stage) and gates
    for (const s of sim.world.solids) {
      if (s.kind === 'ground' || s.dead) continue;
      const x0 = this.sx(s.x0), x1 = this.sx(s.x1), y1 = this.sy(s.y1), y0 = this.sy(s.y0);
      if (x1 < this.ox || x0 > this.ox + this.vw) continue;
      if (s.kind === 'gate') {
        const fw = A.frames[`w${n}/crack_wall`], w = s.x1 - s.x0, rows = Math.ceil((s.y1 - s.y0) / w);
        for (let r = 0; r < rows; r++) this.spr(`w${n}/crack_wall`, (s.x0 + s.x1) / 2, s.y0 + w * (r + 0.5), { sc: (w / fw.uw) * 1.04, ax: 0.5, ay: 0.5, flash: s.flash > 0 });
        this.spr('gob/gate', (s.x0 + s.x1) / 2, s.y0, { sc: 1.25 * 1.2, ax: 0.5, ay: 1 });
        if (s.hp < s.maxHp) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x0, y1 - k * 0.42, x1 - x0, k * 0.16); ctx.fillStyle = '#ffd24a'; ctx.fillRect(x0, y1 - k * 0.42, (x1 - x0) * Math.max(0, s.hp / s.maxHp), k * 0.16); }
      } else {
        body(x0, x1, Math.max(this.oy - 2, y1), Math.min(bottom, y0));
        ctx.fillStyle = this.wd.out;
        if (s.x0 > 0) ctx.fillRect(x0 - ow / 2, Math.max(this.oy, y1), ow, Math.min(bottom, y0) - Math.max(this.oy, y1));
        else ctx.fillRect(x1 - ow / 2, Math.max(this.oy, y1), ow, Math.min(bottom, y0) - Math.max(this.oy, y1));
      }
    }
    // ground columns, lowest first so that steps overlap correctly
    const segs = sim.world.solids.filter((s) => s.kind === 'ground').sort((a, b) => a.y1 - b.y1);
    const capU = f ? f.uw * 0.09 : 0.8, topH = f ? f.uh * 0.6 : 1, lift = 0.2;
    for (const s of segs) {
      const x0 = this.sx(s.x0), x1 = this.sx(s.x1);
      if (x1 < this.ox - k || x0 > this.ox + this.vw + k) continue;
      const yTop = this.sy(s.y1 - (topH - lift) + 0.05);
      body(x0 + ow / 2, x1 - ow / 2, yTop, bottom);
      ctx.fillStyle = this.wd.out; ctx.fillRect(x0, yTop, ow, bottom - yTop); ctx.fillRect(x1 - ow, yTop, ow, bottom - yTop);
      if (!f || !page) continue;
      // three-slice the painted floor: left cap, tiled middle, right cap
      const sy0 = this.sy(s.y1 + lift), dh = topH * k, sh = f.h * 0.6;
      const w = s.x1 - s.x0, cu = Math.min(capU, w / 2), cs = f.w * 0.09;
      ctx.drawImage(page, f.x, f.y, cs, sh, x0, sy0, cu * k + 1, dh);
      ctx.drawImage(page, f.x + f.w - cs, f.y, cs, sh, x1 - cu * k - 1, sy0, cu * k + 1, dh);
      const midU = f.uw * 0.82, ms = f.w * 0.82;
      let mx = s.x0 + cu; const mEnd = s.x1 - cu;
      const first = Math.max(0, Math.floor((this.cam.x - this.viewW / 2 - 1 - mx) / midU));
      mx += first * midU;
      for (; mx < mEnd && this.sx(mx) < this.ox + this.vw; mx += midU) {
        const part = Math.min(1, (mEnd - mx) / midU);
        ctx.drawImage(page, f.x + cs, f.y, ms * part, sh, this.sx(mx) - 0.5, sy0, midU * part * k + 1, dh);
      }
    }
    // platforms
    for (const p of sim.world.plats) {
      if (p.fallen && p.respawn < 2.2) continue;
      const w = p.x1 - p.x0, cx = (p.x0 + p.x1) / 2;
      if (cx + w < this.cam.x - this.viewW / 2 - 1 || cx - w > this.cam.x + this.viewW / 2 + 1) continue;
      if (p.kind === 'collapse' || p.helper) {
        const fr = A.frames[`w${n}/oneway_plank`]; if (!fr) continue;
        const jx = p.shake && !p.fallen ? Math.sin(sim.time * 70) * 0.04 : 0;
        this.spr(`w${n}/oneway_plank`, cx + jx, p.y, { sxm: (w * 1.04) / fr.uw, ax: 0.5, ay: 0.16, alpha: p.fallen ? Math.max(0, (p.respawn - 2.2)) : 1 });
      } else {
        if (p.kind === 'moving' && n === 2 && A.frames['w2/raft_reference'] && Math.abs(p.dy) < 0.5) {   // rafts on the river
          const fr = A.frames['w2/raft_reference'];
          this.spr('w2/raft_reference', cx, p.y + Math.sin(sim.time * 2 + p.id) * 0.03, { sc: (w * 1.06) / fr.uw, ax: 0.5, ay: 0.22 });
          continue;
        }
        const nm = w <= 2.05 ? 'platform_s' : w <= 3.9 ? 'platform_m' : 'platform_l';
        const fr = A.frames[`w${n}/${nm}`]; if (!fr) continue;
        this.spr(`w${n}/${nm}`, cx, p.y, { sxm: (w * 1.1) / fr.uw, ax: 0.5, ay: 0.2 });
      }
    }
  }

  markers(sim) {
    const st = sim.stage;
    for (const cp of sim.checkpoints) this.spr(cp.hit ? 'fx/checkpoint_flag_up' : 'fx/checkpoint_flag_down', cp.x, cp.y, { sc: 1.1, ax: 0.42, ay: 0.97 });
    if (!st.arena && !st.boss) {
      const gx = st.goal_x + (sim.climb ? 0 : 0.6), gy = sim.climb ? st.goal_y : Math.max(0, st.goal_y);
      const pulse = 1 + Math.sin(sim.time * 4) * 0.06;
      this.spr('fx/glow', gx, gy + 1.4, { sc: 5 * pulse, ax: 0.5, ay: 0.5, alpha: 0.55 });
      this.spr('fx/signpost', gx - 0.7, gy, { sc: 3.6, ax: 0.5, ay: 1 });
      this.spr('fx/star', gx, gy + 1.5 + Math.sin(sim.time * 3) * 0.12, { sc: 2 * pulse, ax: 0.5, ay: 0.5 });
    }
  }

  decor(sim, layer) {
    const n = this.n, L = this.cam.x - this.viewW / 2 - 4, R = this.cam.x + this.viewW / 2 + 4;
    for (const d of sim.stage.decor || []) {
      if (d.layer !== layer || d.x < L || d.x > R || d.art === 'goal') continue;
      this.spr(`w${n}/${d.art}`, d.x, d.y, { sc: d.scale, flip: !!d.flip });
    }
  }

  pickups(sim) {
    const t = sim.time;
    for (const p of sim.pickups) {
      if (p.taken && !(p.container === 'cage')) continue;
      if (!sim.onScreen(p.x, 2)) continue;
      if (p.container === 'cage') {
        if (p.taken) continue;
        const cy = p.y, hop = Math.abs(Math.sin(t * 5 + p.i)) * 0.05;
        this.spr('fx/' + p.kitten, p.x, cy + 0.12 + hop, { sc: 1.25, ax: 0.5, ay: 1 });
        this.spr(p.hp <= 2.5 ? 'fx/cage_cracked' : 'fx/cage', p.x, cy, { sc: 1.05, ax: 0.5, ay: 1, flash: p.flash > 0 });
        if (Math.sin(t * 2.5 + p.i) > 0.2) this.spr('fx/speech_bubble', p.x + 0.55, cy + 1.75, { sc: 0.42, ax: 0.5, ay: 0.5 });
        if (Math.sin(t * 2.5 + p.i) > 0.2) this.label('!', this.sx(p.x + 0.55), this.sy(cy + 1.8), this.ppu * 0.3, '#e0463a', null);
        continue;
      }
      if (!p.open) { this.spr('fx/barrel', p.x, p.y, { sc: 1.05, ax: 0.5, ay: 1, flash: p.flash > 0 }); continue; }
      const bob = Math.sin(t * 3.2 + p.bob * 6.3) * 0.07;
      switch (p.content) {
        case 'coin': this.spr('fx/coin', p.x, p.y + bob, { sc: 1.15, sxm: Math.abs(Math.cos(t * 3.5 + p.bob * 6.3)) * 0.85 + 0.15, ax: 0.5, ay: 0.5 }); break;
        case 'seed': this.spr('fx/glow', p.x, p.y + 0.1, { sc: 2.4, ax: 0.5, ay: 0.5, alpha: 0.5 }); this.spr('fx/seed_pouch', p.x, p.y + bob, { sc: 0.82, ax: 0.5, ay: 0.5 }); break;
        case 'heart': this.spr('fx/heart', p.x, p.y + bob, { sc: 1.25 + Math.sin(t * 6) * 0.08, ax: 0.5, ay: 0.5 }); break;
        case 'catnip': this.spr('fx/catnip', p.x, p.y + bob, { sc: 0.95, ax: 0.5, ay: 0.5 }); break;
        case 'bubble': this.spr('fx/bubble_shield', p.x, p.y + bob, { sc: 0.9, ax: 0.5, ay: 0.5 }); break;
        case 'yarn': this.spr('fx/yarn_bomb', p.x, p.y + bob, { sc: 0.8, ax: 0.5, ay: 0.5 }); break;
        default: {
          const nm = { pea: 'pea_popper', rapid: 'rapid_purr', fan: 'fan_spray', beam: 'beam_whisker', fizz: 'spicy_fizz' }[p.content];
          this.spr('fx/glow', p.x, p.y + 0.1, { sc: 3, ax: 0.5, ay: 0.5, alpha: 0.6 });
          this.spr('fx/' + nm, p.x, p.y + bob + 0.05, { sc: 1.1, ax: 0.5, ay: 0.5 });
        }
      }
    }
  }

  hazards(sim) {
    const ctx = this.ctx, k = this.ppu;
    for (const h of sim.hazards) {
      if (h.kind === 'hay') {
        if (h.delay > 0) continue;
        const nm = [`w${this.n}/rolling_hay`, `w${this.n}/falling_rock`, `boss${this.n}/part_3`].find((k) => A.frames[k] && A.pages[A.frames[k].page]);
        const fr = A.frames[nm];
        if (fr) this.spr(nm, h.x, h.y + h.r, { sc: (h.r * 2.25) / fr.uh, rot: h.rot, ax: 0.5, ay: 0.5, flash: h.flash > 0 });
        else { ctx.fillStyle = '#c9a24a'; ctx.beginPath(); ctx.arc(this.sx(h.x), this.sy(h.y + h.r), h.r * k, 0, 6.283); ctx.fill(); }
      } else if (h.warn > 0 && h.delay <= 0) {
        const X = this.sx(h.x), Y = this.sy(h.gy), a = 0.35 + 0.35 * Math.sin(sim.time * 22);
        ctx.fillStyle = `rgba(220,40,30,${a})`; ctx.beginPath(); ctx.ellipse(X, Y, k * 0.75, k * 0.16, 0, 0, 6.283); ctx.fill();
        this.label('!', X, Y - k * (1.2 + 0.1 * Math.sin(sim.time * 14)), k * 0.7, '#ffd24a', '#7a1a10');
      }
    }
  }

  goblinPose(e) {
    if (e.state === 'tumble') return 'ko_spin';
    if (e.cheer > 0) return 'cheer';
    if (e.stagger > 0) return 'panic_run_a';
    if (e.state === 'tell') return e.type === 'bomber' ? 'light_fuse' : e.type === 'shield' ? 'windup_bash' : e.type === 'sprinter' ? 'hop' : 'windup_throw';
    if (e.state === 'attack') return e.type === 'sprinter' ? 'trip' : e.type === 'bomber' || e.type === 'slinger' ? 'windup_throw' : 'trip';
    if (e.state === 'leap') return 'hop';
    if (e.loot) return Math.abs(e.vx) > 0.5 ? (Math.floor(e.anim * 8) % 2 ? 'panic_run_a' : 'panic_run_b') : 'steal_none';
    if (e.skid > 0) return 'panic_run_b';
    if (Math.abs(e.vx) > 0.3) return Math.floor(e.anim * 5) % 2 ? 'hop' : 'flee';
    return 'hop';
  }

  enemies(sim) {
    for (const e of sim.enemies) {
      if (e.delay > 0 || e.state === 'gone' || !sim.onScreen(e.x, 3)) continue;
      const fl = e.flash > 0, flip = e.face < 0;
      if (e.type === 'turret') {
        this.spr('gob/turret_base', e.x, e.y, { sc: 1.25, ax: 0.5, ay: 1, flash: fl });
        if (e.open) this.spr('gob/turret_barrel', e.x + e.face * 0.25, e.y + 0.55, { sc: 1.15, ax: 0.5, ay: 0.75, flip: !flip, flash: fl });
        this.spr('gob/turret_lid', e.x, e.y + (e.open ? 1.15 + Math.sin(sim.time * 9) * 0.03 : 0.72), { sc: 1.2, ax: 0.5, ay: 1, rot: e.open ? e.face * 0.5 : 0, flash: fl });
        if (e.state === 'tell') this.spr('gob/warning_lamp', e.x, e.y + 1.3, { sc: 0.7, ax: 0.5, ay: 1, alpha: 0.5 + 0.5 * Math.sin(sim.time * 30) });
        continue;
      }
      if (e.type === 'balloon') {
        const sway = Math.sin(e.anim * 2) * 0.06;
        this.spr('gob/balloon', e.x, e.y - 0.15, { sc: 1.05, rot: sway + e.vx * 0.04, flash: fl });
        this.spr('gob/head', e.x, e.y + 0.42, { sc: 0.62, ax: 0.5, ay: 1, flip, tint: null });
        if (e.state === 'tell') this.label('!', this.sx(e.x), this.sy(e.y + 2.2), this.ppu * 0.6, '#ffd24a', '#7a1a10');
        continue;
      }
      const pose = this.goblinPose(e), tint = e.type;
      if (e.state === 'tumble') {
        this.spr('gob/ko_spin', e.x, e.y + 0.45, { sc: GS, rot: e.rot, ax: 0.5, ay: 0.5, tint, flash: fl });
        continue;
      }
      const moving = Math.abs(e.vx) > 0.3 && e.grounded;
      const hop = moving ? Math.abs(Math.sin(e.anim * 9)) * 0.12 : 0;
      const sq = e.state === 'tell' ? 1 + Math.sin(e.t * 26) * 0.03 : 1;
      const lean = e.stagger > 0 ? -e.face * 0.25 : e.state === 'attack' ? e.face * -0.15 : 0;
      this.spr('gob/' + pose, e.x, e.y + hop, { sc: GS, sym: sq, flip: pose === 'white_flag' ? !flip : flip, rot: lean * (flip ? -1 : 1) * -1, ax: 0.5, ay: 0.97, tint, flash: fl });
      // gear
      if (e.type === 'shield' && e.shield > 0 && pose !== 'windup_bash') this.spr('gob/gear_shield', e.x + e.face * 0.42, e.y + 0.62 + hop, { sc: 1.5, ax: 0.5, ay: 0.5, flip, flash: fl });
      if (e.type === 'armored' && e.helmet) this.spr('fx/helmet_open', e.x + e.face * 0.02, e.y + 1.5 + hop, { sc: 0.62, ax: 0.5, ay: 0.5, flip });
      if (e.type === 'sniper') {
        this.spr('gob/gear_sniper', e.x + e.face * 0.45, e.y + 0.8 + hop, { sc: 1.0, ax: 0.5, ay: 0.5, flip });
        if (e.state === 'tell') this.spr('gob/aim_glint', e.x + e.face * 0.9, e.y + 0.95, { sc: 0.5 + 0.3 * Math.sin(e.t * 20), ax: 0.5, ay: 0.5, rot: e.t * 3 });
      }
      if (e.type === 'slinger' && pose !== 'windup_throw') this.spr('gob/gear_slinger', e.x + e.face * 0.4, e.y + 0.75 + hop, { sc: 0.85, ax: 0.5, ay: 0.5, flip });
      if (e.type === 'sprinter') this.spr('gob/gear_sprinter', e.x - e.face * 0.25, e.y + 0.95 + hop, { sc: 0.75, ax: 0.5, ay: 0.5, flip });
      if (e.loot) this.spr('fx/seed_pouch', e.x - e.face * 0.1, e.y + 1.75 + hop, { sc: 0.95, ax: 0.5, ay: 0.5, rot: Math.sin(e.anim * 9) * 0.12 });
      if (e.state === 'tell') this.label('!', this.sx(e.x), this.sy(e.y + e.h + 0.75 + Math.sin(e.t * 20) * 0.05), this.ppu * 0.55, '#ffd24a', '#7a1a10');
    }
  }

  boss(sim, b) {
    if (b.state === 'gone') return;
    const n = this.n, P = `boss${n}/`, d = b.def, fl = b.flash > 0;
    const jx = b.shake > 0 ? Math.sin(sim.time * 60) * 0.06 : 0, x = b.x + jx, y = b.y;
    const body = b.phase === 1 ? 'body' : b.phase === 2 ? 'body_phase2' : 'body_phase3';
    const fb = A.frames[P + 'body']; if (!fb) return;
    const sc = d.h / fb.uh, tell = b.attack && b.step === 0;
    const wheelY = y + 0.55;
    if (b.type === 'siege_tower') {
      this.spr(P + 'part_3', x - d.w * 0.44, y + 1.15, { sc: sc * 0.85, ax: 0.75, ay: 0.5, rot: tell && b.attack === 'volley' ? Math.sin(sim.time * 40) * 0.05 : 0 });
      this.spr(P + body, x, y + 0.45, { sc, ax: 0.5, ay: 1, flash: fl });
      for (const wx of [-1.2, 1.2]) this.spr(P + 'part_2', x + wx, wheelY, { sc: sc * 0.95, rot: b.wheel, ax: 0.5, ay: 0.5 });
      this.spr(P + this.pilotName(b), x + 0.2, y + d.h + 0.15, { sc: sc * 0.8, ax: 0.5, ay: 0.75, flip: true });
    } else if (b.type === 'bridge_crusher') {
      const swing = b.attack === 'slam' ? (b.step === 0 ? -0.5 * Math.min(1, b.t / b.tell) : b.arm * 0.9) : Math.sin(sim.time * 1.5) * 0.06;
      this.spr(P + body, x, y + 0.3, { sc, ax: 0.5, ay: 1, flash: fl });
      this.spr(P + 'part_2', x - 0.4, y + d.h * 0.93, { sc: sc * 0.85, ax: 0.5, ay: 0.08, rot: swing });
      this.spr(P + this.pilotName(b), x + 0.6, y + d.h + 0.25, { sc: sc * 0.8, ax: 0.5, ay: 0.75, flip: true });
      this.spr(P + 'part_5', x + 1.6, y + d.h * 0.8, { sc: sc * 0.8, ax: 0.5, ay: 0, rot: Math.sin(sim.time * 3) * 0.08 });
    } else {
      const arm = b.attack === 'boulders' ? (b.step === 0 ? -0.6 * Math.min(1, b.t / b.tell) : b.arm * 1.2 - 0.6) : -0.1;
      this.spr(P + 'part_2', x + 0.6, y + d.h * 0.86, { sc: sc * 0.9, ax: 0.85, ay: 0.7, rot: -arm });
      this.spr(P + body, x, y + 0.2, { sc, ax: 0.5, ay: 1, flash: fl, flip: true });
      this.spr(P + this.pilotName(b), x + 1.1, y + d.h + 0.05, { sc: sc * 0.8, ax: 0.5, ay: 0.75, flip: true });
    }
    if (b.state === 'fight' || b.state === 'intro') {
      const wx = x + d.weak[0], wy = y + d.weak[1], pulse = 1 + Math.sin(sim.time * 7) * 0.08;
      this.spr('fx/glow', wx, wy, { sc: 4.2 * pulse, ax: 0.5, ay: 0.5, alpha: 0.75 });
      this.spr(P + (b.phase > 1 ? 'weak_cracked' : 'weakpoint'), wx, wy, { sc: sc * 1.1 * (fl ? 1.15 : 1), ax: 0.5, ay: 0.5, flash: fl });
      if (tell) this.spr('gob/warning_lamp', x - d.w * 0.3, y + d.h * 0.95, { sc: 1.1, ax: 0.5, ay: 1, alpha: 0.45 + 0.55 * Math.abs(Math.sin(sim.time * 16)) });
    }
  }
  pilotName(b) { return b.state === 'down' ? 'pilot_flag' : b.hurtT > 0 || b.shake > 0 ? 'pilot_panic' : b.pilot === 'dizzy' ? 'pilot_dizzy' : 'pilot_angry'; }

  heroPose(c, sim) {
    if (c.dead) return 'ko_loaf';
    if (sim.outcome === 'win') return 'victory_smoke_body';
    if (c.hurtT > 0) return 'hurt';
    if (c.spinT > 0) return 'spin_tuck_body';
    if (c.prone) return 'prone_body';
    if (!c.grounded) return c.vy > 1.5 ? 'jump_up_body' : 'fall_body';
    if (c.landT > 0.05) return 'land_squash_body';
    if (Math.abs(c.vx) > 0.7) return 'hero_walk_' + (1 + (Math.floor(c.runDist * 1.7) % 4));
    if (c.firing || c.shotFlash > 0) return 'crouch_body';
    if (this.smug > 0 && c.idleT > 0.15) return 'side_eye_camera';
    if (c.idleT > 6 && c.idleT < 8.5) return 'yawn';
    if (c.idleT > 12 && c.idleT < 15) return 'lick_paw';
    if (c.idleT > 20) return 'sit_loaf';
    return 'blaster_shoulder_body';
  }

  cat(sim) {
    const c = sim.cat, ctx = this.ctx, k = this.ppu;
    if (c.inv > 0 && !c.dead && c.hurtT <= 0 && Math.floor(sim.time * 22) % 2 === 0 && !sim.outcome) ctx.globalAlpha = 0.45;
    const pose = this.heroPose(c, sim), f = A.frames['hero/' + pose];
    if (!f) return;
    const flip = c.face < 0, moving = pose.startsWith('hero_walk');
    let bob = moving ? Math.abs(Math.sin(c.runDist * 2.7)) * 0.07 : pose === 'blaster_shoulder_body' ? Math.sin(sim.time * 2.6) * 0.012 : 0;
    let rot = 0, sym = 1, ay = 0.985, y = c.y;
    if (pose === 'spin_tuck_body') { rot = -c.face * (1 - c.spinT / 0.42) * Math.PI * 2; ay = 0.5; y = c.y + 0.75; }
    if (pose === 'land_squash_body') sym = 0.9 + (0.16 - c.landT) * 0.6;
    if (pose === 'jump_up_body') sym = 1.05;
    if (pose === 'ko_loaf') { y = c.y - 0.05; }
    if (pose === 'blaster_shoulder_body') sym = 1 + Math.sin(sim.time * 2.6) * 0.012;
    if (c.rush > 0) this.spr('fx/glow', c.x, c.y + 0.8, { sc: 6 + Math.sin(sim.time * 12) * 0.5, ax: 0.5, ay: 0.5, alpha: 0.5 });
    // shadow
    if (c.grounded && !c.dead) { ctx.fillStyle = 'rgba(30,20,10,.22)'; ctx.beginPath(); ctx.ellipse(this.sx(c.x), this.sy(c.y) + k * 0.02, k * 0.55, k * 0.1, 0, 0, 6.283); ctx.fill(); }
    const a0 = ctx.globalAlpha;
    this.spr('hero/' + pose, c.x, y + bob, { sc: HS, sym, flip, rot, ay, ax: 0.5, alpha: a0 });
    ctx.globalAlpha = a0;
    const hand = HAND[pose];
    if (hand && !c.dead) {
      // the blaster sits in the forward paw and points where the cat aims
      const hx = c.x + (hand[0] - 0.5) * f.uw * HS * c.face, hy = y + bob + (ay - hand[1]) * f.uh * HS * sym;
      const ang = Math.atan2(c.ay, c.ax * c.face) * (pose === 'prone_body' ? 0.25 : 1);
      const kick = c.shotFlash > 0 ? 0.08 : 0;
      const wname = { pea: 'pea_popper', rapid: 'rapid_purr', fan: 'fan_spray', beam: 'beam_whisker', fizz: 'spicy_fizz' }[c.blaster];
      const idle = pose === 'blaster_shoulder_body';
      const wr = idle ? 0.5 : ang;
      const bx = hx - c.face * (kick + (idle ? 0.18 : 0)), by = hy + (idle ? 0.1 : 0);
      this.spr('hero/' + wname, bx, by, { sc: 1.12, rot: flip ? -wr : wr, flip, alpha: a0 });
      this.spr('hero/' + (idle ? 'blaster_shoulder_near_arm' : 'jump_up_near_arm'), bx + c.face * 0.02, by - 0.02, { sc: HS * 0.9, rot: flip ? -wr * 0.6 : wr * 0.6, flip, ax: 0.7, ay: 0.5, alpha: a0 });
      ctx.globalAlpha = a0;
      this.muzzle = [bx + Math.cos(wr) * 0.95 * c.face, by + Math.sin(wr) * 0.95 + 0.12];
      if (c.shotFlash > 0.03) {
        const mz = { pea: 'muzzle_pea_1', rapid: 'muzzle_rapid_1', fan: 'muzzle_fan_1', beam: 'muzzle_beam_1', fizz: 'muzzle_fizz_1' }[c.blaster];
        this.spr('fx/muzzle_rapid_' + (Math.floor(sim.time * 30) % 2 + 1), this.muzzle[0], this.muzzle[1], { sc: 0.9, rot: flip ? Math.PI - ang : ang, ax: 0.1, ay: 0.5, alpha: 0.9 });
        void mz;
      }
    }
    if (c.shield) {
      ctx.strokeStyle = 'rgba(160,230,255,.9)'; ctx.lineWidth = Math.max(2, k * 0.06); ctx.fillStyle = 'rgba(140,220,255,.18)';
      ctx.beginPath(); ctx.arc(this.sx(c.x), this.sy(c.y + 0.85), k * (1.15 + Math.sin(sim.time * 5) * 0.03), 0, 6.283); ctx.fill(); ctx.stroke();
    }
    if (c.dead) this.spr('hero/ko_stars', c.x, c.y + 1.0 + Math.sin(sim.time * 8) * 0.05, { sc: 1.2, ax: 0.5, ay: 0.5 });
    ctx.globalAlpha = 1;
  }

  buddy(sim, b) {
    if (!b.name) return;
    const hop = Math.abs(Math.sin(b.anim * 9)) * (b.moving ? 0.12 : 0.02);
    this.spr('fx/' + b.name, b.x, b.y + hop, { sc: 1.0, ax: 0.5, ay: 1, flip: b.face < 0 });
  }

  shots(sim) {
    const ctx = this.ctx, k = this.ppu, J = this.jet;
    ctx.lineCap = 'round';
    for (const s of sim.shots) {
      const x1 = this.sx(s.x), y1 = this.sy(s.y);
      const sp = Math.hypot(s.vx, s.vy) || 1, len = Math.max(0.05, Math.min(s.age * sp, s.kind === 'beam' ? 3.0 : s.kind === 'fizz' ? 0.01 : s.kind === 'rapid' ? 1.3 : 1.05));
      const x0 = this.sx(s.x - (s.vx / sp) * len), y0 = this.sy(s.y - (s.vy / sp) * len);
      const r = s.r * k * (s.kind === 'fizz' ? 1.25 : 1.15);
      if (s.kind === 'fizz') {
        ctx.fillStyle = J.mid; ctx.strokeStyle = J.edge; ctx.lineWidth = Math.max(1.5, k * 0.04);
        ctx.beginPath(); ctx.arc(x1, y1, r * (1 + Math.sin(s.age * 30) * 0.12), 0, 6.283); ctx.fill(); ctx.stroke();
        ctx.fillStyle = J.core; ctx.beginPath(); ctx.arc(x1 - r * 0.3, y1 - r * 0.3, r * 0.35, 0, 6.283); ctx.fill();
        continue;
      }
      // a teardrop of water: round head, tail tapering back along its path
      const dx = x1 - x0, dy = y1 - y0, dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl, ang = Math.atan2(dy, dx);
      const drop = (rr, tail, fill) => {
        const tx = x1 - (dx / dl) * dl * tail, ty = y1 - (dy / dl) * dl * tail;
        ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x1 + nx * rr, y1 + ny * rr);
        ctx.arc(x1, y1, rr, ang + Math.PI / 2, ang - Math.PI / 2, true); ctx.closePath(); ctx.fill();
      };
      drop(r * 1.12, 1, J.edge); drop(r * 0.86, 0.84, J.mid);
      ctx.fillStyle = J.core; ctx.beginPath(); ctx.arc(x1 - (dx / dl) * r * 0.1, y1 - r * 0.3, r * 0.32, 0, 6.283); ctx.fill();
    }
  }

  bullets(sim) {
    const ctx = this.ctx, k = this.ppu;
    for (const b of sim.bullets) {
      const X = this.sx(b.x), Y = this.sy(b.y);
      switch (b.kind) {
        case 'pebble': this.spr('fx/bullet_enemy_pebble', b.x, b.y, { sc: 1.25, rot: b.age * 9, ax: 0.5, ay: 0.5 }); break;
        case 'bomb': {
          if (b.fuse < 0.6) { ctx.fillStyle = `rgba(230,50,30,${0.18 + 0.18 * Math.sin(sim.time * 40)})`; ctx.beginPath(); ctx.arc(X, Y, k * 1.9 * 0.72, 0, 6.283); ctx.fill(); }
          this.spr('gob/gear_bomber', b.x, b.y, { sc: 1.35 * (b.fuse < 0.6 ? 1 + Math.sin(sim.time * 40) * 0.12 : 1), rot: b.age * 5, ax: 0.42, ay: 0.6, flash: b.fuse < 0.6 && Math.sin(sim.time * 40) > 0 });
          break;
        }
        case 'ball':
          ctx.fillStyle = '#2b2b33'; ctx.beginPath(); ctx.arc(X, Y, b.r * k * 1.15, 0, 6.283); ctx.fill();
          ctx.strokeStyle = '#11111a'; ctx.lineWidth = Math.max(1.5, k * 0.04); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(X - b.r * k * 0.35, Y - b.r * k * 0.35, b.r * k * 0.28, 0, 6.283); ctx.fill();
          break;
        case 'bullet':
          ctx.lineCap = 'round'; ctx.strokeStyle = '#7a3cc8'; ctx.lineWidth = k * 0.2; ctx.beginPath(); ctx.moveTo(X - Math.sign(b.vx) * k * 0.6, Y); ctx.lineTo(X, Y); ctx.stroke();
          ctx.strokeStyle = '#f0d8ff'; ctx.lineWidth = k * 0.08; ctx.beginPath(); ctx.moveTo(X - Math.sign(b.vx) * k * 0.4, Y); ctx.lineTo(X, Y); ctx.stroke();
          break;
        case 'rock': {
          const nm = A.frames[`w${this.n}/falling_rock`] ? `w${this.n}/falling_rock` : `boss${this.n}/part_3`;
          const fr = A.frames[nm];
          if (fr) this.spr(nm, b.x, b.y, { sc: 1.3 / fr.uh, rot: b.age * 4, ax: 0.5, ay: 0.5 });
          else { ctx.fillStyle = '#8a7a6a'; ctx.beginPath(); ctx.arc(X, Y, b.r * k, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = k * 0.05; ctx.stroke(); }
          break;
        }
        case 'shock': this.spr('fx/land_dust_2', b.x, b.y - 0.1, { sc: 1.9, ax: 0.5, ay: 0.7, flip: Math.floor(sim.time * 16) % 2 === 0 }); break;
      }
    }
  }

  waves(sim) {
    const ctx = this.ctx, k = this.ppu;
    for (const w of sim.waves) {
      const X = this.sx(w.x), Y = this.sy(w.y), h = SPLASH.height * k, a = Math.max(0, 1 - w.dist / (sim.viewW * 0.9));
      const g = ctx.createLinearGradient(X - w.dir * k * 2.2, 0, X + w.dir * k * 0.6, 0);
      g.addColorStop(0, 'rgba(120,210,255,0)'); g.addColorStop(0.7, `rgba(120,210,255,${0.55 * a})`); g.addColorStop(1, `rgba(255,255,255,${0.9 * a})`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(X - w.dir * k * 2.2, Y + k * 0.2);
      ctx.quadraticCurveTo(X - w.dir * k * 0.4, Y - h * 1.15, X + w.dir * k * 0.7, Y - h * 0.55);
      ctx.quadraticCurveTo(X + w.dir * k * 0.2, Y - h * 0.2, X + w.dir * k * 0.6, Y + k * 0.2); ctx.closePath(); ctx.fill();
      this.spr('fx/splash_2', w.x, w.y, { sc: 3.4, ax: 0.5, ay: 1, alpha: a, flip: w.dir < 0 });
    }
  }
}
void CAT; void BLASTERS;
