"""Procedural rasters for the Stamped Card world. Re-run to regenerate:
   python tools/gen-textures.py   (needs pillow + numpy)
- app/public/textures/ink-{1..4}.png: rubber-stamp ink coverage masks (alpha = ink), used via mask-image.
- app/public/textures/paper.png: seamless paper-fiber tile, dark fibers at low alpha over the manila ground.
"""
import numpy as np
from PIL import Image, ImageFilter

OUT = "app/public/textures"

def smooth_noise(rng, size, scale):
    small = rng.random((size // scale + 2, size // scale + 2))
    img = Image.fromarray((small * 255).astype("uint8")).resize((size, size), Image.BICUBIC)
    return np.asarray(img, dtype=float) / 255

def ink(seed, size=256):
    rng = np.random.default_rng(seed)
    coverage = 0.55 * smooth_noise(rng, size, 48) + 0.3 * smooth_noise(rng, size, 12) + 0.15 * rng.random((size, size))
    # pressure falloff: one side presses harder, like a hand-held stamp
    yy, xx = np.mgrid[0:size, 0:size] / size
    angle = rng.uniform(0, 2 * np.pi)
    tilt = 0.5 + 0.5 * (np.cos(angle) * (xx - 0.5) + np.sin(angle) * (yy - 0.5))
    a = coverage * 0.75 + tilt * 0.45
    a = np.clip((a - 0.32) * 2.6, 0, 1)          # most of the stamp inks, gaps where pressure drops
    voids = rng.random((size, size)) < 0.012       # paper fibre specks that refused ink
    a[voids] *= 0.15
    # keep the centre solid so initials stay legible; only the ring/edges break up
    r = np.hypot(xx - 0.5, yy - 0.5)
    core = np.clip((0.36 - r) / 0.06, 0, 1)
    a = np.maximum(a, 0.9 * core + a * (1 - core))
    alpha = Image.fromarray((a * 255).astype("uint8")).filter(ImageFilter.GaussianBlur(0.6))
    white = Image.new("L", (size, size), 255)
    return Image.merge("RGBA", (white, white, white, alpha))

def paper(seed=7, size=256):
    rng = np.random.default_rng(seed)
    a = np.zeros((size, size))
    for _ in range(420):                              # short fibres, wrapped so the tile is seamless
        x, y = rng.uniform(0, size, 2)
        ang = rng.uniform(0, np.pi)
        length = rng.uniform(6, 22)
        w = rng.uniform(0.03, 0.09)
        for t in np.linspace(0, length, int(length * 2)):
            px = int(x + np.cos(ang) * t) % size
            py = int(y + np.sin(ang) * t) % size
            a[py, px] = max(a[py, px], w)
    a += smooth_noise(rng, size, 32) * 0.035 + rng.random((size, size)) * 0.025
    img = Image.fromarray((np.clip(a, 0, 1) * 255).astype("uint8")).filter(ImageFilter.GaussianBlur(0.4))
    dark = Image.new("L", (size, size), 40)
    return Image.merge("RGBA", (dark, dark, dark, img))

if __name__ == "__main__":
    for i in range(1, 5):
        ink(100 + i).save(f"{OUT}/ink-{i}.png", optimize=True)
    paper().save(f"{OUT}/paper.png", optimize=True)
    print("ok")
