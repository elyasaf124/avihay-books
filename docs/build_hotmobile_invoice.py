#!/usr/bin/env python3
"""
Hot Mobile invoice extract for Meta verification.
Page 1: original design + precise Hebrew overlay (Pillow).
Pages 2-3: original vector detail for 053-5933880.
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

import arabic_reshaper
import fitz  # pymupdf
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFont

SOURCE_PDF = Path(r"C:\Users\ELYAS\OneDrive\Desktop\חשבונית הוט מובייל-אביחי נעמת.pdf")
OUTPUT_PDF = Path(
    r"C:\Users\ELYAS\OneDrive\Desktop\חשבונית הוט מובייל-0535933880-נועם-הספר.pdf"
)

FONT_PATH = Path(r"C:\Windows\Fonts\arial.ttf")
if not Path(r"C:\Windows\Fonts\arial.ttf").exists():
    FONT_PATH = Path(r"C:\Windows\Fonts\david.ttf")

SCALE = 4

CUSTOMER_NAME = "נעמת אביחי - נועם הספר"
CUSTOMER_STREET = "השקד 6"
CUSTOMER_CITY = "עלי 44828"
CUSTOMER_OSEK = "300635539"
PHONE = "053-5933880"

AMT_FIXED = "36.90"
AMT_VARIABLE = "0.00"
AMT_CREDIT = "-11.90"
AMT_BEFORE_VAT = "21.19"
AMT_VAT = "3.81"
AMT_TOTAL = "25.00"

# PDF page indices (0-based) for 053-5933880 detail in source invoice
DETAIL_FROM_PAGE = 11
DETAIL_TO_PAGE = 12

# Original layout anchors (PDF points) — measured from source page 1
RIGHT = 403
AMOUNT_RIGHT = 197
LABEL_RIGHT = 403

OTHER_PHONES = [
    "0508846929",
    "050-8846929",
    "0523114546",
    "0533378002",
    "0534308899",
    "0534758487",
    "0539621284",
    "האלון",
    "258.30",
    "176.99",
    "150.02",
]


def rtl(text: str) -> str:
    return get_display(arabic_reshaper.reshape(text))


def px(x: float) -> int:
    return int(x * SCALE)


def fonts() -> dict[str, ImageFont.FreeTypeFont]:
    return {
        "md": ImageFont.truetype(str(FONT_PATH), px(9.3)),
        "sm": ImageFont.truetype(str(FONT_PATH), px(8.4)),
        "bold": ImageFont.truetype(str(FONT_PATH), px(9.5)),
        "hdr": ImageFont.truetype(str(FONT_PATH), px(9.3)),
    }


def white(draw: ImageDraw.ImageDraw, rect: tuple[float, float, float, float]) -> None:
    x0, y0, x1, y1 = rect
    draw.rectangle((px(x0), px(y0), px(x1), px(y1)), fill="white")


def draw_rtl(
    draw: ImageDraw.ImageDraw,
    text: str,
    right_x: float,
    top_y: float,
    font: ImageFont.FreeTypeFont,
    color: str = "black",
) -> None:
    draw.text((px(right_x), px(top_y)), rtl(text), font=font, fill=color, anchor="ra")


def draw_ltr(
    draw: ImageDraw.ImageDraw,
    text: str,
    right_x: float,
    top_y: float,
    font: ImageFont.FreeTypeFont,
) -> None:
    """Amounts in original invoice align to the right edge of the amount column."""
    draw.text((px(right_x), px(top_y)), text, font=font, fill="black", anchor="ra")


def build_summary_image(page: fitz.Page) -> bytes:
    pix = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), alpha=False)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    draw = ImageDraw.Draw(img)
    f = fonts()

    # --- Cover only fields that change (keep לכבוד, table headers, email block) ---
    white(draw, (305, 123, 406, 137))       # old name line
    white(draw, (305, 134, 406, 158))       # old street + city lines
    white(draw, (398, 40, 406, 54))         # subscriber digit "7" only
    white(draw, (150, 214, 406, 318))        # charge rows + totals + phone list
    white(draw, (155, 318, 406, 412))        # payment footnotes
    white(draw, (200, 235, 310, 285))        # stray glyph artifacts
    white(draw, (0, 498, 420, 540))          # bottom strip promos

    # --- Recipient ---
    draw_rtl(draw, CUSTOMER_NAME, 403, 126, f["md"])
    draw_rtl(draw, f"{CUSTOMER_STREET}, {CUSTOMER_CITY}", 403, 135, f["md"])
    draw_rtl(draw, f"מספר עוסק מורשה: {CUSTOMER_OSEK}", 403, 144, f["sm"])

    # --- Subscribers: replace trailing 7 with 1 ---
    draw_ltr(draw, "1", 403, 41, f["md"])

    # --- Charge rows (original column headers above y=214 stay untouched) ---
    rows: list[tuple[str, str, float, bool]] = [
        ("חיובים קבועים -", AMT_FIXED, 215, False),
        ("חיובים משתנים -", AMT_VARIABLE, 228, False),
        ("הטבות/זיכויים -", AMT_CREDIT, 240, False),
        ('סה"כ לתשלום לפני מע"מ', AMT_BEFORE_VAT, 257, False),
        ('מע"מ 18.00%', AMT_VAT, 270, False),
        ('סה"כ בחשבונית זו לתשלום כולל מע"מ', AMT_TOTAL, 285, True),
        ('סה"כ לתשלום בכרטיס אשראי', AMT_TOTAL, 298, True),
    ]
    for label, amount, y, bold in rows:
        font = f["bold"] if bold else f["md"]
        draw_rtl(draw, label, LABEL_RIGHT, y, font)
        draw_ltr(draw, amount, AMOUNT_RIGHT, y, font)

    # --- Single phone reference ---
    draw_rtl(
        draw,
        f"חשבון זה מתייחס לפירוט תשלומים לקו הטלפון: {PHONE}",
        LABEL_RIGHT,
        316,
        f["sm"],
    )

    buf = io.BytesIO()
    img.save(buf, format="PDF", resolution=72.0 * SCALE)
    buf.seek(0)
    return buf.read()


def build_invoice(source: Path, output: Path) -> None:
    src = fitz.open(source)
    out = fitz.open()

    summary_pdf = fitz.open(stream=build_summary_image(src[0]), filetype="pdf")
    out.insert_pdf(summary_pdf)
    summary_pdf.close()

    out.insert_pdf(src, from_page=DETAIL_FROM_PAGE, to_page=DETAIL_TO_PAGE)

    out.save(str(output), garbage=4, deflate=True)
    out.close()
    src.close()


def verify_output(output_path: Path) -> list[str]:
    errors: list[str] = []
    doc = fitz.open(output_path)

    if doc.page_count != 3:
        errors.append(f"Expected 3 pages, got {doc.page_count}")

    p2 = doc[1].get_text()
    p3 = doc[2].get_text()
    detail_norm = (p2 + p3).replace("-", "")

    for token in OTHER_PHONES:
        if token in detail_norm or token in p2 + p3:
            errors.append(f"Found excluded: {token}")

    for token in ["0535933880", AMT_TOTAL]:
        if token not in detail_norm:
            errors.append(f"Missing in detail pages: {token}")

    doc.close()
    return errors


def main() -> int:
    if not SOURCE_PDF.exists():
        print(f"ERROR: not found: {SOURCE_PDF}", file=sys.stderr)
        return 1
    if not FONT_PATH.exists():
        print(f"ERROR: font not found: {FONT_PATH}", file=sys.stderr)
        return 1

    saved = OUTPUT_PDF
    print(f"Building invoice (font: {FONT_PATH.name}, scale: {SCALE})...")
    try:
        build_invoice(SOURCE_PDF, OUTPUT_PDF)
        print(f"  Saved: {OUTPUT_PDF}")
    except Exception as exc:
        if "Permission denied" in str(exc) or "cannot remove" in str(exc):
            saved = OUTPUT_PDF.with_stem(OUTPUT_PDF.stem + "-v2")
            build_invoice(SOURCE_PDF, saved)
            print(f"  Original file locked — saved: {saved}")
        else:
            raise

    errors = verify_output(saved)
    if errors:
        print("VERIFICATION FAILED:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print(f"Verification passed (3 pages): {saved.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
