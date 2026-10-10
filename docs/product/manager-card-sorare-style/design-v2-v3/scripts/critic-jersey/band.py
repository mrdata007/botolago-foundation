from PIL import Image
import numpy as np
exec(open("meas.py").read().split("names=")[0])
s=1.8;o=20
for i,n in [(3,"pro"),(2,"stade"),(1,"homa"),(5,"legend")]:
    im=np.asarray(Image.open(f"big-{i}-norims.png").convert("RGB")).astype(float)
    for y in [300,700]:
        row=im[int(o+y*s)]
        xs=np.arange(916,1001,2.0)
        L=[lab(row[int(o+x*s)][None])[0][0] for x in xs]
        print(n,"y",y,"L* x916..1000 step2:"," ".join("%.0f"%v for v in L))
    # band along its length: sample center of right band x 938 at many y
    col=[lab(im[int(o+y*s), int(o+933*s)][None])[0][0] for y in range(60,881,60)]
    print(n,"band x933 down y60..880:"," ".join("%.0f"%v for v in col))
