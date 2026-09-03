#!/usr/bin/env python3
"""Add Robert's Team Demo & Media (+$500) production add-on to UNALIGNED pricing PDFs."""

from __future__ import annotations

import shutil
from pathlib import Path

import fitz

ADDON_NAME = "ROBERT'S TEAM DEMO & MEDIA"
ADDON_PRICE = "+$500 per post"
ADDON_PRICE_COMPACT = "+$500/post"
ADDON_HEADLINE = "Robert's team produces demo clips and screen media."
ADDON_DETAIL = "Applies to every tier, $500 for each post we produce."
ADDON_ALT = "Without it, the client supplies links for all media."

FOOTER = (
    "New collaborations are paid in full before content goes live. "
    "Existing clients may be invoiced on go live day. "
    "Every paid post carries clear disclosure. "
    "Current pricing as of June 28, 2026."
)

# Brand colors (RGB 0-1)
GOLD = (0.7254901960784314, 0.6039215686274509, 0.27058823529411763)
BORDER = (0.8431372549019608, 0.8666666666666667, 0.9098039215686275)
ALT_BG = (0.9686274509803922, 0.9725490196078431, 0.9803921568627451)
WHITE = (1.0, 1.0, 1.0)
DARK = (0.06666666666666667, 0.06666666666666667, 0.06666666666666667)
TEXT = (0.06666666666666667, 0.06666666666666667, 0.06666666666666667)
BODY = (0.4, 0.4392156862745098, 0.5215686274509804)  # #667085
TIER = (0.12156862745098039, 0.1411764705882353, 0.18823529411764706)  # #1f2430

PRICING_DIR = Path(
    "/Users/asherweisberger/Desktop/UNALIGNED/HUMAN INTERACTION/PRICING/2026-06-28 CURRENT PRICING"
)
DOCS_DIR = Path("/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/docs")
FUNCTIONS_DIR = Path("/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/functions/pricing")


def _draw_box(page: fitz.Page, rect: fitz.Rect, fill=WHITE) -> None:
    page.draw_rect(rect, fill=fill, color=BORDER, width=0.6)


def _draw_hline(page: fitz.Page, x0: float, x1: float, y: float) -> None:
    page.draw_line(fitz.Point(x0, y), fitz.Point(x1, y), color=BORDER, width=0.6)


def _text(
    page: fitz.Page,
    point: tuple[float, float],
    text: str,
    *,
    size: float = 8.0,
    bold: bool = False,
    color: tuple[float, float, float] = TEXT,
) -> None:
    font = "hebo" if bold else "helv"
    page.insert_text(fitz.Point(*point), text, fontname=font, fontsize=size, color=color)


def _textbox(
    page: fitz.Page,
    rect: fitz.Rect,
    text: str,
    *,
    size: float = 7.8,
    bold: bool = False,
    color: tuple[float, float, float] = BODY,
) -> None:
    font = "hebo" if bold else "helv"
    # insert_textbox silently drops the text when it does not fit (negative
    # return); shrink until it actually renders.
    while size > 5.0:
        leftover = page.insert_textbox(rect, text, fontname=font, fontsize=size, color=color)
        if leftover >= 0:
            return
        size -= 0.2
    raise ValueError(f"text does not fit at any usable size: {text[:40]!r}")


def _redact(page: fitz.Page, rect: fitz.Rect) -> None:
    page.add_redact_annot(rect, fill=WHITE)
    page.apply_redactions()


def _restore_footer(page: fitz.Page, y: float) -> None:
    _redact(page, fitz.Rect(32.0, y - 6.0, 760.0, y + 14.0))
    _text(page, (40, y + 8), FOOTER, size=7.8, color=BODY)


def patch_single_tier(page: fitz.Page) -> None:
    x0, x1 = 526.68, 739.08
    y_top, y_bottom = 383.78, 461.78

    # Wipe everything below the X Space Live card across the full page width,
    # out to the right page edge so stray text from earlier patches dies too.
    _redact(page, fitz.Rect(x0 - 6.0, y_top, page.rect.x1, 486.0))
    _redact(page, fitz.Rect(32.0, 437.0, 760.0, 486.0))

    _draw_box(page, fitz.Rect(x0, y_top, x1, y_bottom))
    _draw_hline(page, x0, x1, y_top)

    _text(page, (537, 394), ADDON_NAME, size=7.0, bold=True, color=GOLD)
    _text(page, (537, 411), ADDON_PRICE, size=14.0, bold=True)
    _textbox(
        page,
        fitz.Rect(536, 415, 732, 438),
        ADDON_HEADLINE,
        size=8.0,
        bold=True,
        color=TEXT,
    )
    _textbox(
        page,
        fitz.Rect(536, 437, 732, y_bottom - 1),
        f"{ADDON_DETAIL} {ADDON_ALT}",
        size=7.2,
        color=BODY,
    )

    # The footer band moves below the extended sidebar card.
    band = fitz.Rect(32.4, 468.0, 759.6, 488.0)
    page.draw_rect(band, fill=ALT_BG, color=BORDER, width=0.6)
    _text(page, (40, 480.5), FOOTER, size=7.8, color=BODY)


def patch_duo_bundle(page: fitz.Page) -> None:
    x0, x1 = 38.52, 728.76
    y0, y1 = 358.0, 404.0

    # Full page width so no slivers of the original footer band survive
    # on either side of the add-on box.
    _redact(page, fitz.Rect(32.0, y0 - 4.0, 760.0, 434.0))

    _draw_box(page, fitz.Rect(x0, y0, x1, y1), fill=ALT_BG)
    _draw_box(page, fitz.Rect(x0, y0, x1, y0 + 17.2), fill=DARK)

    _text(page, (45, y0 + 11), "Production add-on", size=7.0, bold=True, color=WHITE)
    _text(page, (213, y0 + 11), "Price", size=7.0, bold=True, color=WHITE)
    _text(page, (279, y0 + 11), "Details", size=7.0, bold=True, color=WHITE)

    row_y = y0 + 30
    _text(page, (45, row_y), "Robert's Team Demo & Media", size=8.0, bold=True, color=TIER)
    _text(page, (213, row_y), ADDON_PRICE_COMPACT, size=10.0, bold=True)
    _textbox(
        page,
        fitz.Rect(279, row_y - 8, 720, row_y + 40),
        f"{ADDON_HEADLINE} {ADDON_DETAIL} {ADDON_ALT}",
        size=8.0,
        color=TIER,
    )

    # Redrawn footer band below the add-on box.
    band = fitz.Rect(32.4, 412.0, 759.6, 432.0)
    page.draw_rect(band, fill=ALT_BG, color=BORDER, width=0.6)
    _text(page, (40, 424.5), FOOTER, size=7.8, color=BODY)


def patch_multi_tier(page: fitz.Page) -> None:
    x0, x1 = 39.6, 752.4
    y0, y1 = 432.0, 498.0
    _redact(page, fitz.Rect(x0 - 2.0, y0 - 2.0, x1 + 2.0, y1 + 4.0))
    _draw_box(page, fitz.Rect(x0, y0, x1, y1))
    _draw_box(page, fitz.Rect(x0, y0, x1, y0 + 17.2), fill=DARK)

    _text(page, (46, y0 + 11), "Production add-on", size=7.0, bold=True, color=WHITE)
    _text(page, (155, y0 + 11), "Price", size=7.0, bold=True, color=WHITE)
    _text(page, (227, y0 + 11), "Details", size=7.0, bold=True, color=WHITE)

    row_y = y0 + 30
    _text(page, (44, row_y), "Robert's Team Demo & Media", size=8.0, bold=True, color=TIER)
    _text(page, (168, row_y), ADDON_PRICE_COMPACT, size=9.0, bold=True)
    _textbox(
        page,
        fitz.Rect(227, row_y - 8, 740, row_y + 50),
        f"{ADDON_HEADLINE} {ADDON_DETAIL} {ADDON_ALT}",
        size=8.0,
        color=TIER,
    )


PATCHERS = {
    "single": patch_single_tier,
    "duo": patch_duo_bundle,
    "multi": patch_multi_tier,
}

RESTORE_FROM = {
    "single": FUNCTIONS_DIR / "SINGLE_TIER.pdf",
    "duo": FUNCTIONS_DIR / "DUO_BUNDLE.pdf",
    "multi": FUNCTIONS_DIR / "MULTI_TIER.pdf",
}


def patch_pdf(src: Path, kind: str) -> Path:
    restore = RESTORE_FROM[kind]
    if restore.exists():
        shutil.copy2(restore, src)

    doc = fitz.open(src)
    PATCHERS[kind](doc[0])
    tmp = src.with_suffix(".patched.pdf")
    doc.save(tmp, deflate=True, garbage=4)
    doc.close()
    tmp.replace(src)
    return src


def main() -> None:
    jobs = [
        ("single", PRICING_DIR / "UNALIGNED SINGLE TIER PRICING 2026.pdf", DOCS_DIR / "SINGLE_TIER.pdf"),
        ("duo", PRICING_DIR / "UNALIGNED DUO BUNDLE PRICING 2026.pdf", DOCS_DIR / "DUO_BUNDLE.pdf"),
        ("multi", PRICING_DIR / "UNALIGNED MULTI TIER PRICING 2026.pdf", DOCS_DIR / "MULTI_TIER.pdf"),
    ]

    for kind, src, dest in jobs:
        if not src.exists():
            raise FileNotFoundError(src)
        patch_pdf(src, kind)
        shutil.copy2(src, dest)
        functions_dest = FUNCTIONS_DIR / dest.name
        shutil.copy2(src, functions_dest)
        print(f"patched {src.name} -> {dest}")


if __name__ == "__main__":
    main()