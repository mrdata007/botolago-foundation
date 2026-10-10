"""Build the App Store and Google Play icons from the official "GO" mark.

Look: option E, "white 3D" — the full mark (G, ball and both swooshes) with
shading, on a lit white plate, with a soft shadow under the mark.

Source:  src/assets/brand/botolago-mark-color.svg (geometry is used unchanged)
Output:  store-assets/app-icon/ (see the README there for what each file is for)
         store-assets/app-icon/native/ (the phone app's icons, launch screens and
           Android notification icon, laid out as they go into the native projects;
           scripts/mobile/prepare-native.mjs copies them in on every build)
         public/apple-touch-icon.png (the website's home-screen icon, 180x180)

    pip install pillow cairosvg numpy
    python3 scripts/brand/make-app-icons.py

Store rules the output is checked against (October 2026):
- App Store: 1024x1024 PNG, square corners, no alpha channel at all
  (an alpha channel is refused at upload, ITMS-90717), sRGB.
- Google Play: 512x512 32-bit PNG (RGBA), fully opaque, square corners,
  no shadow around the icon's outline (a shadow inside the artwork is fine).
- Android adaptive icon: 108dp layers (432px at xxxhdpi); everything that
  matters stays inside the 66dp safe circle (radius 132px), which no launcher
  mask clips. Only the middle 72dp is ever shown, so the background gradient
  is laid out over that 72dp, not the whole layer.
"""
import io
import re
from pathlib import Path

import cairosvg
import numpy as np
from PIL import Image, ImageCms, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = (ROOT / "src/assets/brand/botolago-mark-color.svg").read_text()
OUT = ROOT / "store-assets/app-icon"

G, _CIRCLE, BALL, SW_BLUE, SW_BLACK = re.findall(r"<(?:path|circle)[^>]*/>", SRC)
d = lambda p: re.search(r' d="([^"]+)"', p).group(1)
VIEWBOX = "1190 8 422 270"
CX, CY, R = 1502.7433, 168.3686, 95  # the ball, in the mark's own coordinates
BLUE = "#0151FC"

# sRGB tag for every PNG. The profile header carries its creation time (bytes
# 24-35); it is blanked so a re-run writes byte-identical files. The profile ID
# is left unset by LittleCMS, so nothing checksums over that field.
_srgb = bytearray(ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes())
_srgb[24:36] = bytes(12)
SRGB = bytes(_srgb)

DEFS = f"""<defs>
 <linearGradient id="gBlue" x1="0" y1="0" x2="0.25" y2="1">
   <stop offset="0" stop-color="#4A8BFF"/><stop offset="0.55" stop-color="{BLUE}"/><stop offset="1" stop-color="#0036B8"/></linearGradient>
 <linearGradient id="gBlack" x1="0" y1="0" x2="0" y2="1">
   <stop offset="0" stop-color="#4A4F57"/><stop offset="1" stop-color="#0B0D10"/></linearGradient>
 <radialGradient id="ballFill" cx="0.36" cy="0.30" r="0.85">
   <stop offset="0" stop-color="#FFFFFF"/><stop offset="0.6" stop-color="#F1F3F6"/><stop offset="1" stop-color="#C5CBD4"/></radialGradient>
 <radialGradient id="ballShade" cx="0.36" cy="0.30" r="0.80">
   <stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.30"/></radialGradient>
 <radialGradient id="ballSheen" cx="0.5" cy="0.5" r="0.5">
   <stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
 <radialGradient id="ballGloss" cx="0.5" cy="0.5" r="0.5">
   <stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="0.45" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
 <clipPath id="ballClip"><circle cx="{CX}" cy="{CY}" r="96.8"/></clipPath>
</defs>"""


def svg(body, defs=DEFS):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VIEWBOX}">{defs}{body}</svg>'


def shaded_mark():
    # The shine is a faint broad sheen plus a small crisp spot, clipped to the
    # ball. A single large white blob here sat on a black patch and read as a smudge.
    return svg(
        f'<path fill="url(#gBlue)" d="{d(G)}"/>'
        f'<circle cx="{CX}" cy="{CY}" r="{R}" fill="url(#ballFill)"/>'
        f'<path fill="url(#gBlack)" d="{d(BALL)}"/>'
        f'<circle cx="{CX}" cy="{CY}" r="{R + 1.8}" fill="url(#ballShade)"/>'
        f'<g clip-path="url(#ballClip)">'
        f'<ellipse cx="{CX-30}" cy="{CY-40}" rx="58" ry="42" transform="rotate(-35 {CX-30} {CY-40})" fill="url(#ballSheen)"/>'
        f'<ellipse cx="{CX-36}" cy="{CY-44}" rx="11" ry="6.5" transform="rotate(-35 {CX-36} {CY-44})" fill="url(#ballGloss)"/></g>'
        f'<path fill="url(#gBlue)" d="{d(SW_BLUE)}"/>'
        f'<path fill="url(#gBlack)" d="{d(SW_BLACK)}"/>'
    )


def monochrome_mark():
    # Android "themed icon" layer: one colour, shape only. The ball's white fill
    # is left out so its panels stay visible as cut-outs once the phone tints it.
    return svg("".join(f'<path d="{d(p)}"/>' for p in (G, BALL, SW_BLUE, SW_BLACK)), defs="")


def render(svg_text, width):
    im = Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg_text.encode(), output_width=width * 4))).convert("RGBA")
    im = im.crop(im.getchannel("A").getbbox())
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def artwork_box():
    """Bounding box of the drawn artwork in the mark's own coordinates. render()
    crops to this, so the Icon Composer layers use it to land where the PNG mark is."""
    vx, vy, vw, vh = map(float, VIEWBOX.split())
    px = 4220
    a = Image.open(io.BytesIO(cairosvg.svg2png(bytestring=monochrome_mark().encode(), output_width=px))).getchannel("A")
    x0, y0, x1, y1 = a.getbbox()
    k = vw / px
    return vx + x0 * k, vy + y0 * k, vx + x1 * k, vy + y1 * k


def white_plate(size, viewport=1.0):
    """Off-white plate lit from the top-left: a bright highlight, a cool grey fall-off
    to the bottom-right and a slight darkening at the rim, so it reads as raised and
    keeps an edge against a white wallpaper. `viewport` is the share of the image
    the user actually sees (Android shows only the middle 72 of 108dp)."""
    S = 512
    yy, xx = (np.mgrid[0:S, 0:S] + 0.5) / S
    u, v = (xx - 0.5) / viewport + 0.5, (yy - 0.5) / viewport + 0.5
    t = np.clip(0.30 * u + 0.70 * v, 0, 1)
    t = t * t * (3 - 2 * t)
    top, bot = np.array([242, 245, 250.0]), np.array([200, 208, 222.0])
    base = top + (bot - top) * t[..., None]
    hl = (np.clip(1 - np.hypot(u - 0.40, v - 0.30) / 0.60, 0, 1) ** 1.5 * 0.95)[..., None]
    base = base + (255 - base) * hl
    rim = (np.clip((np.hypot(u - 0.5, v - 0.47) / 0.71 - 0.55) / 0.45, 0, 1) ** 1.4 * 0.10)[..., None]
    base = base * (1 - rim) + np.array([120, 132, 156.0]) * rim
    img = Image.fromarray(np.clip(base + 0.5, 0, 255).astype("uint8"), "RGB")
    return img.resize((size, size), Image.LANCZOS).convert("RGBA")


def place_with_shadow(canvas, mark, cx, cy, ref_width=768):
    """Mark centred on (cx, cy), over a faint wide shadow and a tighter contact shadow.
    Both stay inside the artwork, which is what both stores allow."""
    W, H = canvas.size
    k = mark.width / ref_width
    alpha = mark.getchannel("A")
    for blur, off, opacity in [(36, 18, 0.14), (4, 5, 0.26)]:
        pad = int(blur * k * 3) + 2
        sh = Image.new("RGBA", (mark.width + 2 * pad, mark.height + 2 * pad), (20, 35, 70, 0))
        a = Image.new("L", sh.size, 0)
        a.paste(alpha.point(lambda v: int(v * opacity)), (pad, pad))
        sh.putalpha(a)
        sh = sh.filter(ImageFilter.GaussianBlur(blur * k))
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        layer.alpha_composite(sh, (cx - mark.width // 2 - pad, cy - mark.height // 2 - pad + int(off * k)))
        canvas.alpha_composite(layer)
    canvas.alpha_composite(mark, (cx - mark.width // 2, cy - mark.height // 2))
    return canvas


def save_png(img, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, icc_profile=SRGB, optimize=True)


# The phone app's own files. The launch screen is the flat mark on the plate's
# lightest colour, so the icon, the launch screen and the first page read as one.
NATIVE = OUT / "native"
PLATE = "#F2F5FA"  # white_plate()'s top colour
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
# Capacitor's Android launch images: (folder, width, height), as its template has them.
PORTRAIT = {"mdpi": (320, 480), "hdpi": (480, 800), "xhdpi": (720, 1280), "xxhdpi": (960, 1600), "xxxhdpi": (1280, 1920)}
ANDROID_SPLASH = (
    [("drawable", 480, 320)]
    + [(f"drawable-port-{name}", w, h) for name, (w, h) in PORTRAIT.items()]
    + [(f"drawable-land-{name}", h, w) for name, (w, h) in PORTRAIT.items()]
)


def resized(img, size):
    """`img` at `size`, resampled with premultiplied alpha so transparent edges stay clean."""
    if img.size == tuple(size):
        return img
    if img.mode == "RGBA":
        return img.convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")
    return img.resize(size, Image.LANCZOS)


def masked_shape(img, size, shape):
    """`img` cut to a circle or a rounded square, `size` px, antialiased."""
    img = resized(img.convert("RGBA"), (size, size))
    mk = Image.new("L", (size * 4, size * 4), 0)
    box = (0, 0, size * 4 - 1, size * 4 - 1)
    if shape == "circle":
        ImageDraw.Draw(mk).ellipse(box, fill=255)
    else:
        ImageDraw.Draw(mk).rounded_rectangle(box, radius=int(size * 4 * 0.22), fill=255)
    img.putalpha(Image.composite(img.getchannel("A"), Image.new("L", img.size, 0), mk.resize(img.size, Image.LANCZOS)))
    return img


def write_text(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def splash(width, height, mark_width):
    """The launch screen: the flat colour mark centred on the plain plate colour."""
    canvas = Image.new("RGBA", (width, height), PLATE)
    mark = render(SRC, mark_width)
    canvas.alpha_composite(mark, ((width - mark.width) // 2, (height - mark.height) // 2))
    return canvas.convert("RGB")


def native_assets(ios_icon, fg):
    """Everything the native projects need, laid out as it goes into them."""
    ios = NATIVE / "ios"
    # The AppIcon set as Capacitor 8's template has it: one 1024 image, Xcode makes the rest.
    save_png(ios_icon, ios / "AppIcon.appiconset/AppIcon-512@2x.png")
    write_text(
        ios / "AppIcon.appiconset/Contents.json",
        '{\n  "images": [\n    {\n      "filename": "AppIcon-512@2x.png",\n      "idiom": "universal",\n'
        '      "platform": "ios",\n      "size": "1024x1024"\n    }\n  ],\n'
        '  "info": {\n    "author": "xcode",\n    "version": 1\n  }\n}\n',
    )
    # The launch screen's image (LaunchScreen.storyboard fills the screen with it,
    # cropping the sides). One picture under the template's three names; git stores
    # it once. On an iPhone the square is shown about 850pt tall, so 560px of 2732
    # makes the mark about 175pt wide.
    launch = splash(2732, 2732, 560)
    names = ("splash-2732x2732-2.png", "splash-2732x2732-1.png", "splash-2732x2732.png")
    for name in names:
        save_png(launch, ios / "Splash.imageset" / name)
    entries = ",\n".join(
        f'    {{\n      "idiom": "universal",\n      "filename": "{name}",\n      "scale": "{scale}"\n    }}'
        for name, scale in zip(names, ("1x", "2x", "3x"))
    )
    write_text(
        ios / "Splash.imageset/Contents.json",
        f'{{\n  "images": [\n{entries}\n  ],\n  "info": {{\n    "version": 1,\n    "author": "xcode"\n  }}\n}}\n',
    )

    res = NATIVE / "android/res"
    background = white_plate(432, viewport=72 / 108)
    shown = background.copy()
    shown.alpha_composite(fg)
    shown = shown.crop((72, 72, 360, 360))  # the 72dp a launcher shows
    mono = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    m = render(monochrome_mark(), 224)
    mono.alpha_composite(m, (218 - m.width // 2, 213 - m.height // 2))
    for name, k in DENSITIES.items():
        layer = round(108 * k)
        folder = res / f"mipmap-{name}"
        save_png(resized(fg, (layer, layer)), folder / "ic_launcher_foreground.png")
        save_png(white_plate(layer, viewport=72 / 108).convert("RGB"), folder / "ic_launcher_background.png")
        save_png(resized(mono, (layer, layer)), folder / "ic_launcher_monochrome.png")
        # Phones older than Android 8 use these flat ones: 48dp, the shape 44dp of it.
        canvas, inset = round(48 * k), round(2 * k)
        for file, shape in (("ic_launcher.png", "square"), ("ic_launcher_round.png", "circle")):
            icon = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
            icon.alpha_composite(masked_shape(shown, canvas - 2 * inset, shape), (inset, inset))
            save_png(icon, folder / file)
        # The notification icon: white on transparent (Android draws it in one colour),
        # 24dp with the mark across 22dp of it.
        size = round(24 * k)
        glyph = render(monochrome_mark(), round(22 * k))
        white = Image.new("RGBA", glyph.size, (255, 255, 255, 0))
        white.putalpha(glyph.getchannel("A"))
        notify = Image.new("RGBA", (size, size), (255, 255, 255, 0))
        notify.alpha_composite(white, ((size - white.width) // 2, (size - white.height) // 2))
        save_png(notify, res / f"drawable-{name}" / "ic_stat_notify.png")

    adaptive = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@mipmap/ic_launcher_background" />\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
        '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />\n'
        "</adaptive-icon>\n"
    )
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        write_text(res / "mipmap-anydpi-v26" / name, adaptive)
    write_text(
        res / "values/botolago_colors.xml",
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        "    <!-- The launch screen's background: the icon plate's lightest colour. -->\n"
        f'    <color name="botolago_splash_background">{PLATE}</color>\n'
        "    <!-- The tint of the notification icon in the notification list. -->\n"
        f'    <color name="botolago_notification">{BLUE}</color>\n'
        "</resources>\n",
    )
    # Capacitor's launch images, same folders and sizes as its template. Android 12
    # and later draw their own launch screen instead (set up by prepare-native.mjs).
    for folder, width, height in ANDROID_SPLASH:
        save_png(splash(width, height, round(min(width, height) * 0.4375)), res / folder / "splash.png")


def main():
    mark = shaded_mark()

    # App Store / iOS: 1024, no alpha. 768 wide is Google's 75% keyline, and the
    # mark sits a little up and left of centre because the black ball on the right
    # and the light swooshes on top otherwise make it look low and right.
    ios = place_with_shadow(white_plate(1024), render(mark, 768), 496, 470).convert("RGB")
    save_png(ios, OUT / "ios/AppIcon-1024.png")

    # The website's home-screen icon (what an iPhone shows after "Add to Home
    # Screen"); it is also the Organization logo in src/lib/structured-data.ts,
    # which states 180x180, so keep the size.
    save_png(ios.resize((180, 180), Image.LANCZOS), ROOT / "public/apple-touch-icon.png")

    # Google Play listing: the same artwork as a 32-bit PNG, every pixel opaque.
    save_png(ios.resize((512, 512), Image.LANCZOS).convert("RGBA"), OUT / "android/play-store-icon-512.png")

    # Android adaptive icon layers, 432px = 108dp at xxxhdpi. The mark sits a touch
    # right of centre here: the swoosh tip on the upper left is what comes closest
    # to the 66dp safe circle, and this keeps it about 8px inside.
    fg_mark = render(mark, 224)
    fg = place_with_shadow(Image.new("RGBA", (432, 432), (0, 0, 0, 0)), fg_mark, 218, 213)
    save_png(fg, OUT / "android/adaptive-foreground-432.png")
    save_png(white_plate(432, viewport=72 / 108).convert("RGB"), OUT / "android/adaptive-background-432.png")
    mono = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    m = render(monochrome_mark(), 224)
    mono.alpha_composite(m, (218 - m.width // 2, 213 - m.height // 2))
    save_png(mono, OUT / "android/adaptive-monochrome-432.png")

    # Flat layers for Apple's Icon Composer (iOS 26+ "Liquid Glass" icons), on a
    # 1024 canvas at the same position as the PNG, with no shading or shadow:
    # Icon Composer adds its own depth and light. Background: gradient #FFFFFF -> #D6DDE7.
    ink = artwork_box()
    s = 768 / (ink[2] - ink[0])
    tx = 496 - 768 / 2 - ink[0] * s
    ty = 470 - (ink[3] - ink[1]) * s / 2 - ink[1] * s
    layers = {  # numbered back to front
        "1-ball-white.svg": f'<circle cx="{CX}" cy="{CY}" r="{R}" fill="#fff"/>',
        "2-ball-black.svg": f'<path fill="#000" d="{d(BALL)}"/>',
        "3-letter-g.svg": f'<path fill="{BLUE}" d="{d(G)}"/>',
        "4-swooshes.svg": f'<path fill="{BLUE}" d="{d(SW_BLUE)}"/><path fill="#000" d="{d(SW_BLACK)}"/>',
    }
    (OUT / "icon-composer").mkdir(parents=True, exist_ok=True)
    for name, body in layers.items():
        (OUT / "icon-composer" / name).write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">'
            f'<g transform="translate({tx:.3f} {ty:.3f}) scale({s:.6f})">{body}</g></svg>\n'
        )

    # Preview: what each store / launcher shape actually shows.
    def masked(img, size, shape):
        img = img.resize((size, size), Image.LANCZOS).convert("RGBA")
        mk = Image.new("L", (size * 4, size * 4), 0)
        dr = ImageDraw.Draw(mk)
        box = (0, 0, size * 4 - 1, size * 4 - 1)
        if shape == "circle":
            dr.ellipse(box, fill=255)
        else:
            dr.rounded_rectangle(box, radius=int(size * 4 * (0.2237 if shape == "ios" else 0.30)), fill=255)
        img.putalpha(mk.resize((size, size), Image.LANCZOS))
        return img

    android = white_plate(432, viewport=72 / 108)
    android.alpha_composite(fg)
    android = android.crop((72, 72, 360, 360))  # the 72dp a launcher shows
    labels = ("iPhone", "Play Store", "Android, round", "Android, rounded square", "small sizes")
    sheet = Image.new("RGBA", (1300, 620), "#FFFFFF")
    draw = ImageDraw.Draw(sheet)
    draw.rectangle((0, 340, 1300, 620), fill="#1C1C1E")
    for i, label in enumerate(labels):
        draw.text((40 + i * 245, 20), label, fill="#555555")
    for y in (60, 380):
        sheet.alpha_composite(masked(ios, 200, "ios"), (40, y))
        sheet.alpha_composite(masked(ios, 200, "play"), (285, y))
        sheet.alpha_composite(masked(android, 200, "circle"), (530, y))
        sheet.alpha_composite(masked(android, 200, "play"), (775, y))
        x = 1020
        for size in (120, 60, 40):
            sheet.alpha_composite(masked(ios, size, "ios"), (x, y + 100 - size // 2))
            x += size + 16
    sheet.convert("RGB").save(OUT / "preview.png")

    native_assets(ios, fg)


if __name__ == "__main__":
    main()
