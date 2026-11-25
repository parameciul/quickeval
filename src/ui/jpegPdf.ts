// i18n-ignore-file: PDF syntax, never shown on a page.
// A small PDF writer for photos: one A4 page per JPEG, nothing else.

export interface PdfPage {
  // A baseline JPEG in RGB, as a canvas writes it.
  jpeg: Uint8Array;
  width: number;
  height: number;
}

// A4 in points, and the white edge around each photo.
const A4_SHORT = 595.28;
const A4_LONG = 841.89;
const MARGIN = 28;

const ascii = (text: string) => new TextEncoder().encode(text);
const num = (value: number) => (Math.round(value * 100) / 100).toString();

// One PDF page per photo: an A4 page turned the way the photo is, with the
// photo as large as fits inside the edge, centred. The JPEG goes in as it is
// (DCTDecode), so nothing is drawn again.
export function jpegsToPdf(pages: readonly PdfPage[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: Uint8Array) => {
    parts.push(part);
    length += part.length;
  };
  const object = (id: number, ...body: Uint8Array[]) => {
    offsets[id] = length;
    push(ascii(`${id} 0 obj\n`));
    for (const part of body) push(part);
    push(ascii('\nendobj\n'));
  };

  // The binary comment tells programs that the file holds binary data.
  push(ascii('%PDF-1.4\n'));
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  // 1: the catalog, 2: the page tree, then per page: page, content, image.
  const pageId = (index: number) => 3 + index * 3;
  object(1, ascii('<< /Type /Catalog /Pages 2 0 R >>'));
  const kids = pages.map((_, index) => `${pageId(index)} 0 R`).join(' ');
  object(2, ascii(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`));
  pages.forEach((page, index) => {
    const id = pageId(index);
    const landscape = page.width > page.height;
    const pageWidth = landscape ? A4_LONG : A4_SHORT;
    const pageHeight = landscape ? A4_SHORT : A4_LONG;
    const scale = Math.min((pageWidth - 2 * MARGIN) / page.width, (pageHeight - 2 * MARGIN) / page.height);
    const drawWidth = page.width * scale;
    const drawHeight = page.height * scale;
    const x = (pageWidth - drawWidth) / 2;
    const y = (pageHeight - drawHeight) / 2;
    object(
      id,
      ascii(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pageWidth)} ${num(pageHeight)}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`,
      ),
    );
    const content = ascii(`q ${num(drawWidth)} 0 0 ${num(drawHeight)} ${num(x)} ${num(y)} cm /Im0 Do Q`);
    object(id + 1, ascii(`<< /Length ${content.length} >>\nstream\n`), content, ascii('\nendstream'));
    object(
      id + 2,
      ascii(
        `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
      ),
      page.jpeg,
      ascii('\nendstream'),
    );
  });

  const count = 3 + pages.length * 3;
  const xref = length;
  const rows = ['0000000000 65535 f \n'];
  for (let id = 1; id < count; id += 1) rows.push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(ascii(`xref\n0 ${count}\n${rows.join('')}trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));

  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
