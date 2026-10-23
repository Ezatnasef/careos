from __future__ import annotations

import io
import os
import textwrap
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas


def _arabic_font_path() -> Path:
    configured = os.getenv("CAREOS_ARABIC_FONT_PATH", "").strip()
    candidates = [
        Path(configured) if configured else None,
        Path(os.getenv("WINDIR", "C:/Windows")) / "Fonts" / "arial.ttf",
        Path(os.getenv("WINDIR", "C:/Windows")) / "Fonts" / "calibri.ttf",
        Path("/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"),
    ]
    for candidate in candidates:
        if candidate is not None and candidate.is_file():
            return candidate
    raise RuntimeError(
        "No Arabic-capable font is available for clinical PDF generation. "
        "Install an Arabic-capable TrueType font or set CAREOS_ARABIC_FONT_PATH."
    )


def create_clinical_note_pdf(
    *,
    organization_name: str,
    patient_name: str,
    medical_record_number: str,
    clinician_name: str,
    created_at: str,
    note_body: str,
    note_status: str,
) -> bytes:
    try:
        import arabic_reshaper
        from bidi.algorithm import get_display
    except ImportError as error:
        raise RuntimeError(
            "Arabic text shaping dependencies are required for clinical PDF generation."
        ) from error

    font_name = "CareOSArabic"
    pdfmetrics.registerFont(TTFont(font_name, str(_arabic_font_path())))
    output = io.BytesIO()
    canvas = Canvas(output, pagesize=A4)
    page_width, page_height = A4
    left_margin = 48
    right_margin = page_width - 48
    y = page_height - 58
    line_height = 18

    def draw_line(text: str, *, size: int = 10, color: tuple[float, float, float] = (0.12, 0.18, 0.2)) -> None:
        nonlocal y
        shaped = get_display(arabic_reshaper.reshape(text))
        canvas.setFont(font_name, size)
        canvas.setFillColorRGB(*color)
        wrapped_lines = simpleSplit(shaped, font_name, size, right_margin - left_margin)
        for line in wrapped_lines or [""]:
            if y < 56:
                canvas.showPage()
                y = page_height - 58
            canvas.setFont(font_name, size)
            canvas.setFillColorRGB(*color)
            canvas.drawRightString(right_margin, y, line)
            y -= line_height if size <= 10 else line_height + 2

    draw_line(organization_name, size=14, color=(0.08, 0.35, 0.33))
    y -= 4
    draw_line("ملاحظة سريرية / Clinical note", size=16, color=(0.08, 0.35, 0.33))
    y -= 8
    draw_line(f"المريضة / Patient: {patient_name}")
    draw_line(f"رقم الملف / Record number: {medical_record_number}")
    draw_line(f"الطبيب / Clinician: {clinician_name}")
    draw_line(f"التاريخ / Date: {created_at}")
    draw_line(f"حالة الملاحظة / Note status: {note_status}")
    y -= 8
    canvas.setStrokeColorRGB(0.82, 0.88, 0.86)
    canvas.line(left_margin, y, right_margin, y)
    y -= 22

    for paragraph in note_body.splitlines() or [""]:
        if not paragraph.strip():
            y -= 8
            continue
        for line in textwrap.wrap(paragraph, width=100, break_long_words=True, break_on_hyphens=False):
            draw_line(line, size=11)
        y -= 4

    canvas.save()
    return output.getvalue()
