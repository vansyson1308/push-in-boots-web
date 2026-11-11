// Daily Roundup and Endless Stampede: one island, pits on both sides, goblins leaping in.
// Everything comes from the seed, so the whole world plays the same daily.
import { Rng } from './rng.js';
import { spawnEnemy } from './enemies.js';
import { groundY } from './world.js';

export const DAILY_SECONDS = 90;

export function makeArena(seed, mode) {
  const r = new Rng(seed);
  const world = 1 + (seed % 3);
  const L = 4, R = 24;
  const platforms = [];
  const n = r.int(2, 3);
  for (let i = 0; i < n; i++) {
    const w = r.range(2.4, 3.4), cx = L + 2.5 + ((R - L - 5) * (i + 0.5)) / n + r.range(-0.8, 0.8);
    platforms.push({ x0: cx - w / 2, x1: cx + w / 2, y: i % 2 ? 3.5 : 1.9, kind: 'static' });
  }
  const ground = [[L, R, 0]];
  let startX = (L + R) / 2;
  if (r.chance(0.6)) {
    const m = r.range(11, 17); ground.length = 0; ground.push([L, m - 1, 0], [m + 1, R, 0]); platforms.push({ x0: m - 1.2, x1: m + 1.2, y: 1.7, kind: 'static' });
    startX = m > (L + R) / 2 ? m - 4.5 : m + 4.5;          // well clear of the gap
  }
  const art = { 1: ['tree', 'fence', 'grass', 'straw'], 2: ['reeds', 'rope_post', 'stone_arch', 'grass'], 3: ['pine', 'pebbles', 'dry_grass', 'rock_ledge'] }[world];
  const decor = [];
  for (let i = 0; i < 8; i++) {
    const a = r.pick(art), x = r.range(L + 0.5, R - 0.5);
    if (groundY({ solids: ground.map((g) => ({ x0: g[0], x1: g[1], y1: g[2] })) }, x) < -1) continue;
    decor.push({ art: a, layer: a === 'grass' || a === 'dry_grass' || a === 'reeds' ? 'fore' : 'back', x, y: 0, scale: r.range(0.3, 0.45), flip: r.chance(0.5) });
  }
  return {
    id: mode, world, index: 0, kind: 'run', art: ['', 'green_fields', 'stone_bridge', 'goblin_pass'][world], seed,
    start_x: startX, start_y: 0, goal_x: 1e9, goal_y: 0, par_seconds: DAILY_SECONDS, double_jump: true,
    ground, blocks: [], platforms, checkpoints: [], enemies: [], hazards: [], pickups: [], decor, locks: [],
    arena: { mode, L, R }, bounds: [L - 3.5, R + 3.5],
  };
}

const UNLOCK = [['runner', 0], ['sprinter', 10], ['balloon', 18], ['shield', 26], ['slinger', 34], ['bomber', 44], ['armored', 56], ['sniper', 70]];
const diffAt = (mode, t) => (mode === 'daily' ? t / DAILY_SECONDS : t / 60);       // endless keeps climbing

// The whole wave script comes from the seed and the clock, never from what the player does:
// each wave and each supply drop is rolled when it is scheduled, from its own random stream.
function rollWave(D, A) {
  const R = D.rng, t = D.sched, diff = diffAt(A.mode, t), over = Math.max(0, diff - 1);
  const pool = UNLOCK.filter((u) => t >= u[1]).map((u) => u[0]);
  const n = 1 + Math.min(4 + Math.floor(over * 1.5), Math.floor(diff * 2.4 + R.next() * 1.6));
  const side = R.chance(0.5) ? 1 : -1, list = [];
  for (let i = 0; i < n; i++) {
    const type = i === 0 || R.chance(0.45 + Math.min(0.45, over * 0.2)) ? R.pick(pool) : 'runner';
    list.push({ type, sd: i % 3 === 2 ? -side : side, a: R.next(), b: R.next() });
  }
  const gap = Math.max(0.55, Math.max(1.1, 3.8 - diff * 1.9) - over * 0.25) + R.next() * 0.8;
  return { t, list, gap };
}
function rollDrop(D, A) {
  const R = D.rng2;
  return { t: D.dropSched, x: R.range(A.L + 2, A.R - 2), heart: R.chance(0.4), other: R.pick(['rapid', 'fan', 'beam', 'fizz', 'catnip', 'bubble']), gap: 17 + R.next() * 6 };
}

export function stepDirector(s, dt) {
  const A = s.stage.arena;
  let D = s.director;
  if (!D) {
    D = s.director = { t: 0, n: 0, sched: 1.2, dropSched: 14, rng: new Rng((s.stage.seed ^ 0x9e3779b9) >>> 0), rng2: new Rng((s.stage.seed ^ 0x51ed270b) >>> 0) };
    D.wave = rollWave(D, A); D.drop = rollDrop(D, A);
  }
  if (s.outcome) return;
  D.t += dt;
  if (A.mode === 'daily' && D.t >= DAILY_SECONDS) { s.finish('win'); return; }
  // past the first minute, endless goblins get sturdier, quicker and more numerous without limit
  const over = Math.max(0, diffAt(A.mode, D.t) - 1);
  s.hpScale = 1 + over * 0.7; s.speedScale = 1 + Math.min(0.8, over * 0.25);
  const alive = s.enemies.filter((e) => e.state !== 'gone' && e.state !== 'tumble').length;
  if (D.t >= D.wave.t && alive < 18) {
    D.n++;
    D.wave.list.forEach((g, i) => {
      if (g.type === 'balloon') { spawnEnemy(s, g.type, g.sd > 0 ? A.R + 4 : A.L - 4, 3.4 + g.a, { delay: i * 0.3 }); return; }
      const e = spawnEnemy(s, g.type, g.sd > 0 ? A.R + 3.2 : A.L - 3.2, 1.2, { delay: i * 0.35 });
      e.vx = -g.sd * (7.2 + g.b * 2.2); e.vy = 9.5; e.state = 'leap'; e.face = -g.sd;
    });
    s.ev('wave', { n: D.n });
    D.sched = D.wave.t + D.wave.gap; D.wave = rollWave(D, A);
  }
  if (D.t >= D.drop.t) {
    const d = D.drop, gy = groundY(s.world, d.x);
    if (gy > -1) {
      const content = d.heart && s.cat.hearts < s.cat.maxHearts ? 'heart' : d.other;
      s.pickups.push({ i: 1000 + D.n * 7 + s.pickups.length, x: d.x, y: gy, content, container: 'barrel', hidden: false, hp: 2, open: false, taken: false, vy: 0, flash: 0, bob: 0 });
      s.ev('drop', { x: d.x, y: gy });
    }
    D.dropSched = d.t + d.gap; D.drop = rollDrop(D, A);
  }
}
