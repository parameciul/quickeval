import os
import subprocess
import sys
import tempfile
import unittest
import zipfile

import cv2
import numpy
import pymupdf

sys.path.insert(0, '/app')
import stamp_qr  # noqa: E402

URL = 'https://quickeval.pages.dev/u/abcdefghijkmnop3'
LABEL = 'quickeval.pages.dev/u/abcdefghijkmnop3'
A4 = (595, 842)


def make_pdf(path, pages):
    """pages: a list of (width, height, [(y, text)])."""
    doc = pymupdf.open()
    for width, height, lines in pages:
        page = doc.new_page(width=width, height=height)
        for y, text in lines:
            page.insert_text((60, y), text, fontsize=12)
    doc.save(path)


def decode(page):
    pix = page.get_pixmap(dpi=300, colorspace=pymupdf.csGRAY)
    image = numpy.frombuffer(pix.samples, dtype=numpy.uint8).reshape(pix.height, pix.width)
    return cv2.QRCodeDetector().detectAndDecode(image)[0]


def text_bbox(page, needle):
    for block in page.get_text('blocks'):
        if needle in block[4]:
            return pymupdf.Rect(block[:4])
    raise AssertionError(f'{needle} not found')


def strip_of(width, height):
    return pymupdf.Rect(0, height - stamp_qr.BAND, width, height)


class StampTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)

    def path(self, name):
        return os.path.join(self.dir.name, name)

    def run_script(self, src, out):
        return subprocess.run(
            [sys.executable, '/app/stamp_qr.py', src, out, URL, LABEL], capture_output=True, text=True
        )

    def test_keeps_the_page_count_and_the_link(self):
        src, out = self.path('in.pdf'), self.path('out.pdf')
        make_pdf(src, [(*A4, [(100, 'Page one')]), (*A4, [(100, 'Page two')])])
        self.assertEqual(stamp_qr.stamp(src, out, URL, LABEL), 2)
        result = pymupdf.open(out)
        self.assertEqual(len(result), 2)
        for page in result:
            self.assertEqual(decode(page), URL)

    def test_keeps_a_page_whose_strip_is_empty_at_full_size(self):
        src, out = self.path('in.pdf'), self.path('out.pdf')
        make_pdf(src, [(*A4, [(100, 'Top text')])])
        before = text_bbox(pymupdf.open(src)[0], 'Top text')
        stamp_qr.stamp(src, out, URL, LABEL)
        after = text_bbox(pymupdf.open(out)[0], 'Top text')
        for a, b in zip(before, after):
            self.assertAlmostEqual(a, b, delta=0.5)

    def test_shrinks_a_page_whose_bottom_strip_has_text(self):
        src, out = self.path('in.pdf'), self.path('out.pdf')
        make_pdf(src, [(*A4, [(100, 'Top text'), (A4[1] - 30, 'Bottom text')])])
        self.assertFalse(stamp_qr.strip_is_empty(pymupdf.open(src)[0], strip_of(*A4)))
        stamp_qr.stamp(src, out, URL, LABEL)
        page = pymupdf.open(out)[0]
        self.assertLessEqual(text_bbox(page, 'Bottom text').y1, A4[1] - stamp_qr.BAND + 0.5)
        qr = pymupdf.Rect(
            A4[0] - stamp_qr.MARGIN - stamp_qr.QR_PT,
            A4[1] - stamp_qr.MARGIN - stamp_qr.QR_PT,
            A4[0] - stamp_qr.MARGIN,
            A4[1] - stamp_qr.MARGIN,
        )
        for needle in ('Top text', 'Bottom text'):
            self.assertFalse(qr.intersects(text_bbox(page, needle)))
        self.assertEqual(decode(page), URL)

    def test_a_full_page_background_does_not_count_as_content(self):
        src = self.path('in.pdf')
        doc = pymupdf.open()
        page = doc.new_page(width=A4[0], height=A4[1])
        page.draw_rect(page.rect, fill=(0.95, 0.95, 0.95), color=None)
        doc.save(src)
        self.assertTrue(stamp_qr.strip_is_empty(pymupdf.open(src)[0], strip_of(*A4)))

    def test_a_drawing_in_the_strip_is_content(self):
        src = self.path('in.pdf')
        doc = pymupdf.open()
        page = doc.new_page(width=A4[0], height=A4[1])
        page.draw_line((50, 800), (500, 800))
        doc.save(src)
        self.assertFalse(stamp_qr.strip_is_empty(pymupdf.open(src)[0], strip_of(*A4)))

    def test_handles_a_landscape_page(self):
        src, out = self.path('in.pdf'), self.path('out.pdf')
        make_pdf(src, [(842, 595, [(100, 'Wide')])])
        stamp_qr.stamp(src, out, URL, LABEL)
        page = pymupdf.open(out)[0]
        self.assertEqual((round(page.rect.width), round(page.rect.height)), (842, 595))
        self.assertEqual(decode(page), URL)

    def test_refuses_a_file_that_is_not_a_pdf(self):
        src = self.path('in.pdf')
        with open(src, 'wb') as handle:
            handle.write(b'not a pdf at all')
        result = self.run_script(src, self.path('out.pdf'))
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, '')

    def test_refuses_an_encrypted_pdf(self):
        src = self.path('in.pdf')
        doc = pymupdf.open()
        doc.new_page()
        doc.save(src, encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw='x', owner_pw='y')
        result = self.run_script(src, self.path('out.pdf'))
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, '')

    def test_prints_the_page_count(self):
        src = self.path('in.pdf')
        make_pdf(src, [(*A4, [(100, 'One')])])
        result = self.run_script(src, self.path('out.pdf'))
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), 'pages=1')


DOCUMENT = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    ' xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">'
    '<w:body><w:p><w:r><w:t>A∖B si ℕ* :</w:t></w:r>'
    '<m:oMath><m:func><m:fName><m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t>sup</m:t></m:r></m:fName>'
    '<m:e><m:r><m:t>A</m:t></m:r></m:e></m:func><m:r><m:t>=ℝ</m:t></m:r></m:oMath></w:p></w:body></w:document>'
)
CONTENT_TYPES = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/word/document.xml"'
    ' ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
)
RELS = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1"'
    ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"'
    ' Target="word/document.xml"/></Relationships>'
)


class ConvertTest(unittest.TestCase):
    def test_converts_word_math_without_broken_signs(self):
        with tempfile.TemporaryDirectory() as folder:
            docx, pdf = os.path.join(folder, 'in.docx'), os.path.join(folder, 'out.pdf')
            with zipfile.ZipFile(docx, 'w') as archive:
                archive.writestr('[Content_Types].xml', CONTENT_TYPES)
                archive.writestr('_rels/.rels', RELS)
                archive.writestr('word/document.xml', DOCUMENT)
            result = subprocess.run(
                [sys.executable, '/app/docx_to_pdf.py', docx, '-o', pdf], capture_output=True, text=True
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            text = pymupdf.open(pdf)[0].get_text()
            for wanted in ('sup', 'ℕ', '∖', 'ℝ'):
                self.assertIn(wanted, text)
            self.assertNotIn('¿', text)


if __name__ == '__main__':
    unittest.main()
