"""Keeps the folder of pictures small: each PNG is rewritten with an adaptive 256-colour palette
(no dithering), which is visually the same for these screens and a quarter of the size. Run after
`capture.mjs`:  python3 docs/product/manager-card-section/wp3/shrink-pictures.py

Every measurement in INDEX.md was taken on the live page, not on these files."""

import sys
from pathlib import Path

from PIL import Image

folder = Path(__file__).parent
before = after = 0
for path in sorted(folder.glob("*.png")):
    size = path.stat().st_size
    image = Image.open(path).convert("RGB")
    image.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(
        path, "PNG", optimize=True
    )
    before += size
    after += path.stat().st_size
print(f"{len(list(folder.glob('*.png')))} pictures, {before / 1e6:.1f} MB to {after / 1e6:.1f} MB", file=sys.stderr)
