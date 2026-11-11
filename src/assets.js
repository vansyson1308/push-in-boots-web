// Loads the sprite atlases, backgrounds and audio. Nothing here knows about the game.
export const A = { frames: {}, pages: {}, images: {}, audio: {}, ready: false };

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('image ' + src));
    im.src = src;
  });
}

export async function loadCore(onProgress) {
  const atlas = await (await fetch('assets/atlas.json')).json();
  const core = ['hero_0', 'gob_0', 'fx_0'];
  let done = 0;
  const total = core.length + 1;
  const tick = () => onProgress && onProgress(++done / total);
  await Promise.all(core.map(async (p) => { A.pages[p] = await loadImage(`assets/atlas/${p}.webp`); tick(); }));
  for (const [name, f] of Object.entries(atlas.frames)) {
    A.frames[name] = { page: f[0], x: f[1], y: f[2], w: f[3], h: f[4], uw: f[5], uh: f[6], px: f[7], py: f[8] };
  }
  A.stageData = await (await fetch('assets/stages.json')).json();
  tick();
  A.ready = true;
}

// World art is fetched when a stage in that world is first opened.
const worldLoads = {};
export function loadWorld(n) {
  if (!worldLoads[n]) {
    worldLoads[n] = Promise.all([
      ...[`w${n}_0`, `boss${n}_0`].map(async (p) => { A.pages[p] = await loadImage(`assets/atlas/${p}.webp`); }),
      ...['sky', 'hills', 'ground'].map(async (k) => { A.images[`w${n}_${k}`] = await loadImage(`assets/bg/w${n}_${k}.webp`); }),
    ]);
  }
  return worldLoads[n];
}

export function frame(name) { return A.frames[name]; }

// ---- audio ---------------------------------------------------------------
export const SFX = ['ambush', 'boss_down', 'boss_hit', 'boss_intro', 'cannon', 'cat_hurt', 'checkpoint', 'coin', 'enemy_hit',
  'enemy_poof', 'explosion', 'fail', 'gate_break', 'harvest', 'jump', 'land', 'life_lost', 'meow', 'pickup', 'plant', 'power_up',
  'seed', 'shot_beam', 'shot_fan', 'shot_fizz', 'shot_pea', 'shot_rapid', 'spin_jump', 'tell', 'throw', 'tink', 'ui_click',
  'victory', 'water'];
export const MUSIC = ['music_farm', 'music_stage', 'music_boss'];
