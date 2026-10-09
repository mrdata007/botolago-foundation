import json
import sys
from collections import Counter

import numpy as np
from PIL import Image

tag = sys.argv[1]
res = json.load(open(f"card-contrast-{tag}.json"))


def lin(c):
    c = c / 255.0
    return np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lum(rgb):
    r, g, b = (lin(np.array(v, dtype=float)) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = float(lum(a)), float(lum(b))
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def commonest(px):
    counts = Counter(map(tuple, (px // 4 * 4).reshape(-1, 3)))
    return np.array(counts.most_common(1)[0][0], dtype=float)


failures = 0
worst = {}
for r in res:
    im = np.asarray(Image.open(r["file"]).convert("RGB"))
    s = r["scale"]
    for item in r["items"]:
        x, y, w, h = [v * s for v in item["box"]]
        x0, y0, x1, y1 = int(x), int(y), int(x + w), int(y + h)
        pad = max(2, int(3 * s))
        outer = im[max(0, y0 - pad) : y1 + pad, max(0, x0 - pad) : x1 + pad].astype(np.int16)
        inner = im[y0:y1, x0:x1]
        if inner.size == 0:
            continue
        # backdrop: the commonest colour on the ring around the box
        ring = outer.copy()
        oy, ox = y0 - max(0, y0 - pad), x0 - max(0, x0 - pad)
        ring[oy : oy + (y1 - y0), ox : ox + (x1 - x0)] = -1
        ring = ring.reshape(-1, 3)
        ring = ring[(ring >= 0).all(axis=1)]
        if len(ring) < 10:
            continue
        back = commonest(ring)
        px = inner.reshape(-1, 3).astype(float)
        d = np.abs(px - back).sum(axis=1)
        # ink: the colour furthest from the backdrop that occurs at least three times inside the box
        counts = Counter(map(tuple, (px // 4 * 4).astype(int)))
        ranked = sorted(counts.items(), key=lambda kv: -np.abs(np.array(kv[0], dtype=float) - back).sum())
        ink = np.array(next((c for c, n in ranked if n >= 3), ranked[0][0]), dtype=float)
        c = ratio(ink, back)
        floor = 3.0 if item["kind"] == "number" or item["size"] >= 18 else 4.5
        key = (item["kind"], r["theme"])
        worst[key] = min(worst.get(key, 99), c)
        status = "ok" if c >= floor else "BELOW"
        if c < floor:
            failures += 1
            print(f'{status} {r["fixture"]} {r["lang"]} {r["theme"]} {item["kind"]} "{item["label"]}" {c:.2f} < {floor}')
print(f"{sum(len(r['items']) for r in res)} boxes in {len(res)} card states; below their floor: {failures}")
for (kind, theme), value in sorted(worst.items()):
    print(f"lowest {kind} {theme}: {value:.2f}")
