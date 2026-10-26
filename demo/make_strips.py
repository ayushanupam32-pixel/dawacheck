"""Generate the demo strip images listed in strips.json: front.jpg, back.jpg and stamp.jpg (a
close-up of the batch / dates / MRP stamp, the website's optional third photo) for each strip.

Run from the repo root:  uv run --with pillow python demo/make_strips.py

Same look as the in-app Demo mode (eval/make_demo_images.py): a card with a slight tilt, uneven
light, a glare band and noise, so the reader's preprocessing has real work to do. Every card is
marked DEMO (sideways, so the reader never takes it for the brand name) and says it is not a
photo of a real pack. All values come from strips.json, which says where each one is from.
"""

import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).parent
FONT = "/System/Library/Fonts/Helvetica.ttc"


def font(size, bold=False):
    return ImageFont.truetype(FONT, size, index=1 if bold else 0)


def fitted(draw, text, size, bold, max_width):
    """The largest font size up to `size` at which `text` fits in `max_width` pixels."""
    while size > 20 and draw.textlength(text, font=font(size, bold)) > max_width:
        size -= 2
    return font(size, bold)


def finish(img, tilt, rng, glare_x=960):
    """Uneven light, a glare band, tilt and noise, as on a photo taken under a lamp."""
    w, h = img.size
    shade = Image.new("L", (w, h))
    sd = ImageDraw.Draw(shade)
    for x in range(w):
        v = int(70 * (1 - x / w)) - (60 if glare_x - 10 < x < glare_x + 50 else 0)
        sd.line([(x, 0), (x, h)], fill=max(0, min(255, 128 + v)))
    img = Image.composite(
        Image.new("RGB", (w, h), (0, 0, 0)), img, shade.point(lambda p: max(0, p - 128) * 2)
    )
    band = Image.new("L", (w, h))
    ImageDraw.Draw(band).rectangle([glare_x, 0, glare_x + 40, h], fill=110)
    img = Image.composite(
        Image.new("RGB", (w, h), (255, 255, 255)), img, band.filter(ImageFilter.GaussianBlur(12))
    )
    img = img.rotate(tilt, resample=Image.BICUBIC, expand=False, fillcolor=(90, 95, 100))
    px = img.load()
    for _ in range(w * h // 45):
        x, y = rng.randrange(w), rng.randrange(h)
        n = rng.randint(-35, 35)
        r, g, b = px[x, y]
        px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
    return img.filter(ImageFilter.GaussianBlur(0.6))


def demo_mark(img, y):
    """A red DEMO mark running sideways down the right edge."""
    mark = Image.new("RGBA", (330, 80), (0, 0, 0, 0))
    ImageDraw.Draw(mark).text((0, 0), "DEMO", font=font(64, True), fill=(200, 40, 40, 255))
    mark = mark.rotate(90, expand=True)
    img.paste(mark, (img.width - 120, y), mark)


def card(lines, w=1400, h=800):
    img = Image.new("RGB", (w, h), (232, 236, 240))
    d = ImageDraw.Draw(img)
    d.rectangle([20, 20, w - 20, h - 20], outline=(150, 150, 160), width=4)
    for x, y, text, size, bold in lines:
        f = fitted(d, text, size, bold, w - x - 200)
        d.text((x, y), text, font=f, fill=(25, 30, 40))
    demo_mark(img, h - 400)
    return img


def stamp(s, rng):
    """Close-up of the stamp: coloured ink on silver foil, as a phone zoomed in would see it."""
    w, h = 1300, 620
    img = Image.new("RGB", (w, h), (196, 200, 206))
    d = ImageDraw.Draw(img)
    # The foil's embossed diamond pattern, which a plain black-and-white step turns into a mesh.
    for i in range(-h, w, 26):
        d.line([(i, 0), (i + h, h)], fill=(184, 188, 195), width=2)
        d.line([(i + h, 0), (i, h)], fill=(184, 188, 195), width=2)
    ink = (88, 40, 140)
    unit = "capsules" if s["kind"] == "capsule" else "tablets"
    rows = [
        f"B.No. {s['batch']}",
        f"MFG. {s['mfg']}",
        f"EXP. {s['exp']}",
        f"M.R.P. Rs. {s['mrp']:.2f} for {s['count']} {unit}",
    ]
    for i, text in enumerate(rows):
        d.text((70, 70 + i * 120), text, font=fitted(d, text, 84, True, w - 260), fill=ink)
    demo_mark(img, 150)
    return finish(img, rng.choice([-4, -3, 3, 4]), rng, glare_x=880)


def make(s, rng):
    out = ROOT / s["folder"]
    out.mkdir(parents=True, exist_ok=True)
    unit = "Capsules" if s["kind"] == "capsule" else "Tablets"
    each = "hard gelatin capsule" if s["kind"] == "capsule" else "film coated tablet"
    front = card(
        [
            (80, 110, s["front"], 120, True),
            (80, 300, s["generic"], 52, False),
            (80, 400, f"{s['count']} {unit}", 48, False),
        ]
    )
    back_lines = [(60, 70, f"Each {each} contains:", 40, False)]
    y = 125
    for line in s["contains"]:
        back_lines.append((60, y, line, 40, True))
        y += 55
    back_lines += [
        (60, y, "Excipients q.s.", 36, False),
        (60, y + 90, f"B.No. {s['batch']}   Mfg. {s['mfg']}   Exp. {s['exp']}", 40, True),
        (60, y + 170, f"M.R.P. Rs. {s['mrp']:.2f} (Incl. of all taxes)", 40, True),
        (60, y + 250, f"Strip of {s['count']} {unit.lower()}", 36, False),
        (60, y + 330, f"Marketed by: {s['maker']}", 36, False),
        (60, y + 400, "Demo image made for Medicheck, not a photo of a real pack.", 30, False),
    ]
    back = card(back_lines, h=max(800, y + 470))
    seed_tilt = rng.choice([-3, -2, 2, 3])
    finish(front, seed_tilt, rng).save(out / "front.jpg", quality=84)
    finish(back, -seed_tilt, rng).save(out / "back.jpg", quality=84)
    stamp(s, rng).save(out / "stamp.jpg", quality=84)


def main():
    spec = json.loads((ROOT / "strips.json").read_text(encoding="utf-8"))
    for s in spec["strips"]:
        make(s, random.Random(s["folder"]))
        print("made", s["folder"])


if __name__ == "__main__":
    main()
