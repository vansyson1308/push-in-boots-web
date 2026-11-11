// Regenerates the file list inside sw.js from what is on disk.   node tools/make_sw.mjs
// Run it after adding or removing scripts or art (the test suite checks that it is up to date).
import fs from 'node:fs';
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(dir + '/' + e.name) : [dir + '/' + e.name]));
const shell = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'assets/atlas.json', 'assets/stages.json',
  ...walk('src').filter((f) => f.endsWith('.js')),
  ...['hero_0', 'gob_0', 'fx_0', 'w1_0', 'boss1_0'].map((n) => `assets/atlas/${n}.webp`),
  ...['sky', 'hills', 'ground'].map((n) => `assets/bg/w1_${n}.webp`),
  ...walk('assets/ui'),
  ...walk('assets/font').filter((f) => f.endsWith('.woff2')),
  ...walk('assets/audio').filter((f) => !f.includes('music_')),          // music is fetched when first played
].sort((a, b) => (a === './' ? -1 : b === './' ? 1 : a.localeCompare(b)));
const src = fs.readFileSync('sw.js', 'utf8');
const out = src.replace(/const SHELL = \[[\s\S]*?\];/, 'const SHELL = ' + JSON.stringify(shell, null, 2) + ';');
fs.writeFileSync('sw.js', out);
console.log(shell.length, 'files in the offline shell');
