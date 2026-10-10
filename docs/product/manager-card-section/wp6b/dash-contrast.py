import json, sys
import numpy as np
from PIL import Image

tag = sys.argv[1]
res = json.load(open(f"dash-{tag}.json"))


def lin(c):
    c = c / 255.0
    return np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def L(a):
    return 0.2126 * lin(a[..., 0]) + 0.7152 * lin(a[..., 1]) + 0.0722 * lin(a[..., 2])


def cr(la, lb):
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def hexs(c):
    return "#%02x%02x%02x" % tuple(int(v) for v in c)


def med(px):
    px = px.reshape(-1, 3).astype(np.float64)
    order = np.argsort(L(px))
    return px[order[len(order) // 2]]


for r in res:
    im = np.asarray(Image.open(r["file"]).convert("RGB"))
    s = r["dpr"]
    hx, hy, hw, hh = [v * s for v in r["hit"]]
    dx, dy, dw, dh = [v * s for v in r["dash"]]

    def crop(x, y, w, h):
        return im[int(y) : int(y + h), int(x) : int(x + w)]

    dash = crop(dx + dw * 0.1, dy + dh * 0.2, dw * 0.8, dh * 0.6)
    above = crop(dx, hy + (dy - hy) * 0.15, dw, (dy - hy) * 0.7).reshape(-1, 3)
    below = crop(dx, dy + dh + (hy + hh - dy - dh) * 0.15, dw, (hy + hh - dy - dh) * 0.7).reshape(-1, 3)
    rib = np.vstack([above, below])
    lr = L(rib)
    m = np.median(lr)
    lo = med(rib[lr <= m])
    hi = med(rib[lr > m])
    dm = med(dash)
    a, b = cr(L(dm), L(lo)), cr(L(dm), L(hi))
    print(
        f'{r["name"]:9} {r["lang"]} {r["theme"]:5} dash {hexs(dm)} rib {hexs(lo)}/{hexs(hi)} '
        f"contrast {a:.2f} / {b:.2f} min {min(a, b):.2f}  width {dw / s:.0f}px",
        flush=True,
    )
