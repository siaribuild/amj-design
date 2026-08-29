"""pytest over a synthetic, hand-built PDF — no scanned/real drawing ever
enters this repo (AB-9). The fixture is generated in-process rather than
committed as bytes, so there is no PDF file to accidentally commit either.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402

from steps import StepError, crop, inventory, page_text, page_words, render_page  # noqa: E402


def make_synthetic_pdf(text: str = "W1  600 x 1200  AWNING", width: float = 842, height: float = 1191) -> bytes:
    """A single-page PDF with one Helvetica text run, built by hand — the
    classic minimal-PDF byte layout, not a library, so this test suite adds
    no dependency the container image does not already carry."""
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (f"<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> "
         f"/MediaBox [0 0 {width} {height}] /Contents 5 0 R >>").encode("ascii"),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    stream = f"BT /F1 24 Tf 72 {height - 100} Td ({text}) Tj ET".encode("ascii")
    objects.append(f"<< /Length {len(stream)} >>\nstream\n".encode("ascii") + stream + b"\nendstream")

    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode("ascii") + body + b"\nendobj\n"
    xref_offset = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode("ascii")
    out += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        out += f"{off:010d} 00000 n \n".encode("ascii")
    out += (f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
             f"startxref\n{xref_offset}\n%%EOF").encode("ascii")
    return bytes(out)


@pytest.fixture()
def synthetic_pdf(tmp_path):
    path = tmp_path / "synthetic.pdf"
    path.write_bytes(make_synthetic_pdf())
    return str(path)


def test_inventory_reads_page_count_and_geometry(synthetic_pdf):
    inv = inventory(synthetic_pdf)
    assert inv.page_count == 1
    assert len(inv.pages) == 1
    page = inv.pages[0]
    assert page.width_pt == pytest.approx(842, abs=1)
    assert page.height_pt == pytest.approx(1191, abs=1)
    assert page.text_chars > 0


def test_inventory_finds_no_attachments_in_a_plain_pdf(synthetic_pdf):
    assert inventory(synthetic_pdf).has_attachments is False


def test_page_text_reads_the_printed_string(synthetic_pdf):
    text = page_text(synthetic_pdf, 1)
    assert "W1" in text
    assert "AWNING" in text


def test_page_words_locates_coordinates_for_each_word(synthetic_pdf):
    words = page_words(synthetic_pdf, 1)
    assert any(w.text == "AWNING" for w in words)
    for w in words:
        assert 0 <= w.x0 < w.x1
        assert 0 <= w.top < w.bottom


def test_page_words_out_of_range_page_refuses(synthetic_pdf):
    with pytest.raises(StepError):
        page_words(synthetic_pdf, 99)


def test_render_page_writes_a_png_and_crop_extracts_a_sub_window(synthetic_pdf, tmp_path):
    out_prefix = str(tmp_path / "page")
    rendered = render_page(synthetic_pdf, 1, dpi=72, out_prefix=out_prefix)
    assert Path(rendered).exists()

    from PIL import Image

    with Image.open(rendered) as full:
        full_w, full_h = full.size
    cropped_path = str(tmp_path / "crop.png")
    crop(rendered, (0, 0, full_w // 2, full_h // 2), cropped_path)
    with Image.open(cropped_path) as c:
        assert c.width == full_w // 2
        assert c.height == full_h // 2


def test_crop_box_with_no_area_refuses(synthetic_pdf, tmp_path):
    out_prefix = str(tmp_path / "page")
    rendered = render_page(synthetic_pdf, 1, dpi=72, out_prefix=out_prefix)
    with pytest.raises(StepError):
        crop(rendered, (10, 10, 10, 10), str(tmp_path / "empty.png"))
