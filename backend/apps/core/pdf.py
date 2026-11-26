"""Small RTL-aware PDF helper on top of ReportLab (Persian shaping via arabic_reshaper + bidi)."""
import io
from pathlib import Path

import arabic_reshaper
import jdatetime
from bidi.algorithm import get_display
from django.conf import settings
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle

FONT_DIR = Path(settings.BASE_DIR) / "assets" / "fonts"
_registered = False

NAVY = colors.HexColor("#1F3A5F")
CREAM = colors.HexColor("#F7F1E3")
SAND = colors.HexColor("#E8DCC0")


def _register():
    global _registered
    if not _registered:
        pdfmetrics.registerFont(TTFont("Vazir", str(FONT_DIR / "Vazirmatn-FD-Regular.ttf")))
        pdfmetrics.registerFont(TTFont("VazirBold", str(FONT_DIR / "Vazirmatn-FD-Bold.ttf")))
        _registered = True


def fa(text):
    return get_display(arabic_reshaper.reshape(str(text)))


def money(v):
    return f"{int(v):,}"


def jdate(dt):
    if hasattr(dt, "astimezone"):
        dt = timezone.localtime(dt)
        return jdatetime.datetime.fromgregorian(datetime=dt).strftime("%Y/%m/%d")
    return jdatetime.date.fromgregorian(date=dt).strftime("%Y/%m/%d")


def style(size=10, bold=False, align=2):
    return ParagraphStyle("s", fontName="VazirBold" if bold else "Vazir", fontSize=size, leading=size * 1.6,
                          alignment=align)


def P(text, **kw):
    return Paragraph(fa(text), style(**kw))


def build_table_doc(title, meta_rows, headers, rows, totals, footer_note=""):
    """Generic RTL document: header block, meta key/values, item table, totals. Columns given RTL-first."""
    _register()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=14 * mm, leftMargin=14 * mm, topMargin=12 * mm,
                            bottomMargin=12 * mm, title=title)
    story = []
    head = Table([[P(title, size=13, bold=True, align=0), P("پرتال فروش عمده‌ی مَن", size=15, bold=True)]],
                 colWidths=[87 * mm, 95 * mm])
    head.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), CREAM), ("BOX", (0, 0), (-1, -1), 0.6, NAVY),
                              ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    story += [head, Spacer(1, 5 * mm)]

    meta = [[P(v), P(k, bold=True)] for k, v in meta_rows]
    mt = Table(meta, colWidths=[140 * mm, 42 * mm])
    mt.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.3, SAND), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    story += [mt, Spacer(1, 5 * mm)]

    white = ParagraphStyle("h", parent=style(bold=True, align=1), textColor=colors.white)
    data = [[Paragraph(fa(h), white) for h in reversed(headers)]]
    for r in rows:
        data.append([P(c, align=1) for c in reversed(r)])
    widths = {6: [30, 25, 20, 22, 70, 15], 5: [35, 30, 25, 77, 15]}.get(len(headers), None)
    t = Table(data, colWidths=[w * mm for w in widths] if widths else None, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.3, SAND), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CREAM]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story += [t, Spacer(1, 4 * mm)]

    tot = Table([[P(v, bold=True, align=0), P(k, align=2)] for k, v in totals], colWidths=[50 * mm, 50 * mm],
                hAlign="LEFT")
    tot.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, NAVY), ("LINEBELOW", (0, 0), (-1, -2), 0.3, SAND),
                             ("BACKGROUND", (0, -1), (-1, -1), CREAM)]))
    story.append(tot)
    if footer_note:
        story += [Spacer(1, 6 * mm), P(footer_note, size=8)]
    doc.build(story)
    return buf.getvalue()
