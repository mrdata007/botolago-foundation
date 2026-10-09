"""Keeps the pictures of this folder small: each PNG is rewritten with an adaptive 256-colour palette
(no dithering), visually the same for these screens and about a quarter of the size.

    python3 docs/product/manager-card-section/wp6b/shrink-pictures.py [folder ...]

With no argument it shrinks every PNG under this folder. Every measurement in INDEX.md was taken on
the live page, not on these files."""

import sys
from pathlib import Path

from PIL import Image

roots = [Path(arg) for arg in sys.argv[1:]] or [Path(__file__).parent]
before = after = count = 0
for root in roots:
    for path in sorted(root.rglob("*.png")):
        size = path.stat().st_size
        Image.open(path).convert("RGB").quantize(
            colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE
        ).save(path, "PNG", optimize=True)
        before += size
        after += path.stat().st_size
        count += 1
print(f"{count} pictures, {before / 1e6:.2f} MB to {after / 1e6:.2f} MB", file=sys.stderr)
