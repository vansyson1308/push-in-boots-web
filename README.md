# Push In Boots

> The cowboy cat who doesn't shoot goblins — he **pushes** them.

A water-blasting platformer that runs in any modern browser, on a desktop or a phone, with no
install and no plug-in. A tiny unflappable cat, an absurdly big water blaster, and a farm full of
goblins to wash off it.

This is the plain-JavaScript edition of the game. It replaces the Unity WebGL build
(kept under `legacy-unity/` for reference) with about 8 MB of ES modules, sprites and sound
that start in about a second and work offline.

## Play

Any static file server will do:

```bash
npm start
```

then open <http://localhost:8080>. The repository is also a ready-to-serve GitHub Pages site
(`index.html` at the root, no build step).

### Controls

| | Keyboard | Touch | Gamepad |
| --- | --- | --- | --- |
| Move | `A` `D` or arrows | drag the left side | stick / d-pad |
| Jump (press again in the air for a double jump) | `Space`, `K` or `Z` | arrow button | A |
| Spray | hold `J`, `X` or the mouse | hold the splash button (auto-spray is on by default) | X / RT |
| Aim up, duck | `W`, `S` | push the stick up / down | stick |
| Hover | in the air, hold `S` and spray | in the air, pull down and spray | same |
| Big Splash (when the meter is full) | `L` or `C` | wave button | Y |
| Pause | `Esc` or `P` | pause button | Start |

## What is in the game

- **Water is force.** Every drop pushes. A goblin that loses its footing becomes a tumbling
  projectile that bowls over its friends, smashes barrels and dents bosses. Shove one toward a
  pit and it plops in for triple points.
- **Chains.** Wash-outs in quick succession build a chain that multiplies the score, climbs a
  musical scale and slows time when it gets long.
- **Story:** 15 hand-built stages across Green Fields, Orchard Road and Goblin Pass, with
  ambushes, two vertical climbs and three war machines to shove off the farm. Three clear
  objectives per stage: reach the end, bring every kitten home, beat the score target.
- **Daily Roundup:** one island, 90 seconds, and the same goblins for everyone in the world
  that day. The first run of the day is the one that counts.
- **Endless Stampede:** hold the island for as long as you can.
- **Share and challenge:** every result can become a picture and a link. Opening the link drops
  a friend into the same seed with your score to beat. There is no server and no account.
- **No lives, no timers, no ads.** Knocked out? You are back at the last flag in a second.
- English and Vietnamese. Keyboard, mouse, touch and gamepad. Installable, works offline.

## Project layout

```
index.html, css/        page shell and menu styling
src/main.js             boot, frame loop, flow between screens
src/play.js             one play session: fixed-step simulation plus effects, sound, camera shake
src/sim/                the game itself, deterministic and free of DOM (runs headless in Node)
  tune.js               every number that shapes the feel
  sim.js enemies.js boss.js arena.js world.js
  bot.js                a rule-based player used by the tests and by ?bot=1
src/render/             canvas renderer, particles, HUD and touch controls
src/ui.js               menus (plain DOM over the canvas)
src/stages.js           turns stage files into playable stages (kittens, pit goblins, targets)
src/share.js            share cards and challenge links
assets/                 sprite atlases (WebP), audio (MP3), stage data, font
tests/                  node:test suite
tools/                  asset pipeline, calibration, local server, browser smoke test
docs/DESIGN.md          the design pillars and the reasoning behind them
```

## Tests

```bash
npm test
```

The suite runs the simulation headless. It checks, among other things, that a bot can finish
all fifteen stages at several screen widths, that the simulation is deterministic, that the
daily sends everyone the same goblins, and that challenge links reject malformed input.

Two more tools are useful while tuning:

```bash
node tools/botrun.mjs            # play every stage with the bot and print the outcome
node tools/calibrate.mjs         # reset the third-star score targets from bot playthroughs
node tools/smoke.mjs             # browser walk-through (needs Playwright)
node tools/make_sw.mjs           # refresh the offline file list in sw.js after adding files
```

When you publish a new version, bump `VERSION` at the top of `sw.js` so returning players get a
clean cache.

Handy URL switches for testing: `?play=2-3` starts a stage directly, `?arena=daily` or
`?arena=endless` starts an arena run, `?bot=1` lets the bot play, `?lang=vi` forces a language.

## Assets

Art, audio and stage layouts come from the original Push In Boots project. To rebuild
`assets/` from the Unity build (needs UnityPy, brotli, Pillow and ffmpeg):

```bash
python3 tools/extract_unity.py legacy-unity/Build /tmp/pib-extract
```

```bash
python3 tools/build_assets.py /tmp/pib-extract
```
 The typeface is Baloo 2 (SIL Open Font License, see
`assets/font/OFL.txt`).

## Design

The redesign followed Jesse Schell's *The Art of Game Design: A Book of Lenses*.
[`docs/DESIGN.md`](docs/DESIGN.md) records what each lens found in the previous build and what
was changed in response.
