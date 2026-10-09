"""Before / after comparison sheets of the app (WP4): every surface of the brief's list, French and
Arabic side by side, the incumbent card (`../before/`, `main` 8fae526c) against the collectible
(`../after/`, this branch), name for name.

    python3 docs/product/manager-card-sorare-style/wp4/compare.py [--out docs/product/manager-card-sorare-style/compare]

A sheet is one surface in one state, one theme and one width:
  390 wide pictures (780 x 1688 files, shown at 1x): four columns, FR before | FR after | AR before | AR after
  1440 wide pictures (1440 x 900 files, shown at 0.55): two rows, FR then AR, before | after
  the 1080 x 1920 share picture (shown at 0.36): four columns as for 390
Each file is `<screen>-<fixture>-<theme>-<width>.webp` (WebP quality 80). `compare/INDEX.md` lists them.
Nothing is resized in the sets themselves; only these sheets are scaled.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent.parent
before_dir = root / "before"
after_dir = root / "after"
args = sys.argv[1:]
out = Path(args[args.index("--out") + 1]) if "--out" in args else root / "compare"
out.mkdir(parents=True, exist_ok=True)

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
BEFORE_LABEL = "BEFORE  main 8fae526c  (Écharpe)"
AFTER_LABEL = "AFTER  claude/manager-card-sorare-style 5e903f60  (Éclat)"

# (screen, fixtures) pairs; every sheet of a group is made for each theme and width that both sets hold
SURFACES = [
    ("g1", ["rated", "forming1", "founder", "legend", "homa", "clubNull", "guest", "guestTryOn"]),
    ("g2", ["rated", "founder"]),
    ("g2Ladder", ["rated"]),
    ("g2Founder", ["founder"]),
    ("g4", ["rated"]),
    ("replay", ["founder", "returning"]),
    ("hero", ["rated", "legend", "founder", "tierUp"]),
    ("hub-owner", ["rated", "homa", "legend", "forming1"]),
    ("rankings-token", ["rated", "forming1"]),
    ("league-band", ["rated"]),
    ("share", ["rated", "founder", "legend"]),
    ("picture", ["rated", "legend", "founder", "homa", "longNameLatin", "arabicName", "clubNull"]),
]
TITLES = {
    "g1": "G1 Gradins home (the stage)",
    "g2": "G2 Votre carte",
    "g2Ladder": "G2 the tier ladder",
    "g2Founder": "G2 the founder block",
    "g4": "G4 Face à face",
    "replay": "The replay sheet",
    "hero": "M4 hero",
    "hub-owner": "Fantasy hub, the card block",
    "rankings-token": "Fantasy rankings, the row's token",
    "league-band": "Fantasy league, the card band with minis",
    "share": "The share sheet",
    "picture": "The share picture (1080 x 1920)",
}


def name(screen, fixture, lang, theme, width):
    return f"{screen}-{fixture}-{lang}-{theme}-{width}"


def load(folder, stem):
    path = folder / f"{stem}.webp"
    return Image.open(path).convert("RGB") if path.exists() else None


def scaled(im, factor):
    return im.resize((round(im.width * factor), round(im.height * factor)), Image.LANCZOS)


def label(draw, xy, text, size=15, bold=False, fill=(235, 238, 244)):
    draw.text(xy, text, font=ImageFont.truetype(BOLD if bold else FONT, size), fill=fill)


def sheet(title, subtitle, cells, columns, footer=None):
    """cells: list of (heading, image); laid out `columns` per row on a dark page."""
    pad, gap, head = 20, 16, 74
    rows = [cells[i : i + columns] for i in range(0, len(cells), columns)]
    col_w = max(im.width for _, im in cells)
    row_h = [max(im.height for _, im in r) + 28 for r in rows]
    width = pad * 2 + columns * col_w + (columns - 1) * gap
    height = head + sum(row_h) + (len(rows) - 1) * gap + pad + (24 if footer else 0)
    page = Image.new("RGB", (width, height), (20, 24, 34))
    d = ImageDraw.Draw(page)
    label(d, (pad, 14), title, 22, True)
    label(d, (pad, 46), subtitle, 14, fill=(160, 170, 188))
    y = head
    for r, h in zip(rows, row_h):
        x = pad
        for heading, im in r:
            label(d, (x, y), heading, 14, True, (214, 220, 232))
            page.paste(im, (x, y + 24))
            x += col_w + gap
        y += h + gap
    if footer:
        label(d, (pad, height - 26), footer, 12, fill=(120, 130, 148))
    return page


made = []
for screen, fixtures in SURFACES:
    for fixture in fixtures:
        for theme in ("light", "dark"):
            for width in (390, 1440, 1080):
                stems = {lang: name(screen, fixture, lang, theme, width) for lang in ("fr", "ar")}
                pics = {}
                for lang, stem in stems.items():
                    b, a = load(before_dir, stem), load(after_dir, stem)
                    if b is None or a is None:
                        break
                    pics[lang] = (b, a)
                else:
                    if width == 1440:
                        f = 0.55
                        cells = []
                        for lang in ("fr", "ar"):
                            b, a = pics[lang]
                            cells += [(f"{lang.upper()}  {BEFORE_LABEL}", scaled(b, f)), (f"{lang.upper()}  {AFTER_LABEL}", scaled(a, f))]
                        columns = 2
                    else:
                        f = 0.5 if width == 390 else 0.36
                        cells = []
                        for lang in ("fr", "ar"):
                            b, a = pics[lang]
                            cells += [(f"{lang.upper()}  BEFORE (main)", scaled(b, f)), (f"{lang.upper()}  AFTER (branch)", scaled(a, f))]
                        columns = 4
                    shown = "1080 x 1920 picture" if width == 1080 else f"{width} px wide"
                    title = f"{TITLES[screen]} · {fixture} · {theme} · {shown}"
                    subtitle = f"{BEFORE_LABEL}   |   {AFTER_LABEL}   |   same state, same data, same clock, reduced motion"
                    page = sheet(title, subtitle, cells, columns)
                    file = out / f"{screen}-{fixture}-{theme}-{width}.webp"
                    page.save(file, "WEBP", quality=80, method=6)
                    made.append((screen, fixture, theme, width, file.name, file.stat().st_size))

total = sum(m[-1] for m in made)
print(f"{len(made)} sheets, {total / 1e6:.1f} MB", file=sys.stderr)
lines = [
    "# Before / after comparison sheets (the app)",
    "",
    "The incumbent card (the Écharpe, `main` at `8fae526c`, [`../before/`](../before/INDEX.md)) beside the collectible",
    "(Éclat, this branch at `5e903f60`, [`../after/`](../after/INDEX.md)): the same surface, state, data, clock and theme, French and Arabic.",
    "Each sheet is made from the two sets' pictures of one name (`<screen>-<fixture>-<lang>-<theme>-<width>`); only the sheet is scaled",
    "(390 px pictures at 1x of their 2x files, 1440 px pictures at 0.55, the 1080 px share picture at 0.36). The sets themselves are not resized.",
    "Made by [`../wp4/compare.py`](../wp4/compare.py).",
    "",
    "The design preview's own before/after (revision 2 against revision 3 of `mock.html`) is in",
    "[`../design-v2-v3/compare/`](../design-v2-v3/compare/), described in [`../design-v2-v3/INDEX.md`](../design-v2-v3/INDEX.md).",
    "",
    f"{len(made)} sheets, {total / 1e6:.1f} MB.",
    "",
]
current = None
for screen, fixture, theme, width, file, size in made:
    if screen != current:
        lines += ["", f"## {TITLES[screen]} (`{screen}`)", "", "| Fixture | Theme | Width | Sheet | KB |", "| --- | --- | --- | --- | ---: |"]
        current = screen
    lines.append(f"| `{fixture}` | {theme} | {width} | [`{file}`]({file}) | {size // 1000} |")
(out / "INDEX.md").write_text("\n".join(lines) + "\n")
