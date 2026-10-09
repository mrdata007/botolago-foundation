import json
R=json.load(open('selfcheck.json'))
L=["# Manager Card revision 3: design self-check\n",
"Measured 2026-10-09 in Chromium 1194 (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) on `docs/product/manager-card-sorare-style/mock.html` as committed (file://, no dev server), script `scratchpad/v3/selfcheck.mjs`, raw output `selfcheck.json`. DPR 2, `reducedMotion: reduce` unless stated.\n",
"## Console errors\n"]
for k,v in R['console'].items(): L.append(f"- {k} px: {len(v)} errors")
L.append("\n## Overflow (element rectangles of every `body *`, SVG descendants included)\n")
L.append("| theme, width | viewport | max right | min left | first escaping | card text outside its card | name lines outside x 100-900 |\n|---|---|---|---|---|---|---|")
for k,v in R['overflow'].items(): L.append(f"| {k} | {v['vw']} | {v['maxRight']} | {v['minLeft']} | {v['firstEscaping'] or 'none'} | {len(v['textOutsideCard'])} | {len(v['nameOutsideBudget'])} of {v['names']} |")
L.append("\n## The number inside the chest box (pixel scan, 1 viewBox unit = 1 px)\n")
L.append("Number group rendered alone in red (fill, twill and outer outline), bounding box of the red pixels. Box in jersey space x 336-664, y 476-796 (dash: 380-620 x 556-644); card space = 1.12 x - 60, 1.12 y - 86. `inside shirt` = all four corners of the ink box pass `isPointInFill` on the shirt path.\n")
L.append("| OVR | font size | ink box (jersey space) | ink box (card space) | inside chest box | inside shirt |\n|---|---|---|---|---|---|")
for n in R['number']: L.append(f"| {n['ovr']} | {n['size'] or 220} | {n['ink_jersey']} | {n['ink_card']} | {n['insideBox']} | {n['insideShirt']} |")
L.append("\n## Tokens: the number's ink size in CSS px (club RAJA, PRO)\n")
L.append("| OVR | 80 px | 64 px | 48 px | 32 px |\n|---|---|---|---|---|")
by={}
for t in R['tokens32']: by.setdefault(t['ovr'],{})[t['size']]=t
for o,d in by.items(): L.append(f"| {o} | " + " | ".join(f"{d[s]['inkHeightPx']} h x {d[s]['inkWidthPx']} w" for s in [80,64,48,32]) + " |")
L.append("\nAt 32 px (card 20 px wide) two digits are 7.4-8.9 CSS px tall (14.8-17.7 device px at DPR 2) and 14.5-14.7 px wide; one digit is 15.1 px tall. See `design-v2-v3/after/tokens-*.png`.\n")
L.append("## Contrast from rasterised pixels\n")
L.append("Each text element screenshotted twice at DPR 2 (as drawn, then with that element hidden; for the OVR the whole number layer hidden, so the background is the shirt under it). Text colour = median luminance of the 4 % of pixels that change most. Background two ways: `bbox` = median of the hidden shot inside the element's rectangle; `ring` = median of unchanged pixels within 3 device px of the glyphs. `ring p5` = the 5th-percentile ring pixel closest to the text luminance; for names and the tier word that ring also reaches the other name line and the plaque's metal rim, so it is a floor, not a reading. For the OVR the ring is the number's own outline (twill), not the shirt, so the shirt reading is `bbox`. Pointer poses: motion on, the pointer held over the name / over the number of each card in turn (sheen and, on CHAMPION and LEGEND, the diffraction centred there).\n")
L.append("| page, pose | kind | n | min bbox median | min ring median | min ring p5 |\n|---|---|---|---|---|---|")
for c in R['contrast']:
    for kind in ['name','tier','statValue','statLabel','ovr']:
        rs=[r for r in c['rows'] if r['kind']==kind]
        m=min(rs,key=lambda r:r['median']); rm=min(rs,key=lambda r:r['ringMedian']); rw=min(rs,key=lambda r:r['ringWorst5'])
        L.append(f"| {c['theme']}, {c['pose']} | {kind} | {len(rs)} | {m['median']} ({m['tier']} {m['text']}) | {rm['ringMedian']} ({rm['tier']} {rm['text']}) | {rw['ringWorst5']} ({rw['tier']} {rw['text']}) |")
L.append("\nFloors: names, tier word, stat values and stat labels at stage size are small text (4.5:1); the number is large text and a graphic (3:1 against the shirt). Every median meets its floor in every pose. Lowest: stat labels 4.88 (ring, pointer over the number), OVR 3.35 against the shirt (CHAMPION 91 on Raja green, Arabic interface).\n")
L.append("## Clutter: drawn elements per full card (path, rect, circle, ellipse, text, line, polygon outside defs, masks, patterns, clip paths; rims excluded)\n")
L.append("| tier | rev 2 drawn | rev 3 drawn | change | rev 2 text | rev 3 text | rev 2 markup bytes | rev 3 markup bytes |\n|---|---|---|---|---|---|---|---|")
for a,b in zip(R['counts']['rev2'],R['counts']['rev3']):
    L.append(f"| {a['tier']} | {a['drawn']} | {b['drawn']} | {round(100*(b['drawn']-a['drawn'])/a['drawn'])} % | {a['text']} | {b['text']} | {a['bytes']} | {b['bytes']} |")
L.append("""
## Pointer sweep (relative only)

`perf.mjs`: headless Chromium 1194, software raster, 1440 px DPR 2, the LEGEND card, 90 pointer moves in a circle 16 ms apart, `requestAnimationFrame` deltas. Not a budget measurement (no GPU); it compares the two revisions on the same machine.

| | card() markup build, ms per card | frames | median frame ms | p95 | max |
|---|---|---|---|---|---|
| rev 2 | 0.46 | 93 | 33.4 | 50.1 | 66.7 |
| rev 3 | 0.16 | 159 | 16.7 | 33.4 | 66.7 |

## Not run

No app code exists yet for revision 3, so `bun test`, typecheck, lint, build, the gates and the e2e suites were not run for this design step; `rg -in sorare src public` was run (below in the commit notes). Docker and the database were not touched.
""")
open('design-selfcheck.md','w').write("\n".join(L)+"\n")
