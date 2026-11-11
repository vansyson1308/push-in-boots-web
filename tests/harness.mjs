// Shared helpers for the headless tests: load stage data and play a stage with the rule-based bot.
import fs from 'node:fs';
import { Sim } from '../src/sim/sim.js';
import { Bot } from '../src/sim/bot.js';
import { prepareStages } from '../src/stages.js';
import { makeArena } from '../src/sim/arena.js';

export const data = prepareStages(JSON.parse(fs.readFileSync(new URL('../assets/stages.json', import.meta.url))));

export function runBot(stage, opts = {}) {
  const sim = new Sim(stage, { viewW: 16, hearts: 3, ...opts });
  const bot = new Bot();
  const maxSteps = (opts.maxSeconds || 420) * 60;
  let steps = 0, events = 0;
  const seen = {};
  while (!sim.outcome && steps < maxSteps) {
    const inp = bot.decide(sim);
    if (inp.special) sim.bigSplash();
    sim.step(inp);
    for (const e of sim.events) seen[e.t] = (seen[e.t] || 0) + 1;
    events += sim.events.length; sim.events.length = 0;
    steps++;
  }
  return { sim, steps, time: sim.time, outcome: sim.outcome, seen, events };
}
export { Sim, Bot, makeArena };
