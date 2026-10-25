"""Turn the demo screenshots into docs/demo.gif for the README.

Run (from the repo root):
  cd web && pnpm exec tsx scripts/demo-screens.ts https://dawacheck-psi.vercel.app /tmp/screens
  uv run --with pillow python eval/make_demo_gif.py /tmp/screens docs/demo.gif

Each frame gets a one-line caption; key frames stay on screen longer.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])
WIDTH = 360
FONT = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 15, index=1)
CAPTIONS = {
    "home": ("Five checks from public government data", 2200),
    "scan": ("Scan a strip, or try a demo strip", 1800),
    "reading": ("Read on the phone: photos never leave it", 1600),
    "confirm": ("Check what was read, fix anything wrong", 2200),
    "match": ("Matched to a medicine, with how sure we are", 2400),
    "checks": ("The checks: generic, batch, price, banned", 2800),
    "savings": ("Same medicine at Jan Aushadhi, and the saving", 2800),
    "alert": ("A batch in a CDSCO quality alert: red alert", 3200),
    "kendras": ("Nearest Jan Aushadhi Kendras, by PIN or GPS", 2400),
    "results": ("Results and data sources on the About page", 2800),
}

frames, durations = [], []
for path in sorted(SRC.glob("*.png")):
    key = path.stem.split("-", 1)[1]
    caption, ms = CAPTIONS[key]
    shot = Image.open(path).convert("RGB")
    shot = shot.resize((WIDTH, round(shot.height * WIDTH / shot.width)), Image.LANCZOS)
    bar = 40
    frame = Image.new("RGB", (WIDTH, shot.height + bar), (15, 107, 92))  # the app's theme colour
    frame.paste(shot, (0, bar))
    ImageDraw.Draw(frame).text(
        (WIDTH // 2, bar // 2), caption, font=FONT, fill="white", anchor="mm"
    )
    frames.append(frame.quantize(colors=256, method=Image.Quantize.MEDIANCUT))
    durations.append(ms)

frames[0].save(
    OUT, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True
)
print(f"{OUT}: {len(frames)} frames, {OUT.stat().st_size // 1024} KB")
