"""Render PDF pages to WebP images (used by notices and lesson files).

Pages render one at a time, because pdfium is not thread-safe, while WebP
encoding runs on a few threads (Pillow releases the GIL for it). At most
`workers` rendered bitmaps are held in memory, whatever the page count.
"""

from collections import deque
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO

import pypdfium2 as pdfium

RENDER_WIDTH = 1600  # pixels; sharp on retina phones, readable full-width on desktop
MAX_RENDER_HEIGHT = 8000
MAX_SCALE = 4.0
WORKERS = 4
WEBP_METHOD = 4  # 6 is ~2-3x slower for a few percent smaller files


class PdfError(Exception):
    """The PDF can't be shown; the message is safe to show to the uploader."""


def _encode(image) -> tuple[bytes, int, int]:
    buf = BytesIO()
    image.save(buf, format="WEBP", quality=88, method=WEBP_METHOD)
    return buf.getvalue(), image.width, image.height


def page_count(data: bytes, *, max_pages: int) -> int:
    """Open the PDF and check its size without rendering anything."""
    pdf = _open(data)
    try:
        return _checked_count(pdf, max_pages)
    finally:
        pdf.close()


def render_pages(data: bytes, *, max_pages: int, workers: int = WORKERS) -> Iterator[tuple[bytes, int, int]]:
    """Yield (webp bytes, width, height) for each page, in order."""
    pdf = _open(data)
    try:
        count = _checked_count(pdf, max_pages)
        with ThreadPoolExecutor(max_workers=workers) as pool:
            pending = deque()
            for index in range(count):
                pending.append(pool.submit(_encode, _render(pdf, index)))
                if len(pending) >= workers:
                    yield pending.popleft().result()
            while pending:
                yield pending.popleft().result()
    finally:
        pdf.close()


def _open(data: bytes):
    try:
        return pdfium.PdfDocument(data)
    except pdfium.PdfiumError:
        raise PdfError("The PDF could not be opened. It may be damaged or password-protected.") from None


def _checked_count(pdf, max_pages: int) -> int:
    count = len(pdf)
    if count == 0:
        raise PdfError("The PDF has no pages.")
    if count > max_pages:
        raise PdfError(f"PDFs can have at most {max_pages} pages here; this one has {count}.")
    return count


def _render(pdf, index: int):
    page = pdf[index]
    try:
        width, height = page.get_size()
        if width <= 0 or height <= 0:
            raise PdfError(f"Page {index + 1} of the PDF has no size.")
        scale = min(RENDER_WIDTH / width, MAX_RENDER_HEIGHT / height, MAX_SCALE)
        return page.render(scale=scale).to_pil().convert("RGB")
    except pdfium.PdfiumError:
        raise PdfError(f"Page {index + 1} of the PDF could not be rendered.") from None
    finally:
        page.close()
