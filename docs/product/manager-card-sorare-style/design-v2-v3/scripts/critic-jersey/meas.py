from PIL import Image
import numpy as np
def lab(rgb):
    c=rgb/255.0
    c=np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4)
    M=np.array([[0.4124,0.3576,0.1805],[0.2126,0.7152,0.0722],[0.0193,0.1192,0.9505]])
    xyz=c@M.T
    xyz/=np.array([0.9505,1.0,1.089])
    f=np.where(xyz>0.008856,np.cbrt(xyz),7.787*xyz+16/116)
    L=116*f[...,1]-16; a=500*(f[...,0]-f[...,1]); b=200*(f[...,1]-f[...,2])
    return np.stack([L,a,b],-1)
def hx(h): return np.array([int(h[i:i+2],16) for i in (1,3,5)],float)
names=["base","homa","stade","pro","champion","legend"]
prim={0:"#0a8f3a",1:None,2:"#c8102e",3:"#0a8f3a",4:"#f28e00",5:"#111111"}
S=1.8
print("== shirt-only layer: body pixels outside chest box/collar/disc ==")
for i in range(6):
    im=np.asarray(Image.open(f"shirtonly-{i}.png").convert("RGB")).astype(float)
    H,W,_=im.shape
    yy,xx=np.mgrid[0:H,0:W]; ux=xx/S; uy=yy/S
    mag=(im[...,0]>200)&(im[...,1]<60)&(im[...,2]>200)
    body=(~mag)&(ux>275)&(ux<725)&(uy>360)&(uy<905)&~((ux>310)&(ux<690)&(uy>440)&(uy<812))
    px=im[body]; L=lab(px)[:,0]
    med=np.median(px,0)
    p=prim[i]
    pl=lab(hx(p)[None])[0] if p else None
    ml=lab(med[None])[0]
    print(names[i], "n",len(px),"median rgb",med.astype(int), "L* p5/p50/p95 %.1f/%.1f/%.1f range %.1f"%(np.percentile(L,5),np.percentile(L,50),np.percentile(L,95),np.percentile(L,95)-np.percentile(L,5)), "primary",p, "primary L*a*b*", None if pl is None else pl.round(1), "median L*a*b*", ml.round(1), "dE", None if pl is None else round(float(np.linalg.norm(pl-ml)),1))
