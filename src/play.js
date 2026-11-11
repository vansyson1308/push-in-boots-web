// One play session: runs the simulation at a fixed step and turns its events into juice.
import { Sim, DT } from './sim/sim.js';
import { SPLASH, VIEW_H } from './sim/tune.js';
import { floorBelow } from './sim/world.js';
import { Fx } from './render/fx.js';
import { drawHud } from './render/hud.js';
import { JETS } from './render/view.js';
import { play as sfx, chainNote, music, musicRate, duck } from './audio.js';
import { vibrate } from './input.js';
import { t, fmt, KITTEN_NAMES } from './i18n.js';

const CALL = [20, 15, 12, 10, 8, 6, 5, 4, 3, 2];
const POOF = ['fx/poof_1', 'fx/poof_2', 'fx/poof_3', 'fx/poof_4', 'fx/poof_5'];
const BOOM = ['fx/boom_l_1', 'fx/boom_l_2', 'fx/boom_l_3', 'fx/boom_l_4', 'fx/boom_l_5'];
const BOOMS = ['fx/boom_s_1', 'fx/boom_s_2', 'fx/boom_s_3', 'fx/boom_s_4', 'fx/boom_s_5'];
const SPL = ['fx/splash_1', 'fx/splash_2', 'fx/splash_3', 'fx/splash_4'];

export class Play {
  // cfg: { stage, mode, seed, opts, prefs, onEnd, seen (Set of coach ids already shown), buddy, jet, preKittens }
  constructor(view, input, cfg) {
    this.view = view; this.input = input; this.cfg = cfg;
    this.prefs = cfg.prefs;
    this.fx = new Fx(); this.fx.reduced = !cfg.prefs.effects;
    this.sim = new Sim(cfg.stage, { ...cfg.opts, mode: cfg.mode, seed: cfg.seed, viewW: view.viewW, autoFire: cfg.prefs.autoFire });
    view.jet = JETS[cfg.jet] || JETS.blue;
    this.acc = 0; this.paused = false; this.ended = false; this.trauma = 0; this.shake = [0, 0];
    this.hurtFlash = 0; this.heartPop = 0; this.scoreShown = 0; this.scorePop = 0; this.coinShown = 0; this.chainPop = 0;
    this.toasts = []; this.callout = null; this.banner = null; this.coach = null; this.coachT = 0;
    this.controlsAlpha = 0.9; this.rotateHint = 6; this.coinStreak = 0; this.coinT = 0;
    this.preKittens = (cfg.opts.opened || []).length; this.lastKitten = null;
    this.buddy = cfg.buddy ? { name: cfg.buddy, x: this.sim.cat.x - 1, y: this.sim.cat.y, vy: 0, face: 1, anim: 0, moving: false } : null;
    this.seen = cfg.seen || new Set();
    this.jumped = false; this.fired = false;
    this.moment = null;                    // the best chain of the run, for the share card
    music(cfg.stage.kind === 'boss' ? 'music_stage' : 'music_stage');
    if (cfg.mode !== 'story') this.setBanner(t('go'), cfg.mode === 'daily' ? t('daily') : t('endless'), 1.4);
    else this.toast(`${cfg.stage.id} · ${t('world' + cfg.stage.world)}`, '#fff8e0', 2.2);
    // recolour the goblin types this stage uses now, not in the middle of a fight
    const types = new Set(['runner']);
    for (const e of cfg.stage.enemies || []) types.add(e.type);
    for (const l of cfg.stage.locks || []) for (const w of l.waves) for (const e of w) types.add(e.type);
    if (cfg.stage.boss) ['runner', 'shield', 'bomber'].forEach((x) => types.add(x));
    if (cfg.stage.arena) ['sprinter', 'shield', 'slinger', 'bomber', 'armored', 'sniper'].forEach((x) => types.add(x));
    for (const ty of types) if (ty !== 'turret' && ty !== 'balloon') view.tintPage(ty);
  }

  toast(str, c, time = 1.6) { this.toasts.push({ str, c, t: time, max: time }); if (this.toasts.length > 3) this.toasts.shift(); }
  setCallout(str, c, big = 1, time = 1.1) { this.callout = { str, c, big, t: time, max: time }; }
  setBanner(str, sub, time = 2, c) { this.banner = { str, sub, t: time, max: time, c }; }
  kick(a) { if (this.prefs.effects) this.trauma = Math.min(1, this.trauma + a); }

  update(real) {
    if (this.paused || this.ended) return;
    const sim = this.sim, inp = this.input.read();
    if (inp.pause) { this.cfg.onPause && this.cfg.onPause(); return; }
    sim.opts.viewW = this.view.viewW;
    sim.opts.autoFire = this.prefs.autoFire && this.input.device === 'touch';
    if (inp.special && sim.bigSplash()) { /* event handled below */ }
    let scale = 1;
    if (sim.slowT > 0) { sim.slowT -= real; scale = 0.32; }
    musicRate(sim.slowT > 0 ? 0.8 : sim.cat.rush > 0 ? 1.12 : 1);
    this.acc += Math.min(real, 0.1) * scale;
    let n = 0;
    while (this.acc >= DT && n < 6) {
      sim.step(inp); this.acc -= DT; n++;
      if (sim.events.length) { for (const e of sim.events) this.on(e); sim.events.length = 0; }
      this.ambient(DT);
    }
    const dt = real * (scale < 1 ? 0.5 : 1);
    this.fx.step(dt);
    this.trauma = Math.max(0, this.trauma - real * 1.9);
    const tr = this.trauma * this.trauma;
    this.shake[0] = (Math.random() - 0.5) * tr * 0.55; this.shake[1] = (Math.random() - 0.5) * tr * 0.55;
    this.hurtFlash = Math.max(0, this.hurtFlash - real * 2); this.heartPop = Math.max(0, this.heartPop - real * 3);
    this.scorePop = Math.max(0, this.scorePop - real * 4); this.chainPop = Math.max(0, this.chainPop - real * 5);
    this.scoreShown += (sim.score - this.scoreShown) * Math.min(1, real * 10); if (sim.score - this.scoreShown < 1) this.scoreShown = sim.score;
    this.coinShown = sim.coins;
    for (const to of this.toasts) to.t -= real;
    this.toasts = this.toasts.filter((to) => to.t > 0);
    if (this.callout) this.callout.t -= real;
    if (this.banner) this.banner.t -= real;
    this.rotateHint -= real; this.coinT -= real; this.view.smug = Math.max(0, this.view.smug - real);
    this.view.zoom += ((sim.slowT > 0 ? 1.06 : 1) - this.view.zoom) * Math.min(1, real * 8);
    this.stepCoach(real, inp);
    this.stepBuddy(real);
    if (sim.outcome && !this.ended) {
      const wait = sim.outcome === 'win' ? (sim.stage.arena ? 1.6 : 2.4) : 1.9;
      if (sim.outcomeT > wait) { this.ended = true; this.cfg.onEnd(this.result()); }
    }
  }

  result() {
    const sim = this.sim, st = sim.stage, win = sim.outcome === 'win';
    const time = sim.time;
    const timeBonus = win && sim.mode === 'story' ? Math.max(0, Math.round((st.par_seconds - time) * 20)) : 0;
    const noKo = win && sim.mode === 'story' && sim.kos === 0 ? 1500 : 0;
    return {
      outcome: sim.outcome, mode: sim.mode, stageId: st.id, score: sim.score + timeBonus + noKo, base: sim.score, timeBonus, noKo,
      coins: sim.coins, time, chain: sim.chain.best, pushed: sim.pushed, kos: sim.kos, kittens: sim.kittens.slice(), cages: sim.cageCount,
      sacks: sim.sacks, sackCount: sim.sackCount, causes: { ...sim.causes }, moment: this.moment,
    };
  }

  draw() {
    const v = this.view, sim = this.sim;
    v.begin(sim, this.shake);
    v.drawWorld(sim, this.fx, { buddy: this.buddy });
    v.end();
    drawHud(v, this);
  }

  // small continuous effects that are not tied to a single event
  ambient(dt) {
    const sim = this.sim, c = sim.cat, fx = this.fx, J = this.view.jet;
    if (c.hovering) fx.drops(c.x + c.ax * 0.5, c.y + 0.2, 2, { a: -Math.PI / 2, spread: 0.7, v: 9, c: J.mid, life: 0.35 });
    for (const s of sim.shots) if (Math.random() < 0.25) fx.drops(s.x, s.y, 1, { a: Math.atan2(-s.vy, -s.vx), spread: 1.2, v: 2, c: J.mid, life: 0.3, r: 0.05 });
    for (const w of sim.waves) fx.drops(w.x, w.y + Math.random() * SPLASH.height, 3, { a: Math.PI / 2, spread: 1.5, v: 7, c: '#c8f0ff', life: 0.5, r: 0.09 });
    if (c.rush > 0 && Math.random() < 0.3) fx.sprite('fx/fx_spark', c.x + (Math.random() - 0.5) * 0.9, c.y + Math.random() * 1.5, { life: 0.4, sc: 1.5, vy: 1.5 });
    for (const e of sim.enemies) if (e.wet > 0.2 && e.state !== 'tumble' && Math.random() < 0.08) fx.drops(e.x + (Math.random() - 0.5) * 0.5, e.y + 1, 1, { a: -Math.PI / 2, spread: 0.3, v: 1, c: J.mid, life: 0.4, r: 0.05 });
    for (const e of sim.enemies) if (e.state === 'tumble' && Math.random() < 0.5) fx.drops(e.x, e.y + 0.4, 1, { spread: 6.28, v: 2.5, c: J.mid, life: 0.35 });
  }

  on(e) {
    const fx = this.fx, sim = this.sim, J = this.view.jet, c = sim.cat;
    switch (e.t) {
      case 'shot':
        sfx('shot_' + e.kind, { vol: 0.5, vary: 0.12, gap: 0.05 });
        fx.drops(e.x, e.y, 2, { a: e.a, spread: 0.8, v: 5, c: J.core, life: 0.2 });
        if (!this.fired) this.fired = true;
        break;
      case 'hit':
        fx.sprite('', e.x, e.y, { frames: [1, 2, 3].map((i) => `fx/hit_${J.hit}_${i}`), life: 0.2, sc: e.heavy ? 1.5 : 1.15, rot: Math.random() * 6 });
        fx.drops(e.x, e.y, 4, { spread: 6.28, v: 4, c: J.mid });
        sfx(e.juggle ? 'enemy_hit' : 'enemy_hit', { vol: 0.55, vary: 0.25, gap: 0.045, rate: e.juggle ? 1.4 : 1 });
        break;
      case 'tink': case 'block':
        fx.sprite('fx/fx_spark', e.x, e.y, { life: 0.18, sc: 2.2, grow: 0.6 });
        sfx('tink', { vol: e.t === 'block' ? 0.55 : 0.4, vary: 0.2, gap: 0.06 });
        if (e.t === 'block' && !this.seen.has('shield')) { this.seen.add('shield'); this.showCoach('coach_shield', 3.5); }
        break;
      case 'ko': {
        this.kick(0.18 + Math.min(0.3, e.n * 0.03));
        chainNote(e.n);
        sfx('enemy_poof', { vol: 0.7, vary: 0.2, gap: 0.03 });
        fx.drops(e.x, e.y, 14, { spread: 6.28, v: 7, c: J.mid, life: 0.6, r: 0.09 });
        fx.ring(e.x, e.y, { c: J.core, grow: 3.2 });
        const label = e.cause !== 'washed' ? t('c_' + e.cause) + '  ' : '';
        fx.text(label + '+' + fmt(e.pts), e.x, e.y + 0.7, { size: 0.36 + Math.min(0.3, e.n * 0.02), c: e.cause === 'washed' ? '#fff8e0' : '#ffd24a' });
        this.scorePop = 1; this.chainPop = 1;
        if (e.n >= 2) for (const n of CALL) if (e.n === n) { this.setCallout(t('chain_' + n), `hsl(${Math.max(0, 48 - n * 4)},100%,64%)`, 1 + Math.min(0.5, n * 0.03)); break; }
        if (e.n >= 3) sim.freeze = Math.max(sim.freeze, 0.035);
        if (e.n >= 5) vibrate(18);
        if (!this.moment || e.n > this.moment.n) this.moment = { n: e.n, time: sim.time };
        break;
      }
      case 'bonus':
        fx.text(t('c_' + e.cause) + '  +' + fmt(e.pts), e.x, e.y + 1.0, { size: 0.5, c: '#ffd24a', pop: 1.6, life: 1.1 });
        this.kick(0.3); sfx('pickup', { vol: 0.8, rate: 1.3 });
        this.scorePop = 1;
        break;
      case 'score': if (e.pts >= 100) fx.text('+' + fmt(e.pts), e.x, e.y, { size: e.tag === 'boss' ? 0.9 : 0.4, c: '#fff8e0' }); this.scorePop = 0.6; break;
      case 'poof':
        fx.sprite('', e.x, e.y, { frames: POOF, life: 0.4, sc: 0.75 });
        if (e.flee && fx.p.length < 500) fx.sprite('gob/white_flag', e.x, e.y + 0.35, { life: 0.9, sc: 1.05, vx: (e.dir || 1) * 5, vy: 5, g: 22, tint: e.type, flip: (e.dir || 1) > 0, fade: 0.4 });
        break;
      case 'plop':
        fx.sprite('', e.x, -1.35, { frames: SPL, life: 0.5, sc: 1.5, back: false });
        fx.drops(e.x, -1.4, 18, { a: Math.PI / 2, spread: 1.4, v: 10, c: '#a8e4ff', life: 0.8, r: 0.1 });
        sfx('water', { vol: 0.9, vary: 0.15, gap: 0.05 });
        this.kick(0.25);
        break;
      case 'fell':
        if (!sim.climb) { fx.sprite('', e.x, -1.35, { frames: SPL, life: 0.5, sc: 1.6 }); sfx('water', { vol: 0.9 }); }
        this.hurtFlash = 1; this.heartPop = 1; sfx('cat_hurt', { vol: 0.9 }); vibrate(60);
        break;
      case 'slam':
        fx.sprite('fx/fx_burst', e.x, e.y, { life: 0.25, sc: 1.3, grow: 0.5 }); fx.sprite('fx/fx_ko_stars', e.x, e.y + 0.6, { life: 0.6, sc: 1.2, vy: 1 });
        sfx('land', { vol: 1, rate: 0.7 }); this.kick(0.35);
        break;
      case 'bowl':
        fx.sprite('fx/fx_ko_stars', e.x, e.y + 0.5, { life: 0.5, sc: 1.1, vy: 1.5 }); fx.sprite('fx/fx_burst', e.x, e.y, { life: 0.2, sc: 1, grow: 0.5 });
        sfx('enemy_hit', { vol: 0.9, rate: 0.7, gap: 0.03 }); this.kick(0.2);
        break;
      case 'explode':
        fx.sprite('', e.x, e.y, { frames: BOOM, life: 0.45, sc: e.r * 2.6 }); fx.ring(e.x, e.y, { c: '#fff2c0', grow: e.r * 2.2, w: 0.2 });
        fx.sprite('fx/fx_debris', e.x, e.y + 0.3, { life: 0.6, sc: 2.2, vy: 5, g: 18, vr: 6 });
        sfx('explosion', { vol: 0.9, vary: 0.15, gap: 0.05 }); this.kick(0.55); vibrate(30);
        break;
      case 'geyser':
        fx.sprite('', e.x, e.y - 0.2, { frames: SPL, life: 0.45, sc: e.r * 1.2 });
        fx.drops(e.x, e.y, 22, { a: Math.PI / 2, spread: 1.2, v: 11, c: J.mid, life: 0.7, r: 0.1 });
        sfx('water', { vol: 0.7, vary: 0.2, gap: 0.05 }); this.kick(0.15);
        break;
      case 'hurt':
        this.hurtFlash = 1; this.heartPop = 1; this.kick(0.6); sfx('cat_hurt', { vol: 1 }); vibrate(60);
        fx.sprite('fx/fx_heart_crack', e.x, e.y + 0.9, { life: 0.7, sc: 1.7, vy: 2 });
        fx.sprite('hero/hat_flying', e.x, e.y + 1.2, { life: 0.9, sc: 1.36, vx: (Math.random() - 0.5) * 3, vy: 8, g: 20, vr: 9, fade: 0.25 });
        break;
      case 'catKo': sfx('life_lost', { vol: 0.9 }); duck(0.4); setTimeout(() => duck(1), 1200); break;
      case 'respawn':
        fx.sprite('fx/heal_burst', e.x, e.y + 0.8, { life: 0.5, sc: 1.2, grow: 0.4 }); fx.ring(e.x, e.y + 0.8, { c: '#b8ffb0', grow: 3 });
        if (e.full) sfx('power_up', { vol: 0.6 });
        break;
      case 'shieldPop': fx.ring(e.x, e.y, { c: '#a8e4ff', grow: 4, w: 0.2 }); fx.drops(e.x, e.y, 16, { spread: 6.28, v: 6, c: '#c8f0ff' }); sfx('tink', { rate: 0.6 }); break;
      case 'jump': fx.sprite('', e.x, e.y + 0.15, { frames: ['fx/jump_dust_1', 'fx/jump_dust_2', 'fx/jump_dust_3'], life: 0.25, sc: 0.9 }); sfx('jump', { vol: 0.5, vary: 0.1 }); this.jumped = true; break;
      case 'djump': fx.ring(e.x, e.y + 0.5, { c: '#ffffff', grow: 2.2 }); sfx('spin_jump', { vol: 0.6 }); break;
      case 'land': fx.sprite('', e.x, e.y + 0.18, { frames: ['fx/land_dust_1', 'fx/land_dust_2', 'fx/land_dust_3'], life: 0.3, sc: 1 }); sfx('land', { vol: Math.min(0.7, e.v / 22) }); break;
      case 'pickup': this.onPickup(e); break;
      case 'kitten': {
        this.lastKitten = e.name;
        for (let i = 1; i <= 5; i++) fx.sprite('fx/cage_piece_' + i, e.x, e.y + 0.7, { life: 0.9, sc: 1, vx: (Math.random() - 0.5) * 9, vy: 4 + Math.random() * 5, g: 24, vr: (Math.random() - 0.5) * 14 });
        fx.sprite('fx/rescue_hearts', e.x, e.y + 1.6, { life: 1.1, sc: 1.3, vy: 1.2 });
        fx.sprite('fx/' + e.name, e.x, e.y + 0.55, { life: 1.3, sc: 1.25, vx: (c.x > e.x ? 1 : -1) * 2.2, vy: 7, g: 20, flip: c.x < e.x, fade: 0.2 });
        sfx('gate_break', { vol: 0.6, rate: 1.3 }); sfx('meow', { vol: 1 }); sfx('harvest', { vol: 0.6 });
        this.toast(t('safe', KITTEN_NAMES[e.name]), '#ffc6e0', 2);
        this.kick(0.25);
        break;
      }
      case 'barrel':
        fx.sprite('fx/fx_debris', e.x, e.y + 0.5, { life: 0.5, sc: 2.2, vy: 4, g: 16, vr: 5 }); fx.sprite('', e.x, e.y + 0.5, { frames: POOF, life: 0.3, sc: 0.6 });
        sfx('gate_break', { vol: 0.5, rate: 1.5 });
        break;
      case 'checkpoint':
        sfx('checkpoint', { vol: 0.8 }); this.toast(t('checkpoint'), '#b8ffb0');
        fx.sprite('fx/fx_confetti', e.x, e.y + 1.6, { life: 0.9, sc: 2.6, vy: 2.5, grow: 0.5 });
        break;
      case 'lockStart': sfx('ambush', { vol: 0.9 }); this.setCallout(t('ambush'), '#ff8a6a', 1.2, 1.4); this.kick(0.3); break;
      case 'lockClear': sfx('checkpoint', { vol: 0.8, rate: 1.2 }); this.setCallout(t('clear_go'), '#b8ffb0', 1.2, 1.5); break;
      case 'wave': if (e.of) this.toast(t('wave', e.n, e.of), '#ffe9a8', 1.2); break;
      case 'tell': sfx('tell', { vol: 0.5, gap: 0.15, rate: e.kind === 'boss' ? 0.7 : 1 }); if (e.kind === 'bomber' && !this.seen.has('bomb')) { this.seen.add('bomb'); this.showCoach('coach_bomb', 3.5); } break;
      case 'enemyShot': sfx(e.kind === 'turret' || e.kind === 'cannon' ? 'cannon' : 'throw', { vol: 0.6, vary: 0.15, gap: 0.05 }); if (e.kind === 'cannon' || e.kind === 'turret') fx.sprite('', e.x, e.y, { frames: BOOMS, life: 0.25, sc: 1.3 }); break;
      case 'splashReady':
        sfx('power_up', { vol: 0.8 }); this.toast(t('splash_ready'), '#8fe6ff', 1.8);
        if (!this.seen.has('special')) { this.seen.add('special'); this.showCoach(this.input.device === 'touch' ? 'coach_special_t' : 'coach_special_k', 4.5); }
        break;
      case 'bigSplash':
        sfx('water', { vol: 1, rate: 0.6 }); sfx('explosion', { vol: 0.5, rate: 0.6 }); this.kick(0.7); vibrate(50);
        this.setCallout(t('big_splash'), '#8fe6ff', 1.5, 1.2);
        fx.ring(e.x, e.y + 0.8, { c: '#c8f0ff', grow: 9, w: 0.3, life: 0.5 });
        break;
      case 'bossIntro':
        music('music_boss'); sfx('boss_intro', { vol: 0.9 }); this.setBanner(t('boss_' + e.type), t('boss_hint'), 2.6, '#ff8a6a'); this.kick(0.4);
        break;
      case 'bossHurt': sfx('boss_hit', { vol: 0.6, vary: 0.2, gap: 0.06 }); break;
      case 'weakHit': fx.sprite('fx/fx_spark', e.x + (Math.random() - 0.5) * 0.5, e.y + (Math.random() - 0.5) * 0.5, { life: 0.2, sc: 2.6, grow: 0.5 }); break;
      case 'bossPhase':
        fx.sprite('', e.x, e.y, { frames: BOOM, life: 0.5, sc: 6 }); sfx('explosion', { vol: 1, rate: 0.8 }); this.kick(0.8);
        for (let i = 1; i <= 4; i++) fx.sprite(`boss${sim.stage.world}/debris_${i}`, e.x, e.y, { life: 1.2, sc: 2, vx: (Math.random() - 0.7) * 9, vy: 5 + Math.random() * 5, g: 22, vr: (Math.random() - 0.5) * 10 });
        break;
      case 'bossDown':
        sfx('boss_down', { vol: 1 }); music(''); this.kick(1); vibrate(120);
        this.setBanner(t('boss_down'), '', 2.6, '#b8ffb0');
        for (let i = 0; i < 6; i++) fx.sprite('', e.x + (Math.random() - 0.5) * 4, e.y + (Math.random() - 0.5) * 3, { frames: BOOM, life: 0.5 + i * 0.1, sc: 4 + Math.random() * 3 });
        for (let i = 1; i <= 6; i++) fx.sprite(`boss${sim.stage.world}/debris_${i}`, e.x, e.y, { life: 1.6, sc: 2, vx: (Math.random() - 0.5) * 12, vy: 6 + Math.random() * 6, g: 22, vr: (Math.random() - 0.5) * 10 });
        break;
      case 'bossSmoke': fx.sprite('', e.x, e.y, { frames: BOOMS, life: 0.4, sc: 2.6 }); if (Math.random() < 0.3) sfx('explosion', { vol: 0.4, vary: 0.3, gap: 0.2 }); break;
      case 'win':
        sfx('victory', { vol: 0.9 }); if (!sim.boss) music('');
        for (let i = 0; i < 5; i++) fx.sprite('fx/fx_confetti', c.x + (Math.random() - 0.5) * 6, c.y + 2 + Math.random() * 3, { life: 1.4, sc: 2.8, vy: 1, grow: 0.6 });
        if (sim.stage.arena) this.setBanner(t('time_up'), '', 1.6, '#ffd24a'); else if (!sim.boss) this.setCallout(t('stage_clear'), '#ffd24a', 1.5, 2.2);
        break;
      case 'lose': sfx('fail', { vol: 0.9 }); music(''); break;
      case 'helmetOff': fx.sprite('fx/helmet_open', e.x, e.y, { life: 1, sc: 0.62, vx: e.dir * 4, vy: 8, g: 24, vr: 9 }); sfx('tink', { rate: 0.7 }); break;
      case 'shieldBreak': fx.sprite('gob/gear_shield', e.x, e.y, { life: 1, sc: 1.5, vx: e.dir * 5, vy: 7, g: 24, vr: 11 }); sfx('gate_break', { vol: 0.6, rate: 1.6 }); break;
      case 'pop': fx.sprite('fx/fx_burst', e.x, e.y, { life: 0.25, sc: 1.8, grow: 0.6 }); sfx('enemy_poof', { rate: 1.5 }); break;
      case 'turretDown': fx.sprite('fx/fx_debris', e.x, e.y + 0.5, { life: 0.6, sc: 2.6, vy: 5, g: 18, vr: 6 }); break;
      case 'hayBreak': fx.sprite('', e.x, e.y, { frames: POOF, life: 0.35, sc: 0.9 }); for (let i = 0; i < 3; i++) fx.sprite('fx/fx_dust', e.x, e.y, { life: 0.6, sc: 2.2, vx: (Math.random() - 0.5) * 6, vy: 3 + Math.random() * 3, g: 14 }); sfx('land', { vol: 0.8, rate: 0.8 }); break;
      case 'thud': fx.sprite('fx/fx_dust', e.x, e.y + 0.15, { life: 0.3, sc: 1.8 }); if (e.kind === 'rock') { sfx('land', { vol: 0.9, rate: 0.6 }); this.kick(0.3); fx.sprite('fx/fx_debris', e.x, e.y + 0.3, { life: 0.5, sc: 2.2, vy: 4, g: 18 }); } break;
      case 'stampede': sfx('ambush', { vol: 0.7, rate: 1.2 }); if (!this.seen.has('hay')) { this.seen.add('hay'); this.showCoach('coach_hay', 3.5); } break;
      case 'gateBreak':
        for (let i = 0; i < 6; i++) fx.sprite('fx/rubble', e.x, e.y + Math.random() * e.h, { life: 0.9, sc: 0.8, vx: (Math.random() - 0.3) * 8, vy: 3 + Math.random() * 5, g: 22, vr: (Math.random() - 0.5) * 9 });
        fx.sprite('', e.x, e.y + e.h / 2, { frames: BOOM, life: 0.45, sc: 5 }); sfx('gate_break', { vol: 1 }); this.kick(0.6);
        break;
      case 'crumble': sfx('tink', { vol: 0.5, rate: 0.6 }); break;
      case 'skid': fx.sprite('', e.x, e.y + 0.15, { frames: ['fx/skid_1', 'fx/skid_2'], life: 0.3, sc: 1 }); break;
      case 'drop': fx.sprite('fx/fx_coin_sparkle', e.x, e.y + 1, { life: 0.6, sc: 3.5, grow: 0.5 }); sfx('pickup', { vol: 0.5, rate: 0.8 }); break;
      case 'helper': this.toast(t('helper'), '#ffe9a8', 2.2); sfx('plant', { vol: 0.8 }); fx.sprite('', e.x, e.y, { frames: POOF, life: 0.4, sc: 1.2 }); break;
      case 'slamGround': this.kick(0.5); sfx('land', { vol: 1, rate: 0.5 }); fx.sprite('fx/fx_dust', e.x, e.y + 0.2, { life: 0.4, sc: 4 }); break;
      case 'penalty': fx.text('-' + fmt(e.pts), e.x, e.y, { size: 0.5, c: '#ff8a7a' }); break;
      case 'chainEnd': if (e.n >= 5) this.view.smug = 1.6; break;
      default: break;
    }
  }

  onPickup(e) {
    const fx = this.fx;
    if (e.content === 'coin') {
      this.coinStreak = this.coinT > 0 ? Math.min(12, this.coinStreak + 1) : 0; this.coinT = 0.5;
      sfx('coin', { vol: 0.45, rate: 1 + this.coinStreak * 0.05, gap: 0.02 });
      fx.sprite('fx/fx_coin_sparkle', e.x, e.y, { life: 0.3, sc: 2, grow: 0.6 });
      return;
    }
    fx.sprite('fx/star_burst', e.x, e.y, { life: 0.4, sc: 0.9, grow: 0.5 });
    const key = { seed: 'got_sack', heart: 'got_heart', catnip: 'got_catnip', bubble: 'got_bubble', yarn: 'got_yarn' }[e.content] || 'got_' + e.content;
    this.toast(t(key), e.content === 'seed' ? '#ffe9a8' : '#fff8e0', 1.5);
    sfx(e.content === 'seed' ? 'seed' : e.content === 'heart' ? 'pickup' : 'power_up', { vol: 0.8 });
  }

  showCoach(key, time = 3) { this.coach = t(key); this.coachT = time; }
  stepCoach(real) {
    const sim = this.sim, c = sim.cat, id = sim.stage.id, touch = this.input.device === 'touch', sfxk = touch ? '_t' : '_k';
    if (this.coachT > 0) { this.coachT -= real; if (this.coachT <= 0) this.coach = null; return; }
    this.coach = null;
    if (sim.outcome) return;
    if (sim.mode !== 'story') {                        // someone's very first run may be a friend's challenge
      if (this.seen.has('arena') && !this.arenaCoach) return;
      this.arenaCoach = true; this.seen.add('arena');
      if (sim.time < 4.5) this.coach = t('coach_move' + sfxk);
      else if (sim.time < 9 && !this.fired) this.coach = t('coach_fire' + sfxk);
      else if (sim.time < 13 && !this.jumped) this.coach = t('coach_jump' + sfxk);
      else if (sim.time < 18 && sim.time > 13) this.coach = t('coach_push_arena');
      return;
    }
    if (id === '1-1') {
      const taunter = sim.enemies.find((e) => e.taunt && e.state !== 'gone' && e.state !== 'tumble');
      if (c.x < 5 && sim.time < 12) this.coach = t('coach_move' + sfxk);
      else if (c.x < 12 && !this.fired) this.coach = t('coach_fire' + sfxk);
      else if (taunter && c.x > 9 && c.x < 20) this.coach = t('coach_push');
      else if (c.x > 17 && c.x < 21.5 && !this.jumped) this.coach = t('coach_jump' + sfxk);
      else if (c.x > 67 && c.x < 74 && !sim.kittens.length) this.coach = t('coach_cage');
      else if (c.x > 74.5 && c.x < 79) this.coach = t('coach_aim' + sfxk);
      else if (c.x > 92 && c.x < 97) this.coach = t('coach_duck' + sfxk);
    } else if (id === '1-3' && c.x < 9) this.coach = t('coach_double');
    else if (id === '1-4' && c.y < 2.5 && sim.time < 14) this.coach = t('coach_hover' + sfxk);
    else if (id === '1-2' && c.x > 3 && c.x < 9) this.coach = t('coach_drop' + sfxk);
  }

  stepBuddy(real) {
    const b = this.buddy; if (!b) return;
    const c = this.sim.cat, w = this.sim.world;
    const tx = c.x - c.face * 1.15, dx = tx - b.x;
    b.anim += real; b.moving = Math.abs(dx) > 0.25;
    if (Math.abs(dx) > 9 || Math.abs(c.y - b.y) > 7) { b.x = tx; b.y = c.y; }
    if (b.moving) { b.x += Math.sign(dx) * Math.min(Math.abs(dx), (4 + Math.abs(dx) * 2.5) * real); b.face = Math.sign(dx); }
    const fl = floorBelow(w, b.x, Math.max(b.y, c.y) + 0.6);
    const target = fl > -40 ? fl : c.y;
    b.y += (target - b.y) * Math.min(1, real * 10);
  }
}
void VIEW_H;
