// Browser smoke test (needs Playwright):   node tools/smoke.mjs
// Starts a local server, walks the menus, lets the bot play a stage to the results screen and a
// daily run, and fails on any page error, failed request or missing screen.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 8123, URL = `http://localhost:${PORT}/`;
const server = spawn(process.execPath, ['tools/serve.mjs', '.', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const problems = [];
const browser = await chromium.launch();
async function page(viewport, mobile) {
  const ctx = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => problems.push('page error: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  p.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  return p;
}
const ready = (p) => p.waitForFunction(() => window.pibReady, null, { timeout: 30000 });
const state = (p) => p.evaluate(() => ({ screen: window.pib.screen, outcome: window.pib.play && window.pib.play.sim.outcome }));
try {
  // first visit: story, then straight into stage 1-1 with the bot until the results screen
  let p = await page({ width: 1280, height: 720 }, false);
  await p.goto(URL + '?nosw=1&bot=1'); await ready(p);
  await p.mouse.click(640, 360);
  await p.click('[data-act=skip]');
  await p.waitForFunction(() => window.pib.screen === 'results', null, { timeout: 120000 });
  if (!(await p.locator('.bigstars img.on').count())) problems.push('no stars on the results screen');
  await p.click('[data-act=share]'); await p.waitForSelector('canvas.sharecard');
  await p.click('.modal:last-child [data-act=close]');
  await p.click('[data-act=map]'); await p.waitForSelector('.world');
  for (const act of ['shop', 'album', 'settings']) { await p.click(`[data-act=${act}]`); await p.waitForSelector('.modal'); await p.click('.modal [data-act=close]'); }
  await p.click('[data-id="1-2"]'); await p.click('[data-act=go]');
  await p.waitForFunction(() => window.pib.screen === 'play');
  await p.click('#pause-btn'); await p.click('[data-act=quit]'); await p.waitForSelector('.world');
  await p.context().close();
  // a phone, in both languages, playing the daily to the end
  p = await page({ width: 844, height: 390 }, true);
  await p.goto(URL + '?nosw=1&bot=1&arena=daily&lang=vi'); await ready(p);
  await p.waitForFunction(() => window.pib.screen === 'results', null, { timeout: 150000 });
  const s = await state(p);
  if (s.outcome !== 'win') problems.push('daily did not run its full time: ' + JSON.stringify(s));
  await p.context().close();
  // a challenge link opens on the dare
  p = await page({ width: 390, height: 844 }, true);
  await p.goto(URL + '?nosw=1&c=1.e.4242.12000.9.40.77.1'); await ready(p);
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('pushinboots.save.v1') || '{}'); });
  await p.touchscreen.tap(190, 400);
  await p.waitForSelector('.modal .news', { timeout: 10000 });
  await p.context().close();
} catch (e) { problems.push('flow: ' + e.message.split('\n')[0]); }
await browser.close(); server.kill();
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('smoke test passed');
