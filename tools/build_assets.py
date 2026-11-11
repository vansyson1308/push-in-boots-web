#!/usr/bin/env python3
"""Asset pipeline for Push In Boots (HTML5 edition).

Input : a directory produced by extracting the original art/audio/stage data
        (sprite/*.png, tex/*.png, audio/*.m4a, text/*.txt, spritemeta.json).
Output: assets/atlas/*.webp + assets/atlas.json, assets/bg, assets/ui, assets/audio, assets/stages.json

Usage : python3 tools/build_assets.py <extracted_dir> [repo_root]
"""
import sys, os, json, re, subprocess, glob
from PIL import Image

EXT = sys.argv[1]
ROOT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'assets')
meta = json.load(open(os.path.join(EXT, 'spritemeta.json')))

def base(n):
    return re.sub(r'_\d{3,4}$', '', n)

by_tag = {}
for fn, m in meta.items():
    t = m['tag']
    t = 'tex' if t.startswith('tex:') else t
    by_tag.setdefault(t, {})
    b = base(fn)
    if b in by_tag[t]:          # duplicate base name inside one tag (e.g. two part_2 in W1Boss)
        b = fn
    by_tag[t][b] = fn

def tex(*names):
    return {n: by_tag['tex'][n] for n in names if n in by_tag['tex']}

KITTENS = ['biscuit', 'socks', 'mochi', 'luna', 'inky', 'maple', 'pip', 'nugget', 'pepper', 'pudding', 'clover']
groups = {}
groups['hero'] = {**by_tag['Hero'], **by_tag['HeroPoses'],
                  **tex('hero_walk_1', 'hero_walk_2', 'hero_walk_3', 'hero_walk_4', 'hero_photo_pose',
                        'hero_pet_kitten', 'hero_sit_fence', 'hero_carry_crate')}
groups['gob'] = {**by_tag['Goblin'], **by_tag['GoblinPoses']}
ctl = by_tag['Controls']
groups['fx'] = {**by_tag['Fx2'], **by_tag['Items'],
                **{k: v for k, v in by_tag['tex'].items() if k.startswith(('fx_', 'cage', 'pose_'))},
                **tex('coin', 'heart', 'heart_empty', 'star', 'star_empty', 'star_hud', 'star_hud_empty', 'glow', 'ring',
                      'ember', 'rescue_hearts', 'bubble', 'cloud_a', 'cloud_b', 'bee', 'butterfly', 'seagull', 'signpost',
                      'rubble', 'hand_pointer', 'speech_bubble', 'lock', 'check', 'icon_skull', 'icon_goblin', 'icon_pause',
                      *KITTENS),
                **{k: ctl[k] for k in ('checkpoint_flag_down', 'checkpoint_flag_up', 'stick_base', 'stick_thumb', 'fire',
                                       'jump', 'special', 'aim', 'life_head', 'boss_bar_frame', 'trail_dot', 'drop',
                                       'goblin_armored', 'goblin_balloon', 'goblin_bomber', 'goblin_runner', 'goblin_shield',
                                       'goblin_slinger', 'goblin_sniper', 'goblin_sprinter')}}
for w in (1, 2, 3):
    groups['w%d' % w] = {k: v for k, v in by_tag['W%d' % w].items() if not k.startswith('boss_')}
    groups['boss%d' % w] = dict(by_tag['W%dBoss' % w])

def scale_for(m, group, name):
    ppu = m['ppu']
    if group.startswith('w') and ppu <= 110: return 1.0
    if group == 'fx' and ppu <= 110: return 0.6
    if ppu >= 250: return 0.6
    if ppu >= 150: return 0.72
    return 1.0

MAXW = 2048
atlas_json = {'pages': [], 'frames': {}}

def pack(group, items):
    ims = []
    for name, fn in sorted(items.items()):
        p = os.path.join(EXT, 'sprite', fn + '.png')
        if not os.path.exists(p):
            print('missing', p); continue
        im = Image.open(p).convert('RGBA')
        m = meta[fn]; s = scale_for(m, group, name)
        w0, h0 = im.size
        if s != 1.0:
            im = im.resize((max(1, round(w0 * s)), max(1, round(h0 * s))), Image.LANCZOS)
        ppu = 300.0 if group == 'fx' else m['ppu']     # effects share one scale: 300 px per unit
        ims.append((name, im, w0 / ppu, h0 / ppu, m['pivot']))
    ims.sort(key=lambda t: -t[1].height)
    pages = []; cur = None
    def new_page():
        return {'img': Image.new('RGBA', (MAXW, MAXW), (0, 0, 0, 0)), 'x': 2, 'y': 2, 'rowh': 0, 'maxy': 0, 'maxx': 0}
    cur = new_page(); pages.append(cur)
    for name, im, uw, uh, pv in ims:
        w, h = im.size
        if cur['x'] + w + 2 > MAXW:
            cur['x'] = 2; cur['y'] += cur['rowh'] + 4; cur['rowh'] = 0
        if cur['y'] + h + 2 > MAXW:
            cur = new_page(); pages.append(cur)
        cur['img'].paste(im, (cur['x'], cur['y']))
        page_name = '%s_%d' % (group, len(pages) - 1)
        atlas_json['frames']['%s/%s' % (group, name)] = [page_name, cur['x'], cur['y'], w, h,
                                                        round(uw, 4), round(uh, 4), pv[0], round(1 - pv[1], 3)]
        cur['x'] += w + 4; cur['rowh'] = max(cur['rowh'], h)
        cur['maxy'] = max(cur['maxy'], cur['y'] + h + 2); cur['maxx'] = max(cur['maxx'], cur['x'])
    for i, pg in enumerate(pages):
        img = pg['img'].crop((0, 0, min(MAXW, pg['maxx']), pg['maxy']))
        name = '%s_%d' % (group, i)
        img.save(os.path.join(OUT, 'atlas', name + '.webp'), 'WEBP', quality=86, method=6)
        atlas_json['pages'].append(name)
        print(name, img.size, os.path.getsize(os.path.join(OUT, 'atlas', name + '.webp')) // 1024, 'KB')

for d in ('atlas', 'bg', 'ui', 'audio'):
    os.makedirs(os.path.join(OUT, d), exist_ok=True)
for g, items in groups.items():
    pack(g, items)
json.dump(atlas_json, open(os.path.join(OUT, 'atlas.json'), 'w'), separators=(',', ':'))

def save(src, dst, size=None, q=80):
    im = Image.open(os.path.join(EXT, 'sprite', src + '.png'))
    if size: im = im.resize(size, Image.LANCZOS)
    hasa = im.mode == 'RGBA' and im.getextrema()[3][0] < 255
    if not hasa: im = im.convert('RGB')
    im.save(os.path.join(OUT, dst), 'WEBP', quality=q, method=6)

T = by_tag['tex']
bgsrc = {1: [n for n in T if base(n) == 'w1'], 2: [n for n in T if base(n) == 'w2'], 3: [n for n in T if base(n) == 'w3']}
for w in (1, 2, 3):
    for n in bgsrc[w]:
        fn = T[n]; m = meta[fn]
        im = Image.open(os.path.join(EXT, 'sprite', fn + '.png'))
        if im.size[0] >= 2000: save(fn, 'bg/w%d_sky.webp' % w, (1536, 768), 80)
        else: save(fn, 'bg/w%d_ground.webp' % w, None, 88)
    save(T['w%d_hills' % w], 'bg/w%d_hills.webp' % w, (1536, 384), 82)
    save(T['w%d_meadow' % w], 'bg/w%d_meadow.webp' % w, None, 84)
for n in ['chapter_%d' % i for i in range(1, 8)]:
    save(T[n], 'ui/%s.webp' % n, (768, 256), 80)
for n in ('steal', 'trail', 'boss', 'home'):
    save(T[n], 'ui/story_%s.webp' % n, None, 82)
UI = ['icon_bomb', 'icon_booster', 'icon_calendar', 'icon_check', 'icon_chest', 'icon_close', 'icon_effects', 'icon_gear',
      'icon_gift', 'icon_goblin', 'icon_hammer', 'icon_haptics', 'icon_hint', 'icon_missions', 'icon_music', 'icon_pause',
      'icon_rainbow', 'icon_ribbon', 'icon_shop', 'icon_skull', 'icon_sound', 'icon_undo', 'icon_wish', 'icon_token',
      'lock', 'star', 'star_empty', 'coin', 'heart', 'ribbon_banner', 'hand_pointer', 'kitten_house', 'yarn_basket',
      'node_current', 'node_done', 'node_locked', 'node_boss_1709', 'node_hard_1786', 'check', *KITTENS,
      'pose_sit', 'pose_meow', 'pose_salute', 'pose_sleep_curl', 'pose_play_yarn', 'hero_photo_pose', 'hero_pet_kitten',
      'hero_sit_fence', 'cage']
for n in UI:
    if n not in T: print('ui missing', n); continue
    fn = T[n]; im = Image.open(os.path.join(EXT, 'sprite', fn + '.png')); w, h = im.size
    s = min(1.0, 200 / max(w, h)) if not n.startswith(('ribbon', 'hero_')) else min(1.0, 360 / max(w, h))
    save(fn, 'ui/%s.webp' % base(n), (round(w * s), round(h * s)), 88)
for n in ('seed_pouch', 'catnip', 'bubble_shield', 'yarn_bomb', 'pea_popper', 'rapid_purr', 'fan_spray', 'beam_whisker', 'spicy_fizz'):
    fn = by_tag['Items'][n]; im = Image.open(os.path.join(EXT, 'sprite', fn + '.png')); w, h = im.size
    s = min(1.0, 200 / max(w, h)); save(fn, 'ui/%s.webp' % n, (round(w * s), round(h * s)), 88)
fn = ctl['life_head']; save(fn, 'ui/life_head.webp', (192, 177), 88)
for n in ('goblin_armored', 'goblin_balloon', 'goblin_bomber', 'goblin_runner', 'goblin_shield', 'goblin_slinger', 'goblin_sniper', 'goblin_sprinter'):
    save(ctl[n], 'ui/%s.webp' % n, None, 88)

# audio -> mp3 (plays everywhere, including Chromium builds without AAC)
for f in sorted(glob.glob(os.path.join(EXT, 'audio', '*.m4a'))):
    name = os.path.basename(f)[:-4]
    music = name.startswith('music_')
    dst = os.path.join(OUT, 'audio', name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f, '-ac', '2' if music else '1',
                    '-b:a', '112k' if music else '80k', dst], check=True)

# stage data
stages = {}
idx = json.load(open(os.path.join(EXT, 'text', 'index.txt')))['stages']
def rnd(o):
    if isinstance(o, float): return round(o, 3)
    if isinstance(o, list): return [rnd(x) for x in o]
    if isinstance(o, dict): return {k: rnd(v) for k, v in o.items()}
    return o
for sid in idx:
    stages[sid] = rnd(json.load(open(os.path.join(EXT, 'text', sid + '.txt'))))
json.dump({'order': idx, 'stages': stages}, open(os.path.join(OUT, 'stages.json'), 'w'), separators=(',', ':'))
print('done')
