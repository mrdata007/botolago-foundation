"""Turns the PNG pictures the capture scripts write into the WebP files this folder commits.

    python3 docs/product/manager-card-sorare-style/before/to-webp.py <png folder> <webp folder> [--quality 92] [--names <file>]

`--names` is a text file with one picture name per line (the output of `capture-before.mjs --list`):
only those pictures are converted, so a scratch folder holding extra or older PNGs gives no stray files.

The PNGs of the full set come to well over the 40 MB the brief allows for PNG (780 x 1688 pictures of a
knitted card are 0.3 to 0.9 MB each), so the committed set is WebP at one quality, with the file name's
stem unchanged. Pictures are never resized. The PNGs stay out of the repository: they are what the
capture scripts write, and re-running them gives them again. The after set is saved the same way, so
a before/after pair is two WebP files with one name.
"""

import sys
from pathlib import Path

from PIL import Image

argv = sys.argv[1:]
quality = 92
names = None
if "--quality" in argv:
    at = argv.index("--quality")
    quality = int(argv[at + 1])
    del argv[at : at + 2]
if "--names" in argv:
    at = argv.index("--names")
    names = {line.strip() for line in Path(argv[at + 1]).read_text().splitlines() if line.strip()}
    del argv[at : at + 2]
args = [a for a in argv if not a.startswith("--")]
if len(args) != 2:
    sys.exit(__doc__)
source, target = Path(args[0]), Path(args[1])
target.mkdir(parents=True, exist_ok=True)

before = after = count = 0
for path in sorted(source.glob("*.png")):
    if names is not None and path.stem not in names:
        continue
    destination = target / f"{path.stem}.webp"
    Image.open(path).convert("RGB").save(destination, "WEBP", quality=quality, method=6)
    before += path.stat().st_size
    after += destination.stat().st_size
    count += 1
print(f"{count} pictures, PNG {before / 1e6:.1f} MB, WebP q{quality} {after / 1e6:.1f} MB", file=sys.stderr)
