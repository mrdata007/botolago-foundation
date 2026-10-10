from PIL import Image
import numpy as np
exec(open("meas.py").read().split("names=")[0])
s=1.8;o=20
def L(im,x,y,r=6):
    a=im[int(o+y*s)-r:int(o+y*s)+r, int(o+x*s)-r:int(o+x*s)+r].reshape(-1,3)
    m=np.median(a,0); return lab(m[None])[0]
def Y(lab_):
    # relative luminance from L*
    Lr=lab_[0]; return ((Lr+16)/116)**3 if Lr>8 else Lr/903.3
def cr(a,b):
    ya,yb=Y(a),Y(b); hi,lo=max(ya,yb),min(ya,yb); return (hi+.05)/(lo+.05)
for i,n in enumerate(["base","homa","stade","pro","champion","legend"]):
    im=np.asarray(Image.open(f"big-{i}-flat.png").convert("RGB")).astype(float)
    pairs={"L sleeve":((226,407),(132,407)),"R sleeve":((774,407),(868,407)),"L shoulder":((330,268),(330,232)),"L body":((290,700),(240,700)),"R body":((712,700),(760,700))}
    out=[]
    for k,(a,b) in pairs.items():
        la,lb=L(im,*a),L(im,*b)
        out.append(f"{k} {la[0]:.0f}/{lb[0]:.0f} dE{np.linalg.norm(la-lb):.0f} cr{cr(la,lb):.2f}")
    print(f"{n:9s}"," | ".join(out))
