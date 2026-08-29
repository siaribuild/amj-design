"""The plan-parse container's mechanical steps — 1 (inventory), 3 (text),
5 (render + crop) of the SKILL.md method. Steps 2 (strategy) and 4 (select
pages) are Worker judgements, not mechanics, and are not here
(02-design-v2.md §1) — nor is the vision read (step 6): the container holds
no model credentials (§9 AB-5).

Every command is the one the method names: `pdfinfo`, `pdffonts`,
`pdfimages -list`, `pdfdetach -list`, `pdftotext -layout`, `pdftoppm`.
`pdfplumber` supplies per-word coordinates (step 3) and, cheaply, exact
per-page point dimensions — one library call rather than a second poppler
subprocess per page for a number `pdfinfo` does not report per-page anyway.
"""
from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path


class StepError(Exception):
    """Raised with a stable, attributable reason — never a bare stack trace
    across the wire. `server.py` maps this to a 422/500 with `.code`."""

    def __init__(self, code: str, detail: str = ""):
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code


# ─── Step 1: content inventory ───────────────────────────────────────────────

@dataclass
class PageFacts:
    page_no: int
    width_pt: float
    height_pt: float
    rotation: int
    text_chars: int
    image_count: int
    image_area_fraction: float


@dataclass
class Inventory:
    page_count: int
    producer: str | None
    fonts: list[str] = field(default_factory=list)
    has_attachments: bool = False
    pages: list[PageFacts] = field(default_factory=list)


def _run(args: list[str]) -> str:
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=60)
    except FileNotFoundError as e:
        raise StepError("bad_request", f"tool not found: {args[0]}") from e
    if result.returncode != 0:
        raise StepError("not_a_pdf", result.stderr.strip() or f"{args[0]} failed")
    return result.stdout


def inventory(pdf_path: str) -> Inventory:
    info_text = _run(["pdfinfo", pdf_path])
    info: dict[str, str] = {}
    for line in info_text.splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        info[key.strip()] = value.strip()
    page_count = int(info.get("Pages", "0") or "0")
    producer = info.get("Producer") or None

    fonts_text = _run(["pdffonts", pdf_path])
    fonts: list[str] = []
    for line in fonts_text.splitlines()[2:]:  # header + dashed separator
        line = line.strip()
        if not line:
            continue
        name = line.split()[0]
        if name and name not in fonts:
            fonts.append(name)

    attach_text = _run(["pdfdetach", "-list", pdf_path])
    has_attachments = bool(re.search(r"^\d+:", attach_text, re.MULTILINE))

    # pdfimages -list: one row per image, columns include "page" (1) and
    # pixel/ppi columns used below to estimate area coverage.
    images_text = _run(["pdfimages", "-list", pdf_path])
    images_by_page: dict[int, list[tuple[float, float]]] = {}
    for line in images_text.splitlines()[2:]:
        parts = line.split()
        if len(parts) < 14 or not parts[0].isdigit():
            continue
        page_no = int(parts[0])
        try:
            width_px, height_px = float(parts[3]), float(parts[4])
            x_ppi, y_ppi = float(parts[12]), float(parts[13])
        except (ValueError, IndexError):
            continue
        if x_ppi <= 0 or y_ppi <= 0:
            continue
        # square points covered = (px / ppi) * 72, per axis
        images_by_page.setdefault(page_no, []).append(
            ((width_px / x_ppi) * 72, (height_px / y_ppi) * 72)
        )

    # Per-page geometry and text-char counts come from pdfplumber — poppler's
    # own tools report these only document-wide or not at all.
    import pdfplumber

    pages: list[PageFacts] = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            image_rects = images_by_page.get(i, [])
            image_area = sum(w * h for w, h in image_rects)
            page_area = max(page.width * page.height, 1.0)
            pages.append(
                PageFacts(
                    page_no=i,
                    width_pt=float(page.width),
                    height_pt=float(page.height),
                    rotation=int(page.rotation or 0),
                    text_chars=len(page.extract_text() or ""),
                    image_count=len(image_rects),
                    image_area_fraction=min(image_area / page_area, 1.0),
                )
            )

    return Inventory(page_count=page_count, producer=producer, fonts=fonts,
                      has_attachments=has_attachments, pages=pages)


# ─── Step 3: text extraction ─────────────────────────────────────────────────

def page_text(pdf_path: str, page_no: int) -> str:
    """`pdftotext -layout` for one page. Layout mode: the spatial arrangement
    is what makes a title block or a schedule row legible as one line."""
    return _run(["pdftotext", "-layout", "-f", str(page_no), "-l", str(page_no), pdf_path, "-"])


@dataclass
class Word:
    text: str
    x0: float
    top: float
    x1: float
    bottom: float


def page_words(pdf_path: str, page_no: int) -> list[Word]:
    import pdfplumber

    with pdfplumber.open(pdf_path) as pdf:
        if page_no < 1 or page_no > len(pdf.pages):
            raise StepError("bad_request", f"page {page_no} out of range")
        page = pdf.pages[page_no - 1]
        return [
            Word(text=w["text"], x0=w["x0"], top=w["top"], x1=w["x1"], bottom=w["bottom"])
            for w in page.extract_words()
        ]


# ─── Step 5: rasterise + crop ────────────────────────────────────────────────

def render_page(pdf_path: str, page_no: int, dpi: int, out_prefix: str) -> str:
    """`pdftoppm -png -r <dpi> -f N -l N`. pdftoppm zero-pads the output name
    against the document's TOTAL page count, so the filename must be found
    rather than predicted."""
    subprocess.run(
        ["pdftoppm", "-png", "-r", str(dpi), "-f", str(page_no), "-l", str(page_no), pdf_path, out_prefix],
        check=True, capture_output=True, timeout=60,
    )
    out_dir = Path(out_prefix).parent
    stem = Path(out_prefix).name
    matches = sorted(out_dir.glob(f"{stem}-*.png"))
    if not matches:
        raise StepError("render_failed", f"pdftoppm produced no output for page {page_no}")
    return str(matches[-1])


def crop(image_path: str, box_px: tuple[int, int, int, int], out_path: str) -> str:
    """PIL crop to one opening's window. Architectural sheets are A3+ at a
    legible DPI; cropping is what makes the read accurate, not merely cheap."""
    from PIL import Image

    with Image.open(image_path) as img:
        x0, y0, x1, y1 = box_px
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(img.width, x1), min(img.height, y1)
        if x1 <= x0 or y1 <= y0:
            raise StepError("render_failed", "crop box has no area after clamping to the page")
        img.crop((x0, y0, x1, y1)).save(out_path, "PNG")
    return out_path
