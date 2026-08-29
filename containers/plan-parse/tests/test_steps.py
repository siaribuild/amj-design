"""pytest over a synthetic, hand-built PDF — no scanned/real drawing ever
enters this repo (AB-9). The fixture is generated in-process rather than
committed as bytes, so there is no PDF file to accidentally commit either.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402

from steps import StepError, crop, inspect_document, measure_profile, prepare_crop, render_page  # noqa: E402


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


@pytest.fixture()
def inspection(synthetic_pdf):
    return inspect_document(synthetic_pdf)


def test_inventory_reads_page_count_and_geometry(inspection):
    inv = inspection[0]
    assert inv.page_count == 1
    assert len(inv.pages) == 1
    page = inv.pages[0]
    assert page.width_pt == pytest.approx(842, abs=1)
    assert page.height_pt == pytest.approx(1191, abs=1)
    assert page.text_chars > 0


def test_inventory_finds_no_attachments_in_a_plain_pdf(inspection):
    assert inspection[0].has_attachments is False


def test_page_text_reads_the_printed_string(inspection):
    text = inspection[1][0]
    assert "W1" in text
    assert "AWNING" in text


def test_page_words_locates_coordinates_for_each_word(inspection):
    words = inspection[2][0]
    assert any(w.text == "AWNING" for w in words)
    for w in words:
        assert 0 <= w.x0 < w.x1
        assert 0 <= w.top < w.bottom


def test_inspect_document_reads_text_and_words_in_one_document_pass(synthetic_pdf, monkeypatch):
    import steps

    real_run = steps._run
    calls = []

    def counted(args):
        calls.append(args)
        return real_run(args)

    monkeypatch.setattr(steps, "_run", counted)
    inv, texts, words, timings = inspect_document(synthetic_pdf)
    assert inv.page_count == 1
    assert "AWNING" in texts[0]
    assert any(word.text == "W1" for word in words[0])
    assert len([args for args in calls if args[0] == "pdftotext"]) == 1
    assert set(timings) == {"inventoryMs", "textMs", "wordsMs", "totalMs"}
    assert all(value >= 0 for value in timings.values())


def test_inspect_document_does_not_enumerate_cad_lines_or_rectangles():
    import inspect
    import steps

    source = inspect.getsource(steps.inspect_document)
    assert "page.lines" not in source
    assert "page.rects" not in source
    assert "pdfplumber" not in source


def test_document_words_uses_one_poppler_bbox_layout_pass_not_python_operator_parsing():
    import inspect
    import steps

    source = inspect.getsource(steps._document_text_and_words)
    assert '"-bbox-layout"' in source
    assert "pdfplumber" not in source


def test_inspect_document_is_the_only_inventory_text_word_entrypoint():
    import steps

    assert not hasattr(steps, "inventory")
    assert not hasattr(steps, "page_text")
    assert not hasattr(steps, "page_words")


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


def test_prepare_crop_upscales_and_thresholds_without_changing_aspect(tmp_path):
    from PIL import Image

    path = tmp_path / "small.png"
    image = Image.new("L", (300, 200), 255)
    image.putpixel((10, 10), 200)
    image.save(path)
    prepare_crop(str(path), threshold=250)
    with Image.open(path) as prepared:
        assert prepared.size == (1200, 800)
        assert prepared.getpixel((40, 40)) == 0


def test_measure_profile_returns_only_interior_continuous_divisions(tmp_path):
    from PIL import Image, ImageDraw

    path = tmp_path / "profile.png"
    image = Image.new("L", (900, 600), 255)
    draw = ImageDraw.Draw(image)
    draw.line((10, 0, 10, 599), fill=0, width=3)      # frame-like: excluded
    draw.line((300, 0, 300, 599), fill=0, width=3)   # mullion
    image.save(path)
    profile = measure_profile(str(path))
    assert profile["mullionXs"] == [pytest.approx(1 / 3, abs=0.01)]
    assert profile["transomYs"] == []


def test_measure_profile_counts_dark_pixels_before_native_averaging(tmp_path):
    from PIL import Image, ImageDraw

    path = tmp_path / "profile-threshold.png"
    image = Image.new("L", (100, 100), 255)
    draw = ImageDraw.Draw(image)
    draw.line((30, 0, 30, 54), fill=179)  # 55% genuinely dark: a division.
    draw.line((60, 0, 60, 99), fill=200)  # Lower mean, but no pixel is dark.
    image.save(path)

    profile = measure_profile(str(path))
    assert profile["mullionXs"] == [pytest.approx(0.3, abs=0.01)]
    assert profile["transomYs"] == []
