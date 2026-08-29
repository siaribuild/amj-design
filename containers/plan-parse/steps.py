"""The plan-parse container's mechanical steps — 1 (inventory), 3 (text),
5 (render + crop) of the SKILL.md method. Steps 2 (strategy) and 4 (select
pages) are Worker judgements, not mechanics, and are not here
(02-design-v2.md §1) — nor is the vision read (step 6): the container holds
no model credentials (§9 AB-5).

Every command is the one the method names: `pdfinfo`, `pdffonts`,
`pdfimages -list`, `pdfdetach -list`, `pdftotext -bbox-layout`, `pdftoppm`.
`pdftotext -bbox-layout` supplies layout text, per-word coordinates and page dimensions in
one native Poppler call. Do not replace it with pdfminer/pdfplumber: CAD PDFs
can contain hundreds of thousands of drawing operators, which made the same
word pass take 107 seconds on the reference set.
"""
from __future__ import annotations

import re
import subprocess
import time
import math
import xml.etree.ElementTree as ET
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


def _document_text_and_words(
    pdf_path: str,
    page_count: int,
) -> tuple[list[str], list[list[Word]], list[tuple[float, float]]]:
    """Read layout text and positioned words with Poppler's native engine.

    The XHTML page/word boxes use the same top-left coordinate convention the
    Worker contract already expects. Page elements are emitted even when a page
    has no words, so scanned pages retain their exact dimensions.
    """
    raw = _run(["pdftotext", "-bbox-layout", "-enc", "UTF-8", pdf_path, "-"])
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as error:
        raise StepError("not_a_pdf", "pdftotext word-box output was malformed") from error
    page_nodes = [node for node in root.iter() if node.tag.rsplit("}", 1)[-1] == "page"]
    if len(page_nodes) != page_count:
        raise StepError("not_a_pdf", "pdftotext word-box page count mismatch")

    texts: list[str] = []
    words_by_page: list[list[Word]] = []
    page_sizes: list[tuple[float, float]] = []
    for page in page_nodes:
        try:
            page_sizes.append((float(page.attrib["width"]), float(page.attrib["height"])))
        except (KeyError, ValueError) as error:
            raise StepError("not_a_pdf", "pdftotext omitted a page dimension") from error
        words: list[Word] = []
        for node in page.iter():
            if node.tag.rsplit("}", 1)[-1] != "word":
                continue
            text = "".join(node.itertext()).strip()
            if not text:
                continue
            try:
                words.append(Word(
                    text=text,
                    x0=float(node.attrib["xMin"]),
                    top=float(node.attrib["yMin"]),
                    x1=float(node.attrib["xMax"]),
                    bottom=float(node.attrib["yMax"]),
                ))
            except (KeyError, ValueError) as error:
                raise StepError("not_a_pdf", "pdftotext emitted an invalid word box") from error
        words_by_page.append(words)
        lines: list[str] = []
        for line in page.iter():
            if line.tag.rsplit("}", 1)[-1] != "line":
                continue
            line_words = [
                "".join(node.itertext()).strip()
                for node in line.iter()
                if node.tag.rsplit("}", 1)[-1] == "word"
            ]
            rendered = " ".join(word for word in line_words if word)
            if rendered:
                lines.append(rendered)
        texts.append("\n".join(lines) if lines else " ".join(word.text for word in words))
    return texts, words_by_page, page_sizes


def inspect_document(pdf_path: str) -> tuple[Inventory, list[str], list[list[Word]], dict[str, int]]:
    """One inspect pass: metadata tools once, then one Poppler text/word pass.

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

    words_started = time.perf_counter()
    pages: list[PageFacts] = []
    texts, words_by_page, page_sizes = _document_text_and_words(pdf_path, page_count)
    for i, (words, (width_pt, height_pt)) in enumerate(zip(words_by_page, page_sizes), start=1):
        image_rects = images_by_page.get(i, [])
        image_area = sum(width * height for width, height in image_rects)
        page_area = max(width_pt * height_pt, 1.0)
        pages.append(PageFacts(
            page_no=i,
            width_pt=width_pt,
            height_pt=height_pt,
            rotation=0,
            text_chars=sum(len(word.text) for word in words),
            image_count=len(image_rects),
            image_area_fraction=min(image_area / page_area, 1.0),
        ))
    words_ms = round((time.perf_counter() - words_started) * 1000)
    text_ms = 0  # Text and word boxes share the single measured Poppler pass.
    total_ms = round((time.perf_counter() - total_started) * 1000)
    return (
        Inventory(page_count=page_count, producer=producer, fonts=fonts, has_attachments=has_attachments, pages=pages),
        texts,
        words_by_page,
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
