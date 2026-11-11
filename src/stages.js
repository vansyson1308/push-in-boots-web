// Turns the raw stage files into the stages the game plays: every stage gets three caged
// kittens, a goblin loitering beside each pit (so there is always something to dunk),
// and a score target for its third star.
import { ENEMIES } from './sim/tune.js';
import { Rng } from './sim/rng.js';
import { buildWorld, floorBelow } from './sim/world.js';
import { TARGETS } from './targets.js';

export function prepareStages(data) {
  const out = { order: data.order.slice(), stages: {}, totalCages: 0 };
  let base = 0;
  for (const id of data.order) {
    const st = JSON.parse(JSON.stringify(data.stages[id]));
    const rng = new Rng(st.seed * 7919);
    const w = buildWorld(st);
    const climb = st.kind === 'climb';
    // kittens: worlds two and three shipped without cages, so some of their grain sacks become rescues
    let cages = st.pickups.filter((p) => p.container === 'cage').length;
    if (!cages) {
      const seeds = st.pickups.filter((p) => p.content === 'seed').sort((a, b) => (climb ? a.y - b.y : a.x - b.x));
      for (let i = 1; i < seeds.length && cages < 3; i += 2) {
        const p = seeds[i], fl = floorBelow(w, p.x, p.y + 0.3);
        if (fl < -40) { i--; continue; }
        p.content = 'kitten'; p.container = 'cage'; p.hidden = true; p.y = fl; cages++;
      }
    }
    st.kittenBase = base; base += cages;
    // a goblin showing off next to every pit: the game's way of saying "push me"
    if (st.kind === 'run') {
      const g = st.ground.slice().sort((a, b) => a[0] - b[0]);
      let first = true;
      for (let i = 0; i < g.length - 1; i++) {
        const gap = g[i + 1][0] - g[i][1];
        if (gap < 1.3 || g[i][1] - g[i][0] < 5 || g[i][1] < 12) continue;
        const always = id === '1-1' && first; first = false;
        if (!always && !rng.chance(0.7)) continue;
        const x = g[i][1] - 0.55;
        if ((st.locks || []).some((l) => Math.abs(l.x - x) < 9)) continue;
        st.enemies.push({ type: 'runner', x, y: g[i][2], trigger: x - 10, taunt: true });
      }
    }
    // one loot goblin per run stage: it runs away with a sack of coins. Catch it if you can.
    if (st.kind === 'run') {
      const g = st.ground.filter((q) => q[1] - q[0] > 14 && q[0] > 25 && q[1] < st.goal_x - 15);
      if (g.length) {
        const seg = g[rng.int(0, g.length - 1)], x = seg[0] + 3 + rng.next() * Math.max(0, seg[1] - seg[0] - 12);
        if (!(st.locks || []).some((l) => Math.abs(l.x - x) < 10)) st.enemies.push({ type: 'runner', x, y: seg[2], trigger: x - 9, loot: true });
      }
    }
    let sum = 0;
    for (const e of st.enemies) sum += ENEMIES[e.type].score * (e.count || 1);
    for (const l of st.locks || []) for (const wv of l.waves) for (const e of wv) sum += ENEMIES[e.type].score * (e.count || 1);
    const sacks = st.pickups.filter((p) => p.content === 'seed').length, coins = st.pickups.filter((p) => p.content === 'coin').length;
    const raw = sum * 1.45 + sacks * 250 + cages * 500 + coins * 10 + (st.checkpoints || []).length * 100 + (st.locks || []).length * 500 + (st.boss ? 5000 : 0) + 1200;
    st.target = TARGETS[id] || Math.round(raw / 500) * 500;
    st.cages = cages; st.sacks = sacks;
    out.stages[id] = st;
  }
  out.totalCages = base;
  return out;
}

export function rankFor(score, target) {
  const r = score / target;
  return r >= 1.5 ? 'S' : r >= 1.0 ? 'A' : r >= 0.7 ? 'B' : 'C';
}
export function nextRankAt(score, target) {
  for (const k of [0.7, 1.0, 1.5]) if (score < target * k) return Math.ceil((target * k) / 100) * 100;
  return 0;
}
