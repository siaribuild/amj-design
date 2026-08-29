"""Plan-parse container HTTP server — stdlib only, no framework dependency
for two endpoints and a readiness probe.

Request framing (02-design-v2.md §3.1): one JSON line, `\\n`, then raw PDF
bytes. One job per request — statelessness over a byte-cache
(`// ponytail: PDF re-sent per request; add a checksum-keyed /tmp cache
behind these endpoints if wall time says so`).

The container never sees a tag, a filename, an R2 key or a model prompt —
only page numbers, DPI and point-space crop boxes. Access log is silenced
(§9 AB-8: no customer identifiers in container logs).
"""
from __future__ import annotations

import base64
import json
import shutil
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from steps import StepError, crop, inspect_document, measure_profile, prepare_crop, render_page

# Mirrors worker/lib/drawing/contract.ts — kept in sync by convention, not
# import (no shared build step across the language boundary); the Worker
# enforces these first anyway (AB-6), so a drift here is defence-in-depth
# only, never the gate.
MAX_PDF_BYTES = 40 * 1024 * 1024
MAX_PAGES = 60
MAX_DPI = 300


def _json_bytes(obj) -> bytes:
    return json.dumps(obj).encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):  # noqa: A002 — stdlib's signature
        pass  # silent: no request line, no path, no bytes — AB-8

    def _send(self, status: int, obj) -> None:
        body = _json_bytes(obj)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_framed_body(self) -> tuple[dict, bytes]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_PDF_BYTES + 4096:
            raise StepError("too_large")
        raw = self.rfile.read(length)
        newline = raw.find(b"\n")
        if newline < 0:
            raise StepError("bad_request", "missing JSON header line")
        header = json.loads(raw[:newline].decode("utf-8"))
        pdf_bytes = raw[newline + 1:]
        if len(pdf_bytes) > MAX_PDF_BYTES:
            raise StepError("too_large")
        if pdf_bytes[:5] != b"%PDF-":
            raise StepError("not_a_pdf")
        return header, pdf_bytes

    def do_GET(self):  # noqa: N802 — stdlib's method name
        if self.path == "/":
            ready = shutil.which("pdftoppm") is not None and shutil.which("pdfinfo") is not None
            self._send(200 if ready else 503, {"ready": ready})
            return
        self._send(404, {"error": "not_found"})

    def do_POST(self):  # noqa: N802
        try:
            if self.path == "/inspect":
                self._handle_inspect()
            elif self.path == "/render":
                self._handle_render()
            else:
                self._send(404, {"error": "not_found"})
        except StepError as e:
            status = {"too_large": 413, "bad_request": 400, "not_a_pdf": 422, "render_failed": 500}.get(e.code, 500)
            self._send(status, {"error": e.code})
        except Exception:
            self._send(500, {"error": "render_failed"})

    def _handle_inspect(self):
        header, pdf_bytes = self._read_framed_body()
        max_pages = min(int(header.get("maxPages", MAX_PAGES)), MAX_PAGES)
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = str(Path(tmp) / "in.pdf")
            Path(pdf_path).write_bytes(pdf_bytes)
            inv, texts, words_by_page, lines_by_page, timings = inspect_document(pdf_path)
            if inv.page_count > max_pages:
                raise StepError("bad_request", "page count exceeds maxPages")
            pages = []
            for pf, text, words, lines in zip(inv.pages, texts, words_by_page, lines_by_page):
                pages.append({
                    "pageNo": pf.page_no,
                    "text": text,
                    "words": [{"text": w.text, "x0": w.x0, "top": w.top, "x1": w.x1, "bottom": w.bottom} for w in words],
                    "lines": [{"x0": line.x0, "top": line.top, "x1": line.x1, "bottom": line.bottom} for line in lines],
                })
            self._send(200, {
                "inventory": {
                    "pageCount": inv.page_count,
                    "producer": inv.producer,
                    "fonts": inv.fonts,
                    "hasAttachments": inv.has_attachments,
                    "pages": [
                        {"pageNo": pf.page_no, "widthPt": pf.width_pt, "heightPt": pf.height_pt,
                         "rotation": pf.rotation, "textChars": pf.text_chars,
                         "imageCount": pf.image_count, "imageAreaFraction": pf.image_area_fraction}
                        for pf in inv.pages
                    ],
                },
                "pages": pages,
                "timings": timings,
            })

    def _handle_render(self):
        header, pdf_bytes = self._read_framed_body()
        page_no = int(header["pageNo"])
        dpi = min(int(header.get("dpi", 150)), MAX_DPI)
        crops = header.get("crops")
        threshold = header.get("threshold")
        if threshold is not None and (not isinstance(threshold, int) or threshold < 0 or threshold > 255):
            raise StepError("bad_request", "threshold outside 0..255")
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = str(Path(tmp) / "in.pdf")
            Path(pdf_path).write_bytes(pdf_bytes)
            rendered_path = render_page(pdf_path, page_no, dpi, str(Path(tmp) / "page"))
            images = []
            if crops:
                from PIL import Image
                with Image.open(rendered_path) as full:
                    px_per_pt = dpi / 72.0
                    for i, (x0, y0, x1, y1) in enumerate(crops):
                        box_px = (round(x0 * px_per_pt), round(y0 * px_per_pt),
                                  round(x1 * px_per_pt), round(y1 * px_per_pt))
                        out_path = str(Path(tmp) / f"crop{i}.png")
                        crop(rendered_path, box_px, out_path)
                        prepare_crop(out_path, threshold=threshold)
                        with Image.open(out_path) as c:
                            images.append({"pngB64": base64.b64encode(Path(out_path).read_bytes()).decode("ascii"),
                                           "widthPx": c.width, "heightPx": c.height,
                                           "profile": measure_profile(out_path)})
            else:
                from PIL import Image
                with Image.open(rendered_path) as full:
                    images.append({"pngB64": base64.b64encode(Path(rendered_path).read_bytes()).decode("ascii"),
                                   "widthPx": full.width, "heightPx": full.height})
            self._send(200, {"images": images, "dpi": dpi})


def main():
    server = ThreadingHTTPServer(("0.0.0.0", 8080), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
