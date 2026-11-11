// Web Audio: sample playback with pitch, a rising chain ladder, and cross-faded music.
import { A, SFX } from './assets.js';

const S = { ctx: null, master: null, sfx: null, music: null, buf: {}, loading: {}, cur: null, curName: '', soundOn: true, musicOn: true, last: {} };

export function audioInit() {
  if (S.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  S.ctx = new AC();
  S.master = S.ctx.createGain(); S.master.connect(S.ctx.destination);
  S.sfx = S.ctx.createGain(); S.sfx.connect(S.master);
  S.music = S.ctx.createGain(); S.music.connect(S.master);
  S.sfx.gain.value = S.soundOn ? 1 : 0; S.music.gain.value = S.musicOn ? 0.5 : 0;
  for (const n of SFX) load(n);
}
export function audioResume() { if (S.ctx && S.ctx.state === 'suspended') S.ctx.resume(); }
export function audioSuspend() { if (S.ctx && S.ctx.state === 'running') S.ctx.suspend(); }

function load(name) {
  if (S.buf[name]) return Promise.resolve(S.buf[name]);
  if (!S.loading[name]) {
    S.loading[name] = fetch(`assets/audio/${name}.mp3`).then((r) => r.arrayBuffer())
      .then((ab) => new Promise((res, rej) => S.ctx.decodeAudioData(ab, res, rej)))
      .then((b) => (S.buf[name] = b)).catch(() => null);
  }
  return S.loading[name];
}

export function setSound(on) { S.soundOn = on; if (S.sfx) S.sfx.gain.value = on ? 1 : 0; }
export function setMusic(on) { S.musicOn = on; if (S.music) S.music.gain.setTargetAtTime(on ? 0.5 : 0, S.ctx.currentTime, 0.2); }

// play('coin', { vol, rate, gap }) - `gap` (seconds) throttles sounds that would otherwise machine-gun
export function play(name, o = {}) {
  if (!S.ctx || !S.soundOn) return;
  const b = S.buf[name];
  if (!b) return;
  const now = S.ctx.currentTime;
  if (o.gap && S.last[name] && now - S.last[name] < o.gap) return;
  S.last[name] = now;
  const src = S.ctx.createBufferSource();
  src.buffer = b;
  src.playbackRate.value = (o.rate || 1) * (o.vary ? 1 + (Math.random() - 0.5) * o.vary : 1);
  const g = S.ctx.createGain(); g.gain.value = o.vol ?? 1;
  src.connect(g); g.connect(S.sfx); src.start();
}

// Each wash-out in a chain climbs a pentatonic ladder, so a long chain sounds like a run up a scale.
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
export function chainNote(n) {
  const st = LADDER[Math.min(LADDER.length - 1, n - 1)];
  play('coin', { rate: Math.pow(2, st / 12) * 0.8, vol: 0.9 });
}

export async function music(name) {
  if (!S.ctx || S.curName === name) return;
  S.curName = name;
  const old = S.cur, now = S.ctx.currentTime;
  if (old) { old.g.gain.setTargetAtTime(0, now, 0.25); setTimeout(() => { try { old.src.stop(); } catch (e) { /* already stopped */ } }, 1200); }
  S.cur = null;
  if (!name) return;
  const b = await load(name);
  if (!b || S.curName !== name) return;
  const src = S.ctx.createBufferSource(); src.buffer = b; src.loop = true;
  const g = S.ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(1, S.ctx.currentTime, 0.4);
  src.connect(g); g.connect(S.music); src.start();
  S.cur = { src, g };
}
export function musicRate(r) { if (S.cur) S.cur.src.playbackRate.setTargetAtTime(r, S.ctx.currentTime, 0.15); }
export function duck(v) { if (S.music && S.musicOn) S.music.gain.setTargetAtTime(0.5 * v, S.ctx.currentTime, 0.1); }
