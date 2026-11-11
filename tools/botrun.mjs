// Plays every stage with the bot and prints what happened.   node tools/botrun.mjs [stage] [viewWidth]
import { data, runBot } from '../tests/harness.mjs';
const only = process.argv[2], viewW = +(process.argv[3] || 16);
for (const id of data.order) {
  if (only && only !== 'all' && id !== only) continue;
  const st = data.stages[id], r = runBot(st, { mode: 'story', viewW, maxSeconds: 400 }), s = r.sim;
  console.log(id, st.kind, r.outcome || 'TIMEOUT', 't=' + r.time.toFixed(0), 'score=' + s.score, 'target=' + st.target, 'chain=' + s.chain.best,
    'pushed=' + s.pushed + '/' + s.totalEnemies, 'kos=' + s.kos, 'hits=' + s.hits, 'kittens=' + s.kittens.length + '/' + s.cageCount, 'coins=' + s.coins, JSON.stringify(s.causes));
}
