"""Generates simple branded placeholder images for demo data (no external assets needed)."""
import io
from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from django.conf import settings
from django.core.files.base import ContentFile
from PIL import Image, ImageDraw, ImageFont

FONT = Path(settings.BASE_DIR) / "assets" / "fonts" / "Vazirmatn-FD-Bold.ttf"
NAVY = (31, 58, 95)
CREAM = (247, 241, 227)


try:
    from PIL import features

    _RAQM = features.check("raqm")
except Exception:  # noqa: BLE001
    _RAQM = False


def _fa(t):
    # With libraqm Pillow shapes RTL text itself; otherwise reshape + reorder manually.
    return t if _RAQM else get_display(arabic_reshaper.reshape(t))


def product_image(name, color, label=""):
    w, h = 600, 600
    img = Image.new("RGB", (w, h), CREAM)
    d = ImageDraw.Draw(img)
    # bottle silhouette
    d.rounded_rectangle([220, 150, 380, 480], radius=40, fill=color)
    d.rounded_rectangle([265, 95, 335, 160], radius=10, fill=NAVY)
    d.rounded_rectangle([235, 260, 365, 380], radius=12, fill=CREAM)
    f_big = ImageFont.truetype(str(FONT), 44)
    f_small = ImageFont.truetype(str(FONT), 30)
    d.text((300, 320), _fa("مَن"), font=f_big, fill=NAVY, anchor="mm")
    d.text((300, 535), _fa(name[:28]), font=f_small, fill=NAVY, anchor="mm")
    if label:
        d.rounded_rectangle([20, 20, 180, 70], radius=20, fill=NAVY)
        d.text((100, 45), _fa(label), font=ImageFont.truetype(str(FONT), 22), fill=CREAM, anchor="mm")
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return ContentFile(buf.getvalue(), name=f"{abs(hash(name))}.png")


def banner_image(title, subtitle, color, size=(1200, 630)):
    w, h = size
    img = Image.new("RGB", size, color)
    d = ImageDraw.Draw(img)
    d.rectangle([0, h - 120, w, h], fill=NAVY)
    d.ellipse([w - 380, -120, w + 120, 380], fill=CREAM)
    d.text((w - 70, h // 2 - 40), _fa(title), font=ImageFont.truetype(str(FONT), 64), fill=NAVY, anchor="rm")
    d.text((w - 70, h - 60), _fa(subtitle), font=ImageFont.truetype(str(FONT), 34), fill=CREAM, anchor="rm")
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return ContentFile(buf.getvalue(), name=f"b{abs(hash(title + subtitle))}.png")


def text_file(content, name):
    return ContentFile(content.encode(), name=name)
