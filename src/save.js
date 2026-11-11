// Progress lives in localStorage. Nothing leaves the device.
const KEY = 'pushinboots.save.v1';
export const UP_MAX = { pressure: 5, tank: 4, heart: 2, magnet: 3 };
export const UP_COST = { pressure: [60, 120, 220, 360, 550], tank: [80, 160, 300, 480], heart: [250, 600], magnet: [50, 120, 240] };
export const JET_COST = { blue: { free: true }, pink: { kittens: 6 }, lime: { stars: 12 }, gold: { stars: 30 }, ice: { kittens: 30 } };

function fresh() {
  return {
    v: 1, lang: null, prefs: { sound: true, music: true, autoFire: true, effects: true, haptics: true },
    stages: {}, coins: 0, up: { pressure: 0, tank: 0, heart: 0, magnet: 0 }, jet: 'blue', buddy: '',
    seen: [], daily: { date: '', score: 0, chain: 0, pushed: 0, streak: 0, best: 0 }, endless: { best: 0, chain: 0, time: 0 },
    stats: { pushed: 0, chain: 0, runs: 0 }, name: Math.floor(Math.random() * 1e6), intro: false, ending: false, last: '',
  };
}
export const save = { data: fresh() };

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw), f = fresh();
      if (d && d.v === 1) save.data = { ...f, ...d, prefs: { ...f.prefs, ...d.prefs }, up: { ...f.up, ...d.up }, daily: { ...f.daily, ...d.daily }, endless: { ...f.endless, ...d.endless }, stats: { ...f.stats, ...d.stats } };
    }
  } catch (e) { /* private mode or corrupt data: start fresh */ }
  return save.data;
}
export function persist() { try { localStorage.setItem(KEY, JSON.stringify(save.data)); } catch (e) { /* storage unavailable */ } }
export function resetSave() { const keep = { lang: save.data.lang, prefs: save.data.prefs }; save.data = { ...fresh(), ...keep }; persist(); }

export function totalStars() { let n = 0; for (const s of Object.values(save.data.stages)) n += s.stars || 0; return n; }
export function totalKittens() { let n = 0; for (const s of Object.values(save.data.stages)) n += (s.cages || []).length; return n; }
export function totalSacks() { let n = 0; for (const s of Object.values(save.data.stages)) n += s.sacks || 0; return n; }
export function stageRec(id) { return save.data.stages[id] || { stars: 0, best: 0, cages: [], sacks: 0, clears: 0, chain: 0, rank: '' }; }
export function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export function daySeed(date) { let h = 2166136261; for (const ch of 'pib-daily-' + date) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) % 2000000000 + 7; }
