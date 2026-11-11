// Heads-up display and on-screen touch controls, drawn on the game canvas.
import { A } from '../assets.js';
import { SPLASH, SCORE } from '../sim/tune.js';
import { t, fmt, fmtTime } from '../i18n.js';
import { DAILY_SECONDS } from '../sim/arena.js';

function icon(v, name, X, Y, h, o = {}) {
  const f = A.frames[name]; if (!f) return;
  const img = A.pages[f.page], w = h * (f.w / f.h);
  if (o.alpha != null) v.ctx.globalAlpha = o.alpha;
  v.ctx.drawImage(img, f.x, f.y, f.w, f.h, X - w / 2, Y - h / 2, w, h);
  if (o.alpha != null) v.ctx.globalAlpha = 1;
}
function pill(ctx, x, y, w, h, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill(); }

export function touchLayout(v) {
  const S = v.touchScale, W = v.W, H = v.H;
  const by = v.portrait ? Math.min(H - 12 * S, v.oy + v.vh + 250 * S) : H;
  return {
    split: W * 0.45, stickR: 50 * S,
    stick: { x: 92 * S, y: by - 96 * S, r: 50 * S },
    jump: { x: W - 72 * S, y: by - 78 * S, r: 47 * S },
    fire: { x: W - 176 * S, y: by - 58 * S, r: 40 * S },
    special: { x: W - 80 * S, y: by - 182 * S, r: 33 * S },
  };
}

export function drawHud(v, play) {
  const ctx = v.ctx, sim = play.sim, c = sim.cat, S = v.ui, x0 = v.ox, y0 = v.oy, W = v.vw;
  const story = sim.mode === 'story';
  // hurt vignette
  if (play.hurtFlash > 0) {
    const g = ctx.createRadialGradient(x0 + W / 2, y0 + v.vh / 2, v.vh * 0.35, x0 + W / 2, y0 + v.vh / 2, v.vh * 0.8);
    g.addColorStop(0, 'rgba(220,30,20,0)'); g.addColorStop(1, `rgba(220,30,20,${0.4 * play.hurtFlash})`);
    ctx.fillStyle = g; ctx.fillRect(x0, y0, W, v.vh);
  }
  if (c.hearts === 1 && !c.dead) {
    const a = 0.12 + 0.1 * Math.sin(sim.time * 6);
    const g = ctx.createRadialGradient(x0 + W / 2, y0 + v.vh / 2, v.vh * 0.45, x0 + W / 2, y0 + v.vh / 2, v.vh * 0.85);
    g.addColorStop(0, 'rgba(220,30,20,0)'); g.addColorStop(1, `rgba(220,30,20,${a})`);
    ctx.fillStyle = g; ctx.fillRect(x0, y0, W, v.vh);
  }
  // hearts
  const hs = 44 * S, hx = x0 + 22 * S + hs / 2, hy = y0 + 20 * S + hs / 2;
  for (let i = 0; i < c.maxHearts; i++) {
    const full = i < c.hearts, beat = full && c.hearts === 1 ? 1 + Math.sin(sim.time * 10) * 0.1 : 1, pop = play.heartPop > 0 && i === c.hearts ? 1 + play.heartPop : 1;
    icon(v, full ? 'fx/heart' : 'fx/heart_empty', hx + i * hs * 1.12, hy, hs * beat * pop);
  }
  // counters
  let cy = hy + hs * 0.95;
  const row = (ic, str, col) => {
    icon(v, ic, hx - 4 * S, cy, 30 * S);
    v.label(str, hx + 18 * S, cy + 1 * S, 24 * S, col || '#fff8e0', '#3a2414', 'left');
    cy += 34 * S;
  };
  row('fx/coin', String(play.coinShown | 0));
  if (sim.cageCount) row('fx/' + (play.lastKitten || 'biscuit'), `${sim.kittens.length + play.preKittens}/${sim.cageCount}`, sim.kittens.length + play.preKittens >= sim.cageCount ? '#9dff8a' : null);
  if (sim.sackCount) row('fx/seed_pouch', `${sim.sacks}/${sim.sackCount}`, sim.sacks >= sim.sackCount ? '#9dff8a' : null);

  // score and progress
  const cx = x0 + W / 2;
  v.label(fmt(play.scoreShown), cx, y0 + 30 * S, 30 * S * (1 + play.scorePop * 0.25), '#fff8e0', '#3a2414');
  if (sim.stage.arena) {
    const D = sim.director, left = sim.mode === 'daily' ? Math.max(0, DAILY_SECONDS - (D ? D.t : 0)) : (D ? D.t : 0);
    const urgent = sim.mode === 'daily' && left < 10;
    v.label(fmtTime(left + (sim.mode === 'daily' ? 0.99 : 0)), cx, y0 + 64 * S, (urgent ? 30 + Math.sin(sim.time * 10) * 3 : 24) * S, urgent ? '#ff6a5a' : '#ffe9a8', '#3a2414');
  } else {
    const bw = Math.min(300 * S, W * 0.3), bx = cx - bw / 2, byy = y0 + 56 * S, bh = 10 * S;
    pill(ctx, bx - 3 * S, byy - 3 * S, bw + 6 * S, bh + 6 * S, 'rgba(40,24,14,.6)');
    pill(ctx, bx, byy, Math.max(bh, bw * sim.progress()), bh, '#ffd24a');
    for (const cp of sim.checkpoints) {
      const p = sim.climb ? cp.v / sim.stage.goal_y : (cp.v - sim.stage.start_x) / (sim.stage.goal_x - sim.stage.start_x);
      ctx.fillStyle = cp.hit ? '#7be06a' : 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(bx + bw * p, byy + bh / 2, 4.5 * S, 0, 6.283); ctx.fill();
    }
    icon(v, 'fx/life_head', bx + bw * sim.progress(), byy + bh / 2 - 2 * S, 30 * S);
    if (sim.boss) icon(v, 'fx/icon_skull', bx + bw + 14 * S, byy + bh / 2, 24 * S); else icon(v, 'fx/star', bx + bw + 12 * S, byy + bh / 2, 22 * S);
  }

  // chain meter: the number everyone is trying to keep alive
  const ch = sim.chain;
  if (ch.n >= 2 && ch.t > 0) {
    const k = ch.t / (ch.window || SCORE.chainWindow), big = Math.min(1.7, 1 + ch.n * 0.045) * (1 + play.chainPop * 0.5);
    const X = cx, Y = y0 + 118 * S, hue = Math.max(0, 48 - ch.n * 4);
    v.label('×' + ch.n, X, Y, 54 * S * big, `hsl(${hue},100%,62%)`, '#3a1408');
    const bw = 130 * S * big; pill(ctx, X - bw / 2, Y + 36 * S * big, bw, 8 * S, 'rgba(40,24,14,.6)');
    pill(ctx, X - bw / 2, Y + 36 * S * big, Math.max(8 * S, bw * k), 8 * S, `hsl(${hue},100%,62%)`);
  }
  if (play.callout && play.callout.t > 0) {
    const co = play.callout, a = Math.min(1, co.t / 0.3), pop = 1 + Math.max(0, co.t - (co.max - 0.15)) * 3;
    ctx.globalAlpha = a;
    v.label(co.str, cx, y0 + 196 * S, 40 * S * pop * (co.big || 1), co.c || '#fff', '#3a1408', 'center', -0.04);
    ctx.globalAlpha = 1;
  }
  // toasts (kitten safe, checkpoint, pickups)
  let ty = y0 + v.vh * 0.3;
  for (const to of play.toasts) {
    ctx.globalAlpha = Math.min(1, to.t / 0.3, (to.max - to.t) / 0.15 + 0.2);
    v.label(to.str, cx, ty, 30 * S, to.c || '#fff8e0', '#3a2414');
    ty += 38 * S;
  }
  ctx.globalAlpha = 1;
  // coach hint
  if (play.coach) {
    const str = play.coach, px = 26 * S;
    ctx.font = `800 ${Math.round(px)}px "Baloo 2", system-ui, sans-serif`;
    const tw = ctx.measureText(str).width + 44 * S, X = cx - tw / 2, Y = y0 + v.vh * 0.9;
    pill(ctx, X, Y - 24 * S, tw, 48 * S, 'rgba(40,24,14,.82)');
    v.label(str, cx, Y + 1 * S, px, '#ffd24a', null);
  }
  // boss bar
  const b = sim.boss;
  if (b && (b.state === 'fight' || b.state === 'intro')) {
    const bw = Math.min(460 * S, W * 0.5), bx = cx - bw / 2, byy = y0 + v.vh - 46 * S, bh = 18 * S;
    pill(ctx, bx - 4 * S, byy - 4 * S, bw + 8 * S, bh + 8 * S, 'rgba(40,24,14,.8)');
    pill(ctx, bx, byy, Math.max(bh, bw * (b.hp / b.maxHp)), bh, b.flash > 0 ? '#fff' : '#ff5a4a');
    ctx.fillStyle = 'rgba(40,24,14,.8)'; ctx.fillRect(bx + bw / 3, byy, 2 * S, bh); ctx.fillRect(bx + (bw * 2) / 3, byy, 2 * S, bh);
    v.label(t('boss_' + b.type), cx, byy - 20 * S, 22 * S, '#fff8e0', '#3a2414');
  }
  if (play.banner && play.banner.t > 0) {
    const bn = play.banner, a = Math.min(1, bn.t / 0.4, (bn.max - bn.t) / 0.25);
    ctx.globalAlpha = a; ctx.fillStyle = 'rgba(30,16,10,.72)'; ctx.fillRect(x0, y0 + v.vh * 0.36, W, v.vh * 0.24);
    v.label(bn.str, cx, y0 + v.vh * 0.45, 56 * S, bn.c || '#ffd24a', '#3a1408');
    if (bn.sub) v.label(bn.sub, cx, y0 + v.vh * 0.54, 24 * S, '#fff8e0', '#3a2414');
    ctx.globalAlpha = 1;
  }

  // controls
  const touch = play.input.device === 'touch';
  const ready = sim.splash >= SPLASH.need, sk = sim.splash / SPLASH.need;
  const L = touchLayout(v);
  play.input.layout = L;
  if (touch) {
    const tc = play.input.touch, op = play.controlsAlpha;
    const sxp = tc.stick != null ? tc.sx : L.stick.x, syp = tc.stick != null ? tc.sy : L.stick.y;
    icon(v, 'fx/stick_base', sxp, syp, L.stick.r * 2.5, { alpha: op * 0.8 });
    icon(v, 'fx/stick_thumb', sxp + tc.dx * L.stick.r, syp + tc.dy * L.stick.r, L.stick.r * 1.4, { alpha: op });
    icon(v, 'fx/jump', L.jump.x, L.jump.y, L.jump.r * 2 * (tc.jump ? 0.92 : 1), { alpha: op });
    icon(v, 'fx/fire', L.fire.x, L.fire.y, L.fire.r * 2 * (tc.fire ? 0.92 : 1), { alpha: op * (sim.opts.autoFire ? 0.75 : 1) });
    drawSplashButton(v, L.special.x, L.special.y, L.special.r, sk, ready, sim.time, op);
  } else {
    const X = x0 + 62 * S, Y = y0 + v.vh - 62 * S;
    drawSplashButton(v, X, Y, 36 * S, sk, ready, sim.time, 1);
    if (ready) v.label(play.input.device === 'pad' ? 'Y' : 'L', X, Y + 50 * S, 20 * S, '#ffd24a', '#3a2414');
  }
  // blaster in hand
  const wn = { pea: 'pea_popper', rapid: 'rapid_purr', fan: 'fan_spray', beam: 'beam_whisker', fizz: 'spicy_fizz' }[c.blaster];
  if (c.blaster !== 'pea') icon(v, 'fx/' + wn, hx + (c.maxHearts * hs * 1.12) + 16 * S, hy, 40 * S);
  if (c.rush > 0) { icon(v, 'fx/catnip', hx + (c.maxHearts * hs * 1.12) + 62 * S, hy, 36 * S); }
  if (v.portrait && play.rotateHint > 0) v.label(t('rotate'), v.W / 2, v.oy + v.vh + 22 * v.touchScale, 15 * v.touchScale, 'rgba(255,240,210,.8)', null);
}

function drawSplashButton(v, X, Y, r, k, ready, time, op) {
  const ctx = v.ctx;
  ctx.globalAlpha = op;
  ctx.fillStyle = 'rgba(30,20,14,.55)'; ctx.beginPath(); ctx.arc(X, Y, r * 1.12, 0, 6.283); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(X, Y, r, 0, 6.283); ctx.clip();
  ctx.fillStyle = '#1f4e7a'; ctx.fillRect(X - r, Y - r, r * 2, r * 2);
  const lvl = Y + r - 2 * r * k;
  ctx.fillStyle = ready ? '#7fe3ff' : '#3fa9e6';
  ctx.beginPath(); ctx.moveTo(X - r, Y + r);
  for (let i = 0; i <= 12; i++) ctx.lineTo(X - r + (i / 12) * 2 * r, lvl + Math.sin(i * 1.3 + time * 5) * r * 0.06);
  ctx.lineTo(X + r, Y + r); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = ready ? `hsl(48,100%,${60 + 20 * Math.sin(time * 10)}%)` : '#fff8e0'; ctx.lineWidth = r * 0.14;
  ctx.beginPath(); ctx.arc(X, Y, r * (ready ? 1.04 + Math.sin(time * 10) * 0.04 : 1), 0, 6.283); ctx.stroke();
  const f = A.frames['fx/splash_2'];
  if (f) { const h = r * 1.1, w = h * (f.w / f.h); ctx.globalAlpha = op * (ready ? 1 : 0.55); ctx.drawImage(A.pages[f.page], f.x, f.y, f.w, f.h, X - w / 2, Y - h / 2, w, h); }
  ctx.globalAlpha = 1;
}
