from PIL import Image
import numpy as np
exec(open("meas.py").read().split("names=")[0])
s=1.8;o=20
def reg(im,x0,y0,x1,y1):
    a=im[int(o+y0*s):int(o+y1*s), int(o+x0*s):int(o+x1*s)].reshape(-1,3)
    m=np.median(a,0); l=lab(m[None])[0]
    return m.astype(int), l
for i,n in enumerate(["base","homa","stade","pro","champion","legend"]):
    im=np.asarray(Image.open(f"big-{i}-flat.png").convert("RGB")).astype(float)
    top=reg(im,380,60,620,200)
    mid=reg(im,80,450,140,700)   # left field beside the jersey
    low=reg(im,380,960,620,1080) # under the hem, inside the shield point
    # beam check: floodlight B (x0 846 -> xl 380..xr 720 at y 980): sample at y 300 inside beam ~ x 800 vs outside x 880? use x 760 vs x 900
    bin_=reg(im,840,120,860,200); bout=reg(im,880,600,920,700)
    C=lambda l: (l[1]**2+l[2]**2)**.5
    print(f"{n:9s} top L*{top[1][0]:5.1f} C*{C(top[1]):5.1f} rgb{top[0]} | side L*{mid[1][0]:5.1f} rgb{mid[0]} | under-hem L*{low[1][0]:5.1f} rgb{low[0]} | lamp L*{bin_[1][0]:5.1f} vs side-low L*{bout[1][0]:5.1f}")
