"""Generate the two DEMO strip images (front/back) used by the app's Demo mode.

Run: uv run --with pillow python eval/make_demo_images.py web/public/demo

Fictional brand and maker, clearly marked DEMO. Slight tilt, uneven light and noise so the
preprocessing stage has real work to do.
"""
import random, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = sys.argv[1]
random.seed(7)
FONT = "/System/Library/Fonts/Helvetica.ttc"
f = lambda size, index=0: ImageFont.truetype(FONT, size, index=index)

def card(lines, path, tilt):
    w, h = 1400, 800
    img = Image.new("RGB", (w, h), (232, 236, 240))
    d = ImageDraw.Draw(img)
    d.rectangle([20, 20, w - 20, h - 20], outline=(150, 150, 160), width=4)
    d.text((w - 260, 40), "DEMO", font=f(56, 1), fill=(200, 40, 40))
    for x, y, text, size, bold in lines:
        d.text((x, y), text, font=f(size, 1 if bold else 0), fill=(25, 30, 40))
    # Uneven lighting: darker on the left, a bright glare band on the right.
    shade = Image.new("L", (w, h))
    sd = ImageDraw.Draw(shade)
    for x in range(w):
        v = int(70 * (1 - x / w)) - (60 if 950 < x < 1010 else 0)
        sd.line([(x, 0), (x, h)], fill=max(0, min(255, 128 + v)))
    img = Image.composite(Image.new("RGB", (w, h), (0, 0, 0)), img, shade.point(lambda p: max(0, p - 128) * 2))
    glare = Image.new("RGB", (w, h), (255, 255, 255))
    band = Image.new("L", (w, h))
    ImageDraw.Draw(band).rectangle([960, 0, 1000, h], fill=110)
    img = Image.composite(glare, img, band.filter(ImageFilter.GaussianBlur(12)))
    img = img.rotate(tilt, resample=Image.BICUBIC, expand=False, fillcolor=(90, 95, 100))
    px = img.load()
    for _ in range(25000):
        x, y = random.randrange(w), random.randrange(h)
        n = random.randint(-35, 35)
        r, g, b = px[x, y]
        px[x, y] = (max(0, min(255, r + n)),) * 3
    img.filter(ImageFilter.GaussianBlur(0.6)).save(path, quality=82)

card([
    (80, 120, "DEMOTEL 40", 120, True),
    (80, 300, "Telmisartan Tablets IP 40 mg", 52, False),
    (80, 400, "15 Tablets", 48, False),
    (80, 560, "Demo strip for testing only. Not a real medicine.", 34, False),
], f"{OUT}/front.jpg", tilt=3)

card([
    (60, 70, "Each uncoated tablet contains:", 40, False),
    (60, 125, "Telmisartan IP 40 mg", 40, True),
    (60, 180, "Excipients q.s.", 36, False),
    (60, 270, "B.No. DM2504   Mfg. 09/2025   Exp. 08/2027", 40, True),
    (60, 350, "M.R.P. Rs. 122.98 (Incl. of all taxes)", 40, True),
    (60, 430, "Strip of 15 tablets", 36, False),
    (60, 520, "Manufactured by: Demo Pharma Ltd.", 36, False),
    (60, 580, "Sample image made for DawaCheck Demo mode.", 32, False),
], f"{OUT}/back.jpg", tilt=-2)
print("ok")
