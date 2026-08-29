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
import time
import math
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


# ─── Step 3: text extraction ─────────────────────────────────────────────────


@dataclass
class Word:
    text: str
    x0: float
    top: float
    x1: float
    bottom: float


@dataclass
class Line:
    x0: float
    top: float
    x1: float
    bottom: float


def _document_text(pdf_path: str, page_count: int) -> list[str]:
    raw = _run(["pdftotext", "-layout", pdf_path, "-"])
    pages = raw.split("\f")
    if len(pages) > page_count and not pages[-1].strip():
        pages.pop()
    if len(pages) < page_count:
        pages.extend([""] * (page_count - len(pages)))
    return pages[:page_count]


def inspect_document(pdf_path: str) -> tuple[Inventory, list[str], list[list[Word]], list[list[Line]], dict[str, int]]:
    """One inspect pass: metadata tools once, pdftotext once, pdfplumber once.

    This is the sole inventory/text/word implementation. Keeping the tests
    on this seam prevents a slower legacy path from drifting back in.
    """
    total_started = time.perf_counter()
    inventory_started = time.perf_counter()

    info_text = _run(["pdfinfo", pdf_path])
    info: dict[str, str] = {}
    for line in info_text.splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            info[key.strip()] = value.strip()
    page_count = int(info.get("Pages", "0") or "0")
    producer = info.get("Producer") or None

    fonts_text = _run(["pdffonts", pdf_path])
    fonts: list[str] = []
    for line in fonts_text.splitlines()[2:]:
        name = line.strip().split()[0] if line.strip() else ""
        if name and name not in fonts:
            fonts.append(name)
    has_attachments = bool(re.search(r"^\d+:", _run(["pdfdetach", "-list", pdf_path]), re.MULTILINE))

    images_text = _run(["pdfimages", "-list", pdf_path])
    images_by_page: dict[int, list[tuple[float, float]]] = {}
    for line in images_text.splitlines()[2:]:
        parts = line.split()
        if len(parts) < 14 or not parts[0].isdigit():
            continue
        try:
            page_no = int(parts[0])
            width_px, height_px = float(parts[3]), float(parts[4])
            x_ppi, y_ppi = float(parts[12]), float(parts[13])
        except (ValueError, IndexError):
            continue
        if x_ppi > 0 and y_ppi > 0:
            images_by_page.setdefault(page_no, []).append(((width_px / x_ppi) * 72, (height_px / y_ppi) * 72))
    inventory_ms = round((time.perf_counter() - inventory_started) * 1000)

    text_started = time.perf_counter()
    texts = _document_text(pdf_path, page_count)
    text_ms = round((time.perf_counter() - text_started) * 1000)

    words_started = time.perf_counter()
    import pdfplumber

    pages: list[PageFacts] = []
    words_by_page: list[list[Word]] = []
    lines_by_page: list[list[Line]] = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            raw_words = page.extract_words()
            words = [Word(text=w["text"], x0=w["x0"], top=w["top"], x1=w["x1"], bottom=w["bottom"]) for w in raw_words]
            words_by_page.append(words)
            lines: list[Line] = []
            for raw_line in page.lines:
                lines.append(Line(
                    x0=float(raw_line.get("x0", 0)), top=float(raw_line.get("top", 0)),
                    x1=float(raw_line.get("x1", 0)), bottom=float(raw_line.get("bottom", raw_line.get("top", 0))),
                ))
            for rect in page.rects:
                x0, x1 = float(rect.get("x0", 0)), float(rect.get("x1", 0))
                top, bottom = float(rect.get("top", 0)), float(rect.get("bottom", 0))
                lines.extend([
                    Line(x0=x0, top=top, x1=x1, bottom=top),
                    Line(x0=x0, top=bottom, x1=x1, bottom=bottom),
                    Line(x0=x0, top=top, x1=x0, bottom=bottom),
                    Line(x0=x1, top=top, x1=x1, bottom=bottom),
                ])
            lines_by_page.append(lines)
            image_rects = images_by_page.get(i, [])
            image_area = sum(width * height for width, height in image_rects)
            page_area = max(page.width * page.height, 1.0)
            pages.append(PageFacts(
                page_no=i,
                width_pt=float(page.width),
                height_pt=float(page.height),
                rotation=int(page.rotation or 0),
                text_chars=sum(len(word.text) for word in words),
                image_count=len(image_rects),
                image_area_fraction=min(image_area / page_area, 1.0),
            ))
    words_ms = round((time.perf_counter() - words_started) * 1000)
    total_ms = round((time.perf_counter() - total_started) * 1000)
    return (
        Inventory(page_count=page_count, producer=producer, fonts=fonts, has_attachments=has_attachments, pages=pages),
        texts,
        words_by_page,
        lines_by_page,
        {"inventoryMs": inventory_ms, "textMs": text_ms, "wordsMs": words_ms, "totalMs": total_ms},
    )


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


def prepare_crop(image_path: str, threshold: int | None = None, min_short_edge: int = 800) -> str:
    """Make a crop legible without inventing geometry: integer nearest-neighbour
    upscale, then the one documented faint-line threshold when requested."""
    from PIL import Image

    with Image.open(image_path) as source:
        image = source.convert("L")
        short_edge = min(image.size)
        if short_edge < min_short_edge:
            scale = math.ceil(min_short_edge / max(short_edge, 1))
            image = image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)
        if threshold is not None:
            image = image.point(lambda value: 0 if value < threshold else value)
        image.save(image_path, "PNG")
    return image_path


def _continuous_dark_peaks(image, vertical: bool) -> list[float]:
    from PIL import Image

    major = image.width if vertical else image.height
    # Threshold before averaging so the native PIL reduction preserves the
    # original metric: fraction of pixels darker than 180, not mean luminance.
    dark_mask = image.point(lambda value: 255 if value < 180 else 0)
    profile = dark_mask.resize((major, 1) if vertical else (1, major), Image.Resampling.BOX)
    candidates = [
        index for index, score in enumerate(profile.tobytes())
        if score >= round(0.55 * 255) and 0.05 * major < index < 0.95 * major
    ]
    groups: list[list[int]] = []
    for index in candidates:
        if groups and index <= groups[-1][-1] + 1:
            groups[-1].append(index)
        else:
            groups.append([index])
    return [round((sum(group) / len(group)) / major, 4) for group in groups]


def measure_profile(image_path: str) -> dict[str, list[float]]:
    from PIL import Image

    with Image.open(image_path) as source:
        image = source.convert("L")
        return {
            "mullionXs": _continuous_dark_peaks(image, True),
            "transomYs": _continuous_dark_peaks(image, False),
        }
