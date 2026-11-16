#!/usr/bin/env python3
"""Shrink the demo screenshots in docs/images (needs Pillow).

UI screenshots become 256-colour palette PNGs (about 60% smaller, no visible difference on the flat dark UI).
hero.png and scout.png keep full colour: their gradients would band. Usage: python3 scripts/demo/optimize.py [DIR]
"""
import io
import os
import sys

from PIL import Image

KEEP_FULL_COLOUR = {'hero.png', 'scout.png'}


def main(folder):
    for name in sorted(os.listdir(folder)):
        if not name.endswith('.png') or name.startswith('.'):
            continue
        path = os.path.join(folder, name)
        before = os.path.getsize(path)
        im = Image.open(path).convert('RGB')
        if name in KEEP_FULL_COLOUR:
            out = im
        else:
            out = im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
        buf = io.BytesIO()
        out.save(buf, 'PNG', optimize=True)
        if buf.tell() < before:
            with open(path, 'wb') as f:
                f.write(buf.getvalue())
        print(f'{name:32} {before // 1024:5} KB -> {os.path.getsize(path) // 1024:5} KB')


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', '..', 'docs', 'images'))
