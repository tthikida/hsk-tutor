"""Draw the iPhone launch pictures (what iOS shows while the Home Screen app starts).

iOS only uses a launch picture whose pixel size exactly matches the phone's screen, so there is one per
screen size. Writes app/splash/*.png and prints the <link> tags for index.html.

  python3 tools/build_splash.py
"""
import os, subprocess, tempfile
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "app", "splash")
BG = (184, 50, 44)          # the app's red (--accent)

# (points wide, points tall, pixel ratio): every iPhone screen size since the iPhone 5
SIZES = [(320, 568, 2), (375, 667, 2), (414, 736, 3), (375, 812, 3), (414, 896, 2), (414, 896, 3),
         (390, 844, 3), (428, 926, 3), (393, 852, 3), (430, 932, 3), (402, 874, 3), (440, 956, 3), (420, 912, 3)]

# square, with the background colour filled in: Quick Look renders square thumbnails on white
BAO = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -14 140 140" width="1400" height="1400">
  <rect x="-10" y="-14" width="140" height="140" fill="#b8322c"/>
  <g fill="none" stroke="#f6d9cf" stroke-width="2.5" stroke-linecap="round" opacity=".8">
    <path d="M48 14q-5-6 0-12"/><path d="M60 10q-5-6 0-12"/><path d="M72 14q-5-6 0-12"/></g>
  <path d="M14 82q-6-30 22-48q12-12 24-14q12 2 24 14q28 18 22 48q-2 10-46 10t-46-10z" fill="#f7ead6" stroke="#d8b88c" stroke-width="2"/>
  <path d="M60 20q-4 10-14 14M60 20q4 10 14 14M60 20v12M60 20q-12 4-22 12M60 20q12 4 22 12" fill="none" stroke="#d8b88c" stroke-width="1.6" stroke-linecap="round"/>
  <ellipse cx="34" cy="70" rx="6" ry="3.5" fill="#f2a7a0" opacity=".8"/><ellipse cx="86" cy="70" rx="6" ry="3.5" fill="#f2a7a0" opacity=".8"/>
  <path d="M38 61q6-7 12 0M70 61q6-7 12 0M51 73q9 8 18 0" fill="none" stroke="#3a2a20" stroke-width="3" stroke-linecap="round"/>
</svg>"""


def font(paths, size):
    for p in paths:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, size)
            except OSError: pass
    return ImageFont.load_default(size)


LATIN = ["/System/Library/Fonts/SFNSRounded.ttf", "/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc"]
HANZI = ["/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/Hiragino Sans GB.ttc", "/System/Library/Fonts/STHeiti Medium.ttc"]


def main():
    os.makedirs(OUT, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        # macOS Quick Look draws SVG with WebKit (ImageMagick's own SVG drawing mangles Bao's curves)
        svg = os.path.join(tmp, "bao.svg")
        open(svg, "w").write(BAO)
        subprocess.run(["qlmanage", "-t", "-s", "1400", "-o", tmp, svg], check=True, capture_output=True)
        bao = Image.open(svg + ".png").convert("RGB")
    links = []
    for w, h, r in SIZES:
        W, H = w * r, h * r
        img = Image.new("RGB", (W, H), BG)
        bw = int(W * 0.56); b = bao.resize((bw, bw), Image.LANCZOS)   # Bao fills the middle ~70% of this square
        top = int(H * 0.47 - bw * 0.8)
        img.paste(b, ((W - bw) // 2, top))
        d = ImageDraw.Draw(img)
        y = top + int(bw * 0.9)
        title = font(LATIN, int(W * 0.085))
        d.text((W / 2, y), "HSK Tutor", font=title, fill="white", anchor="mt")
        sub = font(HANZI, int(W * 0.05))
        d.text((W / 2, y + int(W * 0.12)), "学中文", font=sub, fill=(246, 217, 207), anchor="mt")
        name = f"splash-{W}x{H}.png"
        img.save(os.path.join(OUT, name), optimize=True)
        links.append(f'  <link rel="apple-touch-startup-image" href="splash/{name}" media="(device-width: {w}px) and (device-height: {h}px) '
                     f'and (-webkit-device-pixel-ratio: {r}) and (orientation: portrait)">')
    print("\n".join(links))


if __name__ == "__main__":
    main()
