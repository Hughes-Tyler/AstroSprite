"""
generate_icons.py
Draws AstroSprite helmet pixel art and saves it as icon16/32/48/128.png
inside chrome-extension/icons/.

Requires Pillow:  pip install Pillow
Run from the repo root:  python generate_icons.py
"""

from pathlib import Path
from PIL import Image

# ── Helmet pixel art (9×10 grid) ─────────────────────────────────────────────
# Cropped from main.py FRAMES[0], rows 0-9 (head + visor region)
# Same character key as main.py
HELMET = [
    "....BBBBB....",   # row 0
    "...BWWWWWB...",   # row 1
    "..BWWWWWWWB..",   # row 2
    "..BYYYYYYYB..",   # row 3  gold visor ring
    "..BWVVVVVWB..",   # row 4  visor glass
    "..BWVVVVVWB..",   # row 5
    "..BYYYYYYYB..",   # row 6  gold visor ring bottom
    "..BWWWWWWWB..",   # row 7
    ".BWWWWWWWWWB.",   # row 8
    ".BWWRRRRRWWB.",   # row 9  red chest stripe
]

COLORS = {
    'B': (17,  17,  17,  255),
    'W': (238, 238, 255, 255),
    'V': (102, 187, 238, 255),
    'Y': (255, 215,   0, 255),
    'R': (204,  51,  51, 255),
    'G': (153, 153, 153, 255),
    '.': (0,   0,   0,   0),    # transparent
}

ROWS = len(HELMET)
COLS = len(HELMET[0])

OUT_DIR = Path(__file__).parent / "chrome-extension" / "icons"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def make_base_image(pixel_size: int = 8) -> Image.Image:
    """Render the helmet at pixel_size px per grid cell."""
    w = COLS * pixel_size
    h = ROWS * pixel_size
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    pixels = img.load()
    for r, row in enumerate(HELMET):
        for c, ch in enumerate(row):
            color = COLORS.get(ch, (0, 0, 0, 0))
            for dy in range(pixel_size):
                for dx in range(pixel_size):
                    pixels[c * pixel_size + dx, r * pixel_size + dy] = color
    return img


def save_icon(size: int):
    # Render at 2× the target so downscale looks crisp
    big = make_base_image(pixel_size=max(1, (size * 2) // COLS))
    icon = big.resize((size, size), Image.LANCZOS)
    path = OUT_DIR / f"icon{size}.png"
    icon.save(path)
    print(f"  Saved {path}  ({size}×{size})")


if __name__ == "__main__":
    print("Generating AstroSprite icons…")
    for s in (16, 32, 48, 128):
        save_icon(s)
    print("Done. Icons written to chrome-extension/icons/")
