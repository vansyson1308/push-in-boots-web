// Boot, the frame loop and the flow between screens.
import { A, loadCore, loadWorld } from './assets.js';
import { audioInit, audioResume, audioSuspend, setSound, setMusic, music, play as sfx } from './audio.js';
import { Input } from './input.js';
import { View } from './render/view.js';
import { Play } from './play.js';
import { prepareStages, rankFor } from './stages.js';
import { makeArena } from './sim/arena.js';
import { Bot } from './sim/bot.js';
import { save, loadSave, persist, resetSave, stageRec, today, daySeed, totalKittens } from './save.js';
import { t, setLang, detectLang, KITTEN_NAMES } from './i18n.js';
import { KITTENS } from './sim/sim.js';
import * as ui from './ui.js';
import { decodeChallenge } from './share.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const pauseBtn = document.getElementById('pause-btn');
const boot = document.getElementById('boot');

const app = {
  view: null, input: null, play: null, data: null, screen: 'boot', challenge: null, modal: null, lastCfg: null, bot: null,

  applyPrefs() {
    const p = save.data.prefs;
    setSound(p.sound); setMusic(p.music);
    if (this.play) { this.play.fx.reduced = !p.effects; }
  },
  setLanguage(l) { save.data.lang = l; setLang(l); persist(); },
  resetProgress() { resetSave(); setLang(save.data.lang || detectLang()); },

  upgrades() { const u = save.data.up; return { pressure: u.pressure, tank: u.tank, hearts: 3 + u.heart, magnet: u.magnet }; },

  async startStage(id) {
    const st = this.data.stages[id];
    ui.clearUi(); this.screen = 'loading';
    await loadWorld(st.world);
    const rec = stageRec(id);
    this.begin({
      stage: st, mode: 'story', seed: st.seed, opts: { ...this.upgrades(), opened: rec.cages || [] },
      onEnd: (res) => this.endStage(res),
    });
    save.data.last = id; persist();
  },

  // Arena runs use a fixed loadout so that a daily score means the same thing for everyone.
  async startArena(mode, challenge, seedKey) {
    let key, seed;
    if (mode === 'daily') { key = challenge && challenge.mode === 'd' ? challenge.key : seedKey || today().replace(/-/g, ''); seed = daySeed(key); }
    else { key = challenge && challenge.mode === 'e' ? challenge.key : seedKey || String(1 + Math.floor(Math.random() * 2e9)); seed = parseInt(key, 10) || 1; }
    const st = makeArena(seed, mode);
    ui.clearUi(); this.screen = 'loading';
    await loadWorld(st.world);
    this.arena = { mode, key: String(key), challenge: challenge || null };
    this.begin({ stage: st, mode, seed, opts: { pressure: 0, tank: 0, hearts: 3, magnet: 0 }, onEnd: (res) => this.endArena(res) });
  },

  begin(cfg) {
    const d = save.data;
    this.lastCfg = cfg;
    this.view.resize();
    this.play = new Play(this.view, this.input, {
      ...cfg, prefs: d.prefs, jet: d.jet, buddy: d.buddy, seen: this.seen,
      onPause: () => this.pause(),
    });
    this.screen = 'play'; this.input.enabled = true; pauseBtn.hidden = false;
    this.bot = params.get('bot') ? new Bot() : null;
    canvas.focus();
  },
  restart() {
    const c = this.lastCfg;
    if (c.mode === 'story') this.startStage(c.stage.id); else this.startArena(c.mode, this.arena.challenge, this.arena.key);
  },
  pause() {
    if (this.screen !== 'play' || !this.play || this.play.ended || this.play.paused) return;
    this.play.paused = true; pauseBtn.hidden = true; this.input.enabled = false; this.input.releaseAll();
    this.modal = ui.showPause(this);
  },
  resume() { if (this.play) { this.play.paused = false; pauseBtn.hidden = false; this.input.enabled = true; canvas.focus(); } },
  stopPlay() { this.play = null; pauseBtn.hidden = true; this.input.enabled = false; this.input.releaseAll(); persistSeen(); },
  quitToMap() { this.stopPlay(); this.toMap(); },
  toMap(focus) {
    if (stageRec('3-5').stars > 0 && !save.data.ending) { this.showEnding(); return; }
    this.stopPlay(); this.screen = 'map'; music('music_farm');
    ui.showMap(this, focus);
    if (this.challenge) { const c = this.challenge; ui.showChallenge(this, c); }
  },
  afterStage(prev, next) { this.startStage(next); },
  toggleFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    Promise.resolve(req.call(el)).then(() => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }).catch(() => {});
  },
  showEnding() {
    save.data.ending = true; persist(); this.stopPlay(); this.screen = 'story'; music('music_farm');
    ui.showStory(this, [['story_boss', 'story_end_1'], ['story_home', 'story_end_2']], () => this.toMap());
  },

  endStage(res) {
    const d = save.data, st = this.data.stages[res.stageId], old = stageRec(res.stageId);
    const homeBefore = ui.kittensHome(this), worldsBefore = [2, 3].filter((w) => ui.stageUnlocked(this, `${w}-1`));
    const cages = Array.from(new Set([...(old.cages || []), ...res.kittens])).sort((a, b) => a - b);
    const stars = 1 + (cages.length >= st.cages ? 1 : 0) + (Math.max(res.score, old.best || 0) >= st.target ? 1 : 0);
    const newBest = res.score > (old.best || 0);
    const gained = Math.max(0, stars - (old.stars || 0));
    const coins = res.coins + gained * 15 + (old.clears ? 0 : 10);
    const best = Math.max(old.best || 0, res.score);
    d.stages[res.stageId] = {
      stars: Math.max(stars, old.stars || 0), best, cages, sacks: Math.max(old.sacks || 0, res.sacks), clears: (old.clears || 0) + 1,
      chain: Math.max(old.chain || 0, res.chain), rank: rankFor(best, st.target), time: old.time ? Math.min(old.time, res.time) : res.time,
    };
    d.coins += coins; d.stats.pushed += res.pushed; d.stats.chain = Math.max(d.stats.chain, res.chain); d.stats.runs++;
    persist();
    const news = [];
    const homeAfter = ui.kittensHome(this);
    for (let i = homeBefore; i < homeAfter; i++) news.push({ img: KITTENS[i], text: t('moved_in', KITTEN_NAMES[KITTENS[i]]) });
    for (const w of [2, 3]) if (!worldsBefore.includes(w) && ui.stageUnlocked(this, `${w}-1`)) news.push({ img: 'icon_ribbon', text: t('unlocked_world', t('world' + w)) });
    if (res.stageId === '1-2' && !old.clears) news.push({ img: 'icon_calendar', text: `${t('daily')} + ${t('endless')}!` });
    if (res.stageId === '3-5' && !old.clears) news.push({ img: 'icon_ribbon', text: t('all_clear') });
    pauseBtn.hidden = true; this.input.enabled = false; this.screen = 'results';
    const ch = this.challenge && this.challenge.mode === 's' && this.challenge.key === res.stageId ? this.challenge : null;
    if (ch) { news.unshift({ img: 'icon_ribbon', text: res.score > ch.score ? t('challenge_won', '') : t('challenge_lost', '', ch.score - res.score) }); this.challenge = null; }
    this.modal = ui.showResults(this, res, { stars, newBest, coins, news });
    if (homeAfter > homeBefore) sfx('meow');
  },

  endArena(res) {
    const d = save.data, a = this.arena, daily = res.mode === 'daily';
    const coins = Math.floor(res.score / 250);
    let newBest = false, counted = false;
    if (daily) {
      const day = today(), isToday = a.key === day.replace(/-/g, '');
      if (isToday && d.daily.date !== day) {
        counted = true;
        const y = new Date(Date.now() - 864e5), yk = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
        d.daily = { date: day, score: res.score, chain: res.chain, pushed: res.pushed, streak: d.daily.date === yk ? d.daily.streak + 1 : 1, best: Math.max(d.daily.best || 0, res.score) };
        newBest = res.score >= d.daily.best;
      }
    } else if (res.score > d.endless.best) { d.endless = { best: res.score, chain: res.chain, time: res.time }; newBest = true; }
    d.coins += coins; d.stats.pushed += res.pushed; d.stats.chain = Math.max(d.stats.chain, res.chain); d.stats.runs++;
    persist();
    pauseBtn.hidden = true; this.input.enabled = false; this.screen = 'results';
    const ch = a.challenge; this.challenge = null;
    this.modal = ui.showArenaResults(this, res, { coins, newBest, counted, seedKey: a.key, challenge: ch });
  },
};
window.pib = app;                       // handy in the console, and used by the automated tests

function persistSeen() { save.data.seen = Array.from(app.seen || []); persist(); }

// ---- frame loop --------------------------------------------------------------
let last = 0;
function frame(ts) {
  const dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
  if (app.play && (app.screen === 'play' || app.screen === 'results')) {
    if (app.screen === 'play') {
      if (app.bot && !app.play.paused) app.input.botFrame = app.bot.decide(app.play.sim);
      app.play.update(dt);
    } else { app.play.fx.step(dt); }
    if (app.play) app.play.draw();
  }
  requestAnimationFrame(frame);
}

// ---- boot -------------------------------------------------------------------
async function bootGame() {
  const d = loadSave();
  setLang(params.get('lang') || d.lang || detectLang());
  app.seen = new Set(d.seen || []);
  const note = document.getElementById('boot-note'), fill = document.getElementById('boot-fill');
  note.textContent = t('loading');
  app.view = new View(canvas);
  app.input = new Input(canvas);
  // the bot (used by tests and ?bot=1) feeds the same input path a player does
  const read = app.input.read.bind(app.input);
  app.input.read = () => { const f = read(); const b = app.input.botFrame; if (b) { f.mx = b.mx; f.my = b.my; f.jump = b.jump; f.fire = b.fire; if (b.special) f.special = true; } return f; };
  addEventListener('resize', () => app.view.resize());
  addEventListener('orientationchange', () => setTimeout(() => app.view.resize(), 200));
  try {
    await Promise.all([loadCore((p) => { fill.style.width = Math.round(p * 100) + '%'; if (p > 0.8) note.textContent = t('almost'); }), document.fonts ? document.fonts.load('800 20px "Baloo 2"').catch(() => {}) : null]);
  } catch (e) {
    note.textContent = 'Could not load the game files. Please reload the page.';
    return;
  }
  app.data = prepareStages(A.stageData);
  const c = params.get('c');
  if (c) { app.challenge = decodeChallenge(c); history.replaceState(null, '', location.pathname); }
  boot.classList.add('tap'); note.textContent = t('title_tap');
  window.pibReady = true;
  const go = () => {
    removeEventListener('keydown', go); boot.removeEventListener('pointerdown', go);
    audioInit(); audioResume(); app.applyPrefs();
    boot.style.opacity = '0'; setTimeout(() => { boot.hidden = true; }, 350);
    start();
  };
  addEventListener('keydown', go); boot.addEventListener('pointerdown', go);
  if (params.get('play') || params.get('arena') || params.get('auto')) go();
  requestAnimationFrame(frame);
}

function start() {
  const d = save.data, dev = params.get('play'), arena = params.get('arena');
  if (dev && app.data.stages[dev]) { app.startStage(dev); return; }
  if (arena === 'daily' || arena === 'endless') { app.startArena(arena, null, params.get('seed') || undefined); return; }
  if (!d.intro && !app.challenge) {
    app.screen = 'story'; music('music_farm');
    ui.showStory(app, [['story_steal', 'story_1'], ['story_trail', 'story_2']], () => { d.intro = true; persist(); app.startStage('1-1'); });
    return;
  }
  app.toMap(d.last || undefined);
}

pauseBtn.addEventListener('click', () => { sfx('ui_click'); app.pause(); });
// keyboard in the menus: Enter confirms the main button, Escape backs out
addEventListener('keydown', (e) => {
  if (app.screen === 'play' && app.play && !app.play.paused) return;
  const root = document.querySelector('#ui .modal:last-child') || document.querySelector('#ui .screen');
  if (!root) return;
  if (e.code === 'Enter' || e.code === 'NumpadEnter') { const b = root.querySelector('.btn.green:not([disabled])'); if (b) { e.preventDefault(); b.click(); } }
  else if (e.code === 'Escape') { const b = root.querySelector('[data-act=resume],[data-act=close],[data-act=skip]'); if (b) { e.preventDefault(); b.click(); } }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { app.pause(); audioSuspend(); } else audioResume(); });
addEventListener('blur', () => app.pause());
addEventListener('pointerdown', audioResume, { passive: true });
addEventListener('keydown', (e) => { if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code) && app.screen === 'play') e.preventDefault(); });
document.addEventListener('gesturestart', (e) => e.preventDefault());

if ('serviceWorker' in navigator && location.protocol === 'https:' && !params.get('nosw')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
void totalKittens;
bootGame();
