"""Optional font subset for the private Page's 256 KiB HTML limit.
All visible lab copy is fixed; retain the entire character set used by the source.
Requires fontTools with WOFF2 support. Original production fonts stay untouched.
"""
from pathlib import Path
from fontTools import subset
import sys
root=Path(__file__).resolve().parent
out=Path(sys.argv[1]); out.mkdir(parents=True,exist_ok=True)
text=''.join((root/f).read_text() for f in ['app.js','index.html'])
for name in ['manrope-latin-wght-normal','changa-latin-wght-normal','noto-sans-arabic-arabic-wght-normal']:
    font=subset.load_font(str(root/'../../public/fonts'/f'{name}.woff2'),subset.Options())
    options=subset.Options(); options.flavor='woff2'; options.layout_features=['*']
    subsetter=subset.Subsetter(options=options); subsetter.populate(text=text); subsetter.subset(font)
    subset.save_font(font,str(out/f'{name}.woff2'),options)
