# Build "BotolaGO Figures": Readex Pro's 0-9 only, at fixed weights, every digit the same width.
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset
src, outdir = sys.argv[1], sys.argv[2]
for w in (400, 500, 600, 700):
    f = instancer.instantiateVariableFont(TTFont(src), {"wght": w})
    opts = subset.Options(); opts.layout_features = []; opts.name_IDs = ["*"]; opts.notdef_outline = True
    s = subset.Subsetter(opts); s.populate(unicodes=list(range(0x30, 0x3A)) + [0x20]); s.subset(f)
    cmap = f.getBestCmap(); glyf = f["glyf"]; hmtx = f["hmtx"]
    digits = [cmap[c] for c in range(0x30, 0x3A)]
    target = max(hmtx[g][0] for g in digits)
    for g in digits:
        adv, lsb = hmtx[g]; dx = (target - adv) // 2
        gl = glyf[g]
        if gl.numberOfContours:
            coords = gl.getCoordinates(glyf)[0]; coords.translate((dx, 0)); gl.recalcBounds(glyf)
        hmtx[g] = (target, gl.xMin if gl.numberOfContours else lsb)
    for rec in f["name"].names:
        if rec.nameID in (1, 4, 16): rec.string = "BotolaGO Figures"
        elif rec.nameID == 6: rec.string = f"BotolaGOFigures-{w}"
    f["OS/2"].usWeightClass = w
    f.flavor = "woff2"; f.save(f"{outdir}/botolago-figures-{w}.woff2")
    print(w, target)
