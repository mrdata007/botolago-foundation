"""Writes the file tables of `before/INDEX.md` from what is in this folder, so the index cannot drift
from the pictures. The prose of INDEX.md lives in `index-header.md` and `index-footer.md` (next to this file); this
script puts between them the list of screens with their file counts, the problems the capture logged
and the full file list.

    python3 docs/product/manager-card-sorare-style/before/build-index.py

Reads: every `*.webp` / `*.png` in this folder and `switch-off/`, `capture-log.json` and
`capture-log-gallery.json` (console errors and failed requests seen while capturing).
Writes: `INDEX.md`.
"""

import json
import re
from collections import OrderedDict, defaultdict
from pathlib import Path

here = Path(__file__).parent

# screen id -> (what it is, how it is reached). Order is the order of the index.
SCREENS = OrderedDict(
    [
        ("g1", ("G1, Gradins home (stage, rating line, blocks)", "`/gradins?mc=<fixture>` signed in; a hero, if one arrives, is dismissed first, so the stage's card is what is shown")),
        ("hero", ("M4 hero: the card as a moment hands it over", "`/gradins?mc=<fixture>` signed in, as it arrives (first rating, tier up, founder, season closed, returning, launch)")),
        ("born", ("M2 born panel on G1", "`/gradins?mc=born0Serial`")),
        ("teamBorn", ("M2 born panel on the team page", "`/fantasy/team?mc=born0Serial`")),
        ("g1People", ("G1 lower down: « Les vôtres » (rows with 28 px tokens)", "`/gradins?mc=rated`, hero dismissed, the people block at the top of the frame")),
        ("g1Club", ("G1 lower down: « Votre club » (the club's mates)", "same, the club block")),
        ("g1Seasons", ("G1 lower down: « Vos saisons » (the season's token)", "same, the seasons block")),
        ("g1GuestPoints", ("The signed-out page's four points (24 px minis)", "`/gradins` signed out, scrolled to the points")),
        ("g2", ("G2, « Votre carte » (the card page, its numbers)", "`/gradins/carte?mc=<fixture>`, top of the page")),
        ("g2Ladder", ("G2, the five-step tier ladder in frame", "`/gradins/carte?mc=rated`, the ladder scrolled to the middle")),
        ("g2Founder", ("G2, the founder block in frame", "`/gradins/carte?mc=founder`, the block scrolled to the middle")),
        ("g3", ("G3, « Les vôtres » (league band with minis, rows with tokens)", "`/gradins/les-votres?mc=rated`")),
        ("g4", ("G4, « Face à face » (two full cards)", "`/gradins/les-votres?mc=rated`, the first row that is not mine opened")),
        ("g6", ("G6, the seasons (the rack)", "`/gradins/saisons?mc=<fixture>`")),
        ("replay", ("The replay sheet", "`/gradins/carte?mc=<fixture>`, « Revoir », first item")),
        ("share", ("The share sheet (card picture, message, buttons)", "`/gradins?mc=<fixture>`, hero dismissed, « Partager »")),
        ("picture", ("The share picture itself, 1080 x 1920", "the image of the share sheet, saved from its blob URL")),
        ("setup-name", ("Profile setup, step 1: the card's token beside the typed name", "`/auth/profile-setup?next=/fantasy/create`, new account, a name typed")),
        ("setup-club", ("Profile setup, step 2: a club tapped, the token takes its colours", "same, « Suivant », the third club")),
        ("profile-delete", ("The account-deletion dialog's card line (text only)", "`/profile?mc=rated`, « Supprimer mon compte »")),
        ("hub-guest-intro", ("Fantasy hub, the guest's intro card point", "`/fantasy`, signed out")),
        ("hub-owner", ("Fantasy hub, the card block (80 px token)", "`/fantasy?mc=<fixture>` signed in")),
        ("create-name-guest", ("Team builder, name step, the save line (visitor)", "`/fantasy/create`, squad filled, « Suivant »")),
        ("create-name-signedin", ("Team builder, name step, the save line (signed in)", "same, signed in with no team")),
        ("create-name-return", ("Team builder, back from sign-up (M1c)", "same, draft taken over by the new account")),
        ("team-born", ("Team page, the born panel (Fantasy)", "`/fantasy/team?mc=born0`")),
        ("rankings-token", ("Fantasy rankings, the row's token", "`/fantasy/rankings?mc=<fixture>`")),
        ("hint-cap", ("Hint on the captain's tile (CAP)", "`/fantasy/team?mc=forming1`, a player tapped")),
        ("hint-sel", ("Hint on the starting-eleven choice (SEL)", "`/fantasy/team?mc=forming1`, « Remplacer »")),
        ("hint-trf", ("Hint on transfers (TRF)", "`/fantasy/transfers?mc=forming1`")),
        ("first-transfer-line", ("The first-transfer line", "`/fantasy/transfers?mc=insufficient3`, one transfer made, « Suivant »")),
        ("league-band", ("Fantasy league page, the card band with minis", "`/fantasy/leagues/lg1?mc=rated`")),
        ("gallery-full-tiers", ("Gallery: the six tiers, full card at 264 px", "`capture-gallery.mjs`")),
        ("gallery-full-states", ("Gallery: forming, founder, long Latin name, Arabic name, no club, unnamed guest", "`capture-gallery.mjs`")),
        ("gallery-tokens", ("Gallery: 80, 64, 56, 44, 32, 28, 24 px for eight profiles", "`capture-gallery.mjs`")),
    ]
)

NAME = re.compile(r"^(?P<screen>.+?)-(?P<fixture>[A-Za-z0-9]+)-(?P<lang>fr|ar)-(?P<theme>light|dark)-(?P<width>\d+)\.(png|webp)$")
GALLERY = re.compile(r"^(?P<screen>gallery-(?:full-(?:tiers|states)|tokens))-(?P<lang>fr|ar)-(?P<theme>light|dark)-(?P<width>\d+)\.(png|webp)$")

pictures = sorted(p for p in here.iterdir() if p.suffix in (".png", ".webp"))
by_screen = defaultdict(list)
unmatched = []
for path in pictures:
    gallery = GALLERY.match(path.name)
    match = NAME.match(path.name)
    if gallery:
        by_screen[gallery["screen"]].append((path, "-", gallery))
    elif match:
        by_screen[match["screen"]].append((path, match["fixture"], match))
    else:
        unmatched.append(path.name)

out = []
header = (here / "index-header.md").read_text()
out.append(header.rstrip() + "\n")

out.append("\n## What is here\n")
out.append("| Screen | What it is | How it is reached | Fixtures | Pictures |")
out.append("| ------ | ---------- | ----------------- | -------- | -------: |")
total = 0
for screen, (what, how) in SCREENS.items():
    items = by_screen.get(screen, [])
    if not items:
        continue
    fixtures = sorted({fx for _, fx, _ in items if fx != "-"})
    total += len(items)
    out.append(f"| `{screen}` | {what} | {how} | {', '.join(f'`{f}`' for f in fixtures) or '-'} | {len(items)} |")
missing = [s for s in by_screen if s not in SCREENS]
out.append(f"| | **Total** | | | **{total}** |")
if missing or unmatched:
    out.append(f"\nNot in the table above: {missing} {unmatched}")

size = sum(p.stat().st_size for p in pictures)
out.append(f"\nPictures in this folder: {len(pictures)}, {size / 1e6:.1f} MB.\n")

off = here / "switch-off"
if off.exists():
    files = sorted(off.glob("*.png")) + sorted(off.glob("*.webp"))
    pages = [f for f in files if not f.name.startswith("nav-")]
    navs = [f for f in files if f.name.startswith("nav-")]
    out.append(
        f"Switch-off set (`switch-off/`): {len(pages)} page pictures, {len(navs)} navigation-bar crops, "
        f"{sum(f.stat().st_size for f in files) / 1e6:.1f} MB; plus `report.json` (the HTML the script also writes is not committed, see the end of this page).\n"
    )

# Problems seen while capturing.
problems = []
for log_name in ("capture-log.json", "capture-log-gallery.json"):
    log_path = here / log_name
    if not log_path.exists():
        continue
    data = json.loads(log_path.read_text())
    failed = data.get("failed", [])
    for record in data.get("pictures", []):
        for problem in record.get("problems", []):
            problems.append((record["name"], problem))
    for item in failed:
        problems.append((item["name"], f"FAILED: {item['error']}"))
out.append("\n## Problems seen while capturing\n")
if problems:
    out.append("| Picture | What the page logged |")
    out.append("| ------- | -------------------- |")
    for name, problem in problems:
        out.append(f"| `{name}` | `{problem.replace('|', '/')}` |")
else:
    out.append("None: no console error, page error, failed request or HTTP status of 400 or more on any picture.\n")

out.append("\n## Every file\n")
for screen in SCREENS:
    items = by_screen.get(screen, [])
    if not items:
        continue
    out.append(f"\n### `{screen}` ({len(items)})\n")
    out.append(", ".join(f"`{p.name}`" for p, _, _ in items))
    out.append("")

footer = here / "index-footer.md"
if footer.exists():
    out.append("\n" + footer.read_text().rstrip() + "\n")

(here / "INDEX.md").write_text("\n".join(out) + "\n")
print(f"INDEX.md: {total} pictures in {len(by_screen)} screens, {len(problems)} problems listed")
