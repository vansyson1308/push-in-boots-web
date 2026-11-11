#!/usr/bin/env python3
"""Extracts art, audio and stage data from the Unity web build so that build_assets.py can repack them.

Usage : python3 tools/extract_unity.py <dir with Web.data.unityweb> <out_dir>
        (the last Unity build is in git history: git archive 7f99c06 Build | tar -x -C /tmp)
Needs : pip install UnityPy brotli pillow
Then  : python3 tools/build_assets.py <out_dir>
"""
import os, sys, json
import brotli, UnityPy

src, out = sys.argv[1], sys.argv[2]
for d in ('text', 'audio', 'sprite'):
    os.makedirs(os.path.join(out, d), exist_ok=True)

raw = open(os.path.join(src, 'Web.data.unityweb'), 'rb').read()
try:
    raw = brotli.decompress(raw)          # "UnityWeb Compressed Content (brotli)"
except brotli.error:
    pass                                   # already uncompressed
data_path = os.path.join(out, 'Web.data')
open(data_path, 'wb').write(raw)

env = UnityPy.load(data_path)
seen, meta = set(), {}
for o in env.objects:
    t = o.type.name
    try:
        if t == 'TextAsset':
            d = o.read(); s = d.m_Script
            b = s.encode('utf-8', 'surrogateescape') if isinstance(s, str) else bytes(s)
            open(os.path.join(out, 'text', d.m_Name + '.txt'), 'wb').write(b)
        elif t == 'AudioClip':
            for name, samples in o.read().samples.items():
                open(os.path.join(out, 'audio', name), 'wb').write(samples)
        elif t == 'Sprite':
            d = o.read(); n = d.m_Name
            fn = n if n not in seen else f'{n}_{o.path_id}'   # same name in several atlases: keep them apart
            seen.add(n)
            d.image.save(os.path.join(out, 'sprite', fn + '.png'))
            tag = ''
            try:
                a = d.m_SpriteAtlas
                if a: tag = a.read().m_Name
            except Exception:
                pass
            if not tag:
                try: tag = 'tex:' + d.m_RD.texture.read().m_Name
                except Exception: tag = '?'
            r = d.m_Rect
            meta[fn] = {'tag': tag, 'ppu': d.m_PixelsToUnits, 'pivot': [round(d.m_Pivot.x, 3), round(d.m_Pivot.y, 3)], 'w': round(r.width), 'h': round(r.height)}
    except Exception as e:
        print('skipped', t, e, file=sys.stderr)
json.dump(meta, open(os.path.join(out, 'spritemeta.json'), 'w'))
print(len(meta), 'sprites extracted to', out)
