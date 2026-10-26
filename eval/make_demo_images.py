"""Generate the DEMO strip images (front/back) used by the app's Demo mode.

Run: uv run --with pillow python eval/make_demo_images.py web/public/demo

Two demo strips, each clearly marked DEMO ("not a photo of a real pack"), drawn as text on a
card with a slight tilt, uneven light and noise so the preprocessing stage has real work to do.
Every value printed on them comes from a real record, nothing is made up except the demo batch:
  - telmikind: "Telmikind 40 Tablet", Mankind Pharma Ltd, 10 tablets, MRP Rs 38.59: the
    brand dataset's row (A-Z Medicine Dataset, 2022). Batch "DM2506" is a demo batch (no O or I, which a reader could mistake for 0 or 1) that is in
    no alert list. Shows: match, Jan Aushadhi savings, price within the NPPA ceiling.
  - omee: CDSCO's NSQ alert of Sep 2026 for "Omee" (omeprazole gastro-resistant capsules IP
    20 mg), Alkem Laboratories Ltd, Baddi, batch 25281124, Mfg 06/2025, Exp 05/2027; pack and MRP
    (20 capsules, Rs 61.87) from the brand dataset's "Omee Capsule" row. Shows: a red batch alert.
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
    # The DEMO mark runs sideways down the right edge: people see it at once, but the reader only
    # reads upright text on the front, so it is never taken for the brand. (Upright, it was: the
    # brand dataset has a real "Demo 20mg Capsule", and the Omee demo matched it.)
    mark = Image.new("RGBA", (330, 80), (0, 0, 0, 0))
    ImageDraw.Draw(mark).text((0, 0), "DEMO", font=f(64, 1), fill=(200, 40, 40, 255))
    mark = mark.rotate(90, expand=True)
    img.paste(mark, (w - 120, h - 400), mark)
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
    (80, 120, "TELMIKIND 40", 120, True),
    (80, 300, "Telmisartan Tablets IP 40 mg", 52, False),
    (80, 400, "10 Tablets", 48, False),
], f"{OUT}/telmikind-front.jpg", tilt=3)

card([
    (60, 70, "Each uncoated tablet contains:", 40, False),
    (60, 125, "Telmisartan IP 40 mg", 40, True),
    (60, 180, "Excipients q.s.", 36, False),
    (60, 270, "B.No. DM2506   Mfg. 06/2025   Exp. 05/2027", 40, True),
    (60, 350, "M.R.P. Rs. 38.59 (Incl. of all taxes)", 40, True),
    (60, 430, "Strip of 10 tablets", 36, False),
    (60, 520, "Marketed by: Mankind Pharma Ltd.", 36, False),
    (60, 580, "Demo image made for Medicheck, not a photo of a real pack.", 32, False),
], f"{OUT}/telmikind-back.jpg", tilt=-2)

card([
    (80, 130, "OMEE", 110, True),
    (80, 300, "Omeprazole Gastro-resistant Capsules IP 20 mg", 44, False),
    (80, 400, "20 Capsules", 48, False),
], f"{OUT}/omee-front.jpg", tilt=3)

card([
    (60, 70, "Each hard gelatin capsule contains:", 40, False),
    (60, 125, "Omeprazole IP 20 mg", 40, True),
    (60, 180, "(as enteric coated pellets)", 36, False),
    (60, 270, "B.No. 25281124   Mfg. 06/2025   Exp. 05/2027", 40, True),
    (60, 350, "M.R.P. Rs. 61.87 (Incl. of all taxes)", 40, True),
    (60, 430, "Strip of 20 capsules", 36, False),
    (60, 520, "Manufactured by: Alkem Laboratories Ltd.", 36, False),
    (60, 580, "Baddi, Distt. Solan, H.P.", 32, False),
    (60, 640, "Demo image made for Medicheck, not a photo of a real pack.", 32, False),
], f"{OUT}/omee-back.jpg", tilt=2)
print("ok")
