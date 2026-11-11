import test from 'node:test';
import assert from 'node:assert/strict';
import { data, runBot, Sim, makeArena } from './harness.mjs';
import { spawnEnemy, hitEnemy } from '../src/sim/enemies.js';
import { encodeChallenge, decodeChallenge } from '../src/share.js';
import { TABLES } from '../src/i18n.js';
import { rankFor, nextRankAt } from '../src/stages.js';
import { SCORE, SPLASH } from '../src/sim/tune.js';

const idle = { mx: 0, my: 0, jump: false, fire: false };
// a flat test yard with a pit on the right
const yard = () => ({ id: 't', world: 1, kind: 'run', seed: 3, start_x: 4, start_y: 0, goal_x: 500, goal_y: 0, par_seconds: 60, double_jump: true,
  ground: [[0, 12, 0], [15, 40, 0]], platforms: [], enemies: [], pickups: [], hazards: [], checkpoints: [], locks: [], blocks: [] });

test('stage data: fifteen stages, kittens in every one, targets set', () => {
  assert.equal(data.order.length, 15);
  let cages = 0;
  for (const id of data.order) {
    const st = data.stages[id];
    assert.ok(st.cages >= 2, `${id} has ${st.cages} cages`);
    assert.ok(st.target >= 5000, `${id} target ${st.target}`);
    assert.equal(st.kittenBase, cages);
    cages += st.cages;
  }
  assert.equal(data.totalCages, cages);
});

for (const viewW of [14, 16, 18.5]) {
  test(`every stage can be finished (view ${viewW} units wide)`, () => {
    for (const id of data.order) {
      const r = runBot(data.stages[id], { mode: 'story', viewW, maxSeconds: 400 });
      assert.equal(r.outcome, 'win', `${id}: bot stuck at x=${r.sim.cat.x.toFixed(1)} y=${r.sim.cat.y.toFixed(1)} after ${r.time.toFixed(0)}s`);
      assert.ok(r.sim.cat.hearts > 0);
      assert.ok(Number.isFinite(r.sim.score) && r.sim.score > 0);
    }
  });
}

test('the simulation is deterministic', () => {
  const a = runBot(data.stages['1-2'], { mode: 'story' }), b = runBot(data.stages['1-2'], { mode: 'story' });
  assert.equal(a.sim.score, b.sim.score);
  assert.equal(a.steps, b.steps);
  assert.equal(a.sim.pushed, b.sim.pushed);
});

test('water pushes: a goblin sprayed beside a pit is dunked for triple points', () => {
  const sim = new Sim(yard(), {});
  const g = spawnEnemy(sim, 'runner', 11.4, 0, {});
  g.taunt = true;
  sim.cat.x = 8;
  let dunk = null;
  for (let i = 0; i < 400 && !dunk; i++) {
    sim.step({ ...idle, fire: true });
    for (const e of sim.events) if (e.t === 'ko' || e.t === 'bonus') if (e.cause === 'dunked') dunk = e;
    sim.events.length = 0;
  }
  assert.ok(dunk, 'the goblin should end up in the pit');
  assert.equal(sim.pushed, 1);
  assert.ok(sim.score >= 300, `score ${sim.score}`);
});

test('a flying goblin bowls over the ones behind it and builds a chain', () => {
  const sim = new Sim(yard(), {});
  sim.cat.x = 17;
  for (let i = 0; i < 4; i++) spawnEnemy(sim, 'runner', 20 + i * 0.9, 0, {}).taunt = true;
  for (let i = 0; i < 300; i++) { sim.step({ ...idle, mx: 0.3, fire: true }); sim.events.length = 0; }
  assert.ok(sim.pushed >= 3, `pushed ${sim.pushed}`);
  assert.ok(sim.chain.best >= 2, `chain ${sim.chain.best}`);
  assert.ok((sim.causes.bowled || 0) >= 1, JSON.stringify(sim.causes));
});

test('shields block water from the front but not from behind', () => {
  const sim = new Sim(yard(), {});
  const g = spawnEnemy(sim, 'shield', 23, 0, {}); g.face = -1;
  hitEnemy(sim, g, { dmg: 1, px: 5, py: 0, cause: 'washed', kind: 'pea' });          // travelling right, into his shield
  assert.equal(g.hp, g.maxHp, 'the shield should have absorbed the spray');
  hitEnemy(sim, g, { dmg: 1, px: -5, py: 0, cause: 'washed', kind: 'pea' });         // travelling left, into his back
  assert.equal(g.hp, g.maxHp - 1);
  const t = spawnEnemy(sim, 'turret', 30, 0, {});
  hitEnemy(sim, t, { dmg: 1, px: 5, py: 0, cause: 'washed', kind: 'pea' });
  assert.equal(t.hp, t.maxHp, 'a closed turret shrugs off water');
});

test('falling in a pit costs a heart and puts the cat back on safe ground; two falls build a plank', () => {
  const sim = new Sim(yard(), { mode: 'story' });
  sim.cat.x = 10;
  const fall = () => { for (let i = 0; i < 400; i++) { sim.step({ ...idle, mx: sim.cat.x < 13 ? 1 : 0 }); if (sim.events.some((e) => e.t === 'fell')) { sim.events.length = 0; return; } sim.events.length = 0; } };
  fall();
  assert.equal(sim.cat.hearts, 2);
  assert.ok(sim.cat.x < 12.1 && sim.cat.y >= 0);
  const before = sim.world.plats.length;
  fall();
  assert.equal(sim.world.plats.length, before + 1, 'a helper plank should bridge the gap after the second fall');
});

test('there are no lives: a knocked-out cat wakes up at the checkpoint with full hearts', () => {
  const sim = new Sim(yard(), { mode: 'story' });
  sim.cat.hearts = 1; sim.cat.inv = 0;
  sim.hurtCat(1);
  assert.equal(sim.cat.dead, true);
  for (let i = 0; i < 120; i++) sim.step(idle);
  assert.equal(sim.cat.dead, false);
  assert.equal(sim.cat.hearts, sim.cat.maxHearts);
  assert.equal(sim.outcome, null);
});

test('the Big Splash needs a full meter and sweeps the screen', () => {
  const sim = new Sim(yard(), {});
  sim.cat.x = 25;
  assert.equal(sim.bigSplash(), false);
  sim.splash = SPLASH.need;
  for (let i = 0; i < 5; i++) spawnEnemy(sim, 'runner', 27 + i, 0, {}).taunt = true;
  assert.equal(sim.bigSplash(), true);
  for (let i = 0; i < 120; i++) { sim.step(idle); sim.events.length = 0; }
  assert.equal(sim.pushed, 5);
  assert.equal(sim.splash < SPLASH.need, true);
});

test('daily roundup: the same seed sends the same goblins whatever the player does, and always lasts 90 s', () => {
  const script = (inputFor) => {
    const sim = new Sim(makeArena(20261111, 'daily'), { mode: 'daily', viewW: 16 });
    const seen = new Set(), order = [];
    while (!sim.outcome && sim.time < 100) {
      sim.step(inputFor(sim));
      for (const e of sim.enemies) if (!seen.has(e.id)) { seen.add(e.id); order.push(e.type); }
      sim.events.length = 0;
    }
    return { order, sim };
  };
  const a = script(() => idle), b = script((s) => ({ mx: Math.sin(s.time * 3) > 0 ? 0.6 : -0.6, my: 0, jump: Math.floor(s.time * 2) % 2 === 0, fire: true }));
  assert.equal(a.sim.outcome, 'win'); assert.equal(b.sim.outcome, 'win');
  assert.ok(Math.abs(a.sim.time - 90) < 0.1 && Math.abs(b.sim.time - 90) < 0.1);
  assert.ok(b.order.length > 40, `only ${b.order.length} goblins in 90 s`);
  assert.ok(a.order.length > 20);
  const n = Math.min(a.order.length, b.order.length);      // an idle player hits the crowd cap sooner; the script itself is identical
  assert.deepEqual(a.order.slice(0, n), b.order.slice(0, n));
  const other = new Sim(makeArena(20261112, 'daily'), { mode: 'daily' });
  assert.notDeepEqual(makeArena(20261111, 'daily').platforms, other.stage.platforms);
});

test('endless ends when the hearts run out', () => {
  const sim = new Sim(makeArena(42, 'endless'), { mode: 'endless' });
  while (!sim.outcome && sim.time < 600) { sim.step(idle); sim.events.length = 0; }
  assert.equal(sim.outcome, 'lose');
});

test('chains: the window shrinks as the chain grows and the multiplier is capped', () => {
  const sim = new Sim(yard(), {});
  const fake = { x: 5, y: 0, h: 1, score: 100, type: 'runner' };
  for (let i = 0; i < 60; i++) sim.award(fake, 'washed');
  assert.equal(sim.chain.n, 60);
  assert.equal(sim.chain.mult, SCORE.chainMaxMult);
  assert.ok(sim.chain.window < SCORE.chainWindow && sim.chain.window >= SCORE.chainMinWindow);
});

test('challenge links round-trip and reject anything malformed', () => {
  const c = { mode: 'd', key: '20261111', score: 12400, chain: 14, pushed: 52, name: 4242, jet: 'pink' };
  assert.deepEqual(decodeChallenge(encodeChallenge(c)), c);
  assert.deepEqual(decodeChallenge(encodeChallenge({ ...c, mode: 's', key: '2-3' })).key, '2-3');
  for (const bad of ['', 'x', '1.d.2026.1.1.1.1.0', '1.z.20261111.1.1.1.1.0', '1.s.9-9.1.1.1.1.0', '1.d.20261111.<script>.1.1.1.0', 'a'.repeat(200), null, undefined, 42]) {
    const r = decodeChallenge(bad);
    if (r) { assert.ok(Number.isInteger(r.score) && r.score >= 0, String(bad)); assert.match(String(r.key), /^[0-9-]+$/); } else assert.equal(r, null);
  }
  const huge = decodeChallenge('1.e.5.99999999999.99999.99999.9999999999.99');
  assert.ok(huge.score <= 9999999 && huge.chain <= 999 && huge.jet === 'ice');
});

test('ranks and next-rank hints', () => {
  assert.equal(rankFor(15000, 10000), 'S'); assert.equal(rankFor(10000, 10000), 'A'); assert.equal(rankFor(7000, 10000), 'B'); assert.equal(rankFor(100, 10000), 'C');
  assert.equal(nextRankAt(100, 10000), 7000); assert.equal(nextRankAt(16000, 10000), 0);
});

test('Vietnamese has every string English has', () => {
  const en = Object.keys(TABLES.en), vi = new Set(Object.keys(TABLES.vi));
  assert.deepEqual(en.filter((k) => !vi.has(k)), []);
  for (const k of en) assert.equal((TABLES.en[k].match(/\{\d\}/g) || []).length, (TABLES.vi[k].match(/\{\d\}/g) || []).length, `placeholders differ in ${k}`);
});
