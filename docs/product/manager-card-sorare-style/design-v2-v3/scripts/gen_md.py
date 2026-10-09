# python3 gen_md.py  (in the folder holding selfcheck-final.json, extra-final.json, numcon-final.json, halo-final.json, jm/*-final.txt)
import json
R=json.load(open('selfcheck-final.json')); X=json.load(open('extra-final.json'))
N=json.load(open('numcon-final.json')); H=json.load(open('halo-final.json'))
L=["# Manager Card revision 3 with the critique and confirmer fixes: design self-check\n",
"Measured 2026-10-09 in Chromium 1194 (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) on `docs/product/manager-card-sorare-style/mock.html` as committed (file://, no dev server). Scripts in `scripts/` (`selfcheck.mjs`, `extra.mjs`, `numcon.mjs`, `halo.mjs`, `ov.mjs`, `tiltcheck.mjs`; the jersey critic's own scripts in `scripts/critic-jersey/`). DPR 2, `reducedMotion: reduce` unless stated. « rev 3 » below = the revision 3 mock before the critique (commit `2f2f487d`); « rev 3b » = this commit (revision 3 with the critique fixes and the confirmer's two fixes, plan §16.2).\n",
"## Console messages\n"]
for k,v in R['console'].items(): L.append(f"- {k} px: {len(v)} errors or warnings")
L.append("\n## Overflow (element rectangles of every `body *`, SVG descendants included)\n")
L.append("| theme, width | viewport | max right | min left | first escaping | card text outside its card |\n|---|---|---|---|---|---|")
for k,v in R['overflow'].items(): L.append(f"| {k} | {v['vw']} | {v['maxRight']} | {v['minLeft']} | {v['firstEscaping'] or 'none'} | {len(v['textOutsideCard'])} |")
L.append("\n`ov.mjs` on the same file also reports `scrollWidth` = the viewport at 320, 390 and 1440 in both themes.\n")
L.append("## The number inside the chest box (pixel scan, 1 viewBox unit = 1 px)\n")
L.append("| OVR | font size | ink box (jersey space) | ink box (card space) | inside chest box | inside shirt |\n|---|---|---|---|---|---|")
for n in R['number']: L.append(f"| {n['ovr']} | {n['size'] or 220} | {n['ink_jersey']} | {n['ink_card']} | {n['insideBox']} | {n['insideShirt']} |")
L.append("\n## Tokens: the number's ink in CSS px (club RAJA, PRO)\n")
L.append("| OVR | 80 px | 64 px | 48 px | 32 px |\n|---|---|---|---|---|")
by={}
for t in R['tokens32']: by.setdefault(t['ovr'],{})[t['size']]=t
for o,d in by.items(): L.append(f"| {o} | " + " | ".join(f"{d[s]['inkHeightPx']} h x {d[s]['inkWidthPx']} w" for s in [80,64,48,32]) + " |")
L.append("\nTargets (critique): two digits ≥ 14 / 12 / 10 / 7 CSS px tall at 80 / 64 / 48 / 32. The number now grows with the token.\n")
L.append("## Contrast from rasterised pixels (`selfcheck.mjs`)\n")
L.append("Method as in revision 3 (text shot vs the same shot with the element hidden; `bbox` = median background in the element's rectangle, `ring` = unchanged pixels within 3 device px of the glyphs). Rows now cover the main, Arabic, long-name and G4 rows (in the G4 row, the first card of each tier: the 200 px pair, the 160 px Arabic pair and the 136 px pair). For the number and « OVR » this method reads the twill or the halo as the text on dark-on-light prints, so their direct readings are in the next table.\n")
L.append("| page, pose | kind | n | min bbox median | min ring median |\n|---|---|---|---|---|")
for c in R['contrast']:
    for kind in ['name','tier','statValue','statLabel','meta']:
        rs=[r for r in c['rows'] if r['kind']==kind]
        if not rs: continue
        m=min(rs,key=lambda r:r['median']); rm=min(rs,key=lambda r:r['ringMedian'] or 99)
        L.append(f"| {c['theme']}, {c['pose']} | {kind} | {len(rs)} | {m['median']} ({m['sec']} {m['tier']} {m['text']}) | {rm['ringMedian']} ({rm['sec']} {rm['tier']} {rm['text']}) |")
L.append("\n## The number and « OVR » against the shirt (`numcon.mjs`, `halo.mjs`)\n")
L.append("Fill pixels located by repainting the fill magenta (overlays above it hidden); background = the same pixels with the whole number layer hidden. Dark page, rest.\n")
L.append("| row | tier | number fill vs shirt | « OVR » fill vs shirt |\n|---|---|---|---|")
rows={}
for r in N: rows.setdefault((r['sec'],r['tier'],r['label']),{})[r['kind']]=r['fillVsShirt']
for (sec,tier,lab),v in rows.items(): L.append(f"| {sec} | {tier} | {v.get('number','—')} | {v.get('ovrLabel','—')} |")
L.append(f"\n« OVR » fill against its own halo: min {min(x['fillVsHalo'] for x in H)} over {len(H)} cards. White on Raja green (#0a8f3a) cannot exceed 4.2:1, so the halo carries the 4.5:1.\n")
L.append("## Forming marks (base card, in the plaque under the shield's point; 296 px card)\n")
L.append("| mark | bright part vs plaque | dark part vs plaque | width × height CSS px |\n|---|---|---|---|")
for p in X['pips']: L.append(f"| {p['state']} | {p['brightPartVsPlaque']} | {p['darkPartVsPlaque']} | {p['widthCssPx']} × {p['heightCssPx']} |")
L.append("\nFilled mark: the cream fill against the plaque. Empty mark: its cream ring against the plaque (the dark part is the mark's own interior, close to the plaque by design).\n")
L.append("## Name block balance (viewBox units; DOM ink at the drawn size, `extra.mjs`)\n")
L.append("Shield point y 1056, plaque 1070–1142, rule y 1404.\n")
L.append("| card | plaque | name ink | point → name | plaque → name | name → rule |\n|---|---|---|---|---|---|")
for b in X['balance']: L.append(f"| {b['label']} | {b['plaque']} | {b['nameInk'][0]}–{b['nameInk'][1]} | {b['pointToName']} | {b['plaqueToName'] if b['plaqueToName'] is not None else '—'} | {b['nameToRule']} |")
L.append("## Layout (viewBox units, `extra.mjs`)\n")
L.append("| row | tier | dir | name lines (size: ink top–bottom) | ink to rule | gap between lines | below plaque/point | stat centres' mean x | capsule clearance |\n|---|---|---|---|---|---|---|---|---|")
for r in X['layout']:
    nm="; ".join(f"{n['t'][:16]} {n['size']}: {n['top']}–{n['bottom']}" for n in r['name'])
    L.append(f"| {r['sec']} | {r['tier']} | {r['dir']} | {nm} | {r['nameLastToRule']} | {r['lineGap'] if r['lineGap'] is not None else '—'} | {r['fromTop']} | {r['statCentreMean']} | {r['capsuleClearance'] if r['capsuleClearance'] is not None else '—'} |")
L.append("\n## Crispness and depth\n")
t=X['transformsReduced']
L.append(f"- At rest under reduced motion: `.mc-eclat__tilt` transform `{t['tilt']}`, `transform-style: {t['style']}`, frame layer `{t['frame']}`, first rim `{t['rim1']}` (the 2D thickness).")
L.append("- Motion allowed (`tiltcheck.mjs`, LEGEND): rest `none` → pointer over the card `matrix3d(…)`, `--mc-t` 1, `preserve-3d` → 150 ms after leaving `--mc-t` ≈ .01 → after the settle `none`, `flat`; `document.getAnimations()` 0.")
L.append("- Mean luminance step across the name's glyph edges (PRO « ALI », motion allowed, no pointer) against the same page with every transform removed:\n")
L.append("| file, DPR | at rest | flat |\n|---|---|---|")
for k,v in X['sharp'].items(): L.append(f"| {k} | {v['rest']} | {v['flat']} |")
L.append("\n## G4 (face-à-face) at 200, 160 and 136 px: every remaining text run, CSS px\n")
L.append("Font size × the card's rendered width ÷ 1000, after `fit()`. The 136 px pair is the 320 px viewport case ((320 − 48) ÷ 2 in the mock; the app's sheet gives 138).\n")
for c in X['g4']: L.append(f"- **{c['w']} px** (min {min(x['px'] for x in c['runs'])}): " + ", ".join(f"{x['t']} {x['px']}" for x in c['runs']))
L.append("\n## Background texture (Sobel on background-only regions: top band, both sides below the sleeves, under the hem; % of pixels)\n")
L.append("| tier | rev 2 strong / fine | rev 3 strong / fine | rev 3b strong / fine |\n|---|---|---|---|")
for a,b,c in zip(X['texture']['rev2'],X['texture']['rev3'],X['texture']['rev3b']):
    L.append(f"| {a['tier']} | {a['strongPct']} / {a['finePct']} | {b['strongPct']} / {b['finePct']} | {c['strongPct']} / {c['finePct']} |")
L.append("\nThresholds: strong > 120, fine 24–120 (Sobel magnitude on 0–255 grey). This is not the hierarchy critic's script (not kept), so compare columns, not their numbers.\n")
L.append("## The jersey critic's scripts, re-run (`scripts/critic-jersey/`, 900 px card at DPR 2, flat pose)\n")
for f,t in [('meas-final.txt','Shirt layer: body colour and spread (`meas.py`)'),('sep-final.txt','Shirt edge against the field (`sep.py`; the « L shoulder » probe sits above the shoulder line and samples field against field)'),('field-final.txt','Field colour (`field.py`)'),('band-final.txt','Frame band profiles (`band.py`)')]:
    L.append(f"### {t}\n\n```\n"+open('jm/'+f).read().strip()+"\n```\n")
L.append("## Clutter: drawn elements per full card (outside defs, masks, patterns, clip paths; rims excluded)\n")
L.append("| tier | rev 2 | rev 3 | rev 3b | rev 2 → 3b | rev 3b markup bytes |\n|---|---|---|---|---|---|")
for a,b,c in zip(R['counts']['rev2'],R['counts']['rev3'],R['counts']['rev3b']):
    L.append(f"| {a['tier']} | {a['drawn']} | {b['drawn']} | {c['drawn']} | {round(100*(c['drawn']-a['drawn'])/a['drawn'])} % | {c['bytes']} |")
L.append("""
## Not run

This is a design step: no app code exists for revision 3, so `bun test`, typecheck, lint, build, the gates and the e2e suites were not run. The pointer-sweep frame timing (`perf.mjs`) was not re-run after the critique fixes. No database, Docker or network service was touched.
""")
open('SELFCHECK.md','w').write("\n".join(L)+"\n")
