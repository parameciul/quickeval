"""Put a QR code in the bottom-right corner of every page of a PDF.

Usage: python3 stamp_qr.py IN.pdf OUT.pdf URL LABEL

A page whose bottom strip holds no text, drawing or image keeps its size. Any
other page is shown a little smaller, centered at the top, so the QR code never
covers content. Pages stay vectors. Prints "pages=<n>" on success. Exit codes:
2 for a file that is not a readable, unencrypted PDF (nothing is printed), 3
when the result does not have the page count of the source, 4 when the stamping
itself fails (nothing is printed: the arguments hold the student link).
"""
import sys

import pymupdf
import segno

QR_PT = 64       # about 2.26 cm, quiet zone included
MARGIN = 14      # from the paper edge
TEXT_PT = 6.5
BAND = QR_PT + MARGIN + 4
QUIET_MODULES = 4
BACKGROUND_SHARE = 0.9


def overlaps(rect, strip):
    common = pymupdf.Rect(rect) & strip
    return not common.is_empty and common.width > 0 and common.height > 0


def touches(rect, strip):
    # A rule or a hairline has a zero-width or zero-height box, so edges count.
    return rect.x0 <= strip.x1 and rect.x1 >= strip.x0 and rect.y0 <= strip.y1 and rect.y1 >= strip.y0


def is_light_background(drawing, rect, page_area):
    """A light fill over (nearly) the whole page: paper, not content. A dark one
    would hide the black QR code, so it counts as content."""
    fill = drawing.get('fill')
    if fill is None or rect.width * rect.height < BACKGROUND_SHARE * page_area:
        return False
    if len(fill) == 3:
        luminance = 0.299 * fill[0] + 0.587 * fill[1] + 0.114 * fill[2]
    else:
        luminance = sum(fill) / len(fill)
    return luminance >= 0.5


def strip_is_empty(page, strip):
    """True when no text, drawing, or image of the page reaches the strip."""
    page_area = page.rect.width * page.rect.height
    for block in page.get_text('blocks'):
        if overlaps(block[:4], strip):
            return False
    for drawing in page.get_drawings():
        rect = pymupdf.Rect(drawing['rect'])
        if is_light_background(drawing, rect, page_area):
            continue
        if touches(rect, strip):
            return False
    for image in page.get_image_info():
        if overlaps(image['bbox'], strip):
            return False
    return True


def stamp(src, out, url, label):
    """Writes the stamped copy of src to out and returns its page count."""
    source = pymupdf.open(src)
    result = pymupdf.open()
    modules = segno.make(url, error='m').matrix
    cell = QR_PT / (len(modules) + 2 * QUIET_MODULES)
    for index, page in enumerate(source):
        width, height = page.rect.width, page.rect.height
        scale = 1 if strip_is_empty(page, pymupdf.Rect(0, height - BAND, width, height)) else (height - BAND) / height
        new = result.new_page(width=width, height=height)
        left = (width - width * scale) / 2
        new.show_pdf_page(pymupdf.Rect(left, 0, left + width * scale, height * scale), source, index)
        x0 = width - MARGIN - QR_PT
        y0 = height - MARGIN - QR_PT
        shape = new.new_shape()
        for row, line in enumerate(modules):
            for col, dark in enumerate(line):
                if dark:
                    x = x0 + (col + QUIET_MODULES) * cell
                    y = y0 + (row + QUIET_MODULES) * cell
                    shape.draw_rect(pymupdf.Rect(x, y, x + cell, y + cell))
        shape.finish(color=None, fill=(0, 0, 0), width=0)
        shape.commit()
        new.insert_text((MARGIN, height - MARGIN - 2), label, fontsize=TEXT_PT, fontname='helv', color=(0.3, 0.3, 0.3))
    count = len(source)
    result.save(out, garbage=3, deflate=True)
    result.close()
    source.close()
    return count


def readable_pages(src):
    """The page count of src, or None when it is not a readable, unencrypted PDF."""
    document = None
    try:
        document = pymupdf.open(src)
        if document.needs_pass or document.is_encrypted or not document.is_pdf or len(document) == 0:
            return None
        return len(document)
    except Exception:
        return None
    finally:
        if document is not None:
            document.close()


def main(argv):
    if len(argv) != 5:
        return 2
    src, out, url, label = argv[1:5]
    if readable_pages(src) is None:
        return 2
    try:
        count = stamp(src, out, url, label)
    except Exception:
        return 4
    if readable_pages(out) != count:
        return 3
    print(f'pages={count}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
