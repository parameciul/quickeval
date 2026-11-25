import { describe, expect, it, vi } from 'vitest';
import { DOCX_TYPE, looksLike, MAX_FILE_BYTES, PDF_TYPE } from '../../shared/files.ts';
import type { PhotoTools } from '../upload/shrink.ts';
import { jpegsToPdf } from './jpegPdf.ts';
import { checkPick, MAX_PICTURES, pdfNameFor, picturesToPdf, sortPictures, TEACHER_PICK_ACCEPT } from './picturesPdf.ts';

const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0];
const jpegBytes = (size = 16) => {
  const bytes = new Uint8Array(size);
  bytes.set(JPEG_HEAD);
  return bytes;
};
const photo = (name: string, type = 'image/jpeg', size = 10) => new File([jpegBytes(size)], name, { type });
const pdf = (name = 'Test.pdf') => new File(['%PDF-1.7'], name, { type: PDF_TYPE });
const docx = (name = 'Test.docx') => new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], name, { type: DOCX_TYPE });
const text = () => new File(['x'], 'notes.txt', { type: 'text/plain' });

const latin1 = (bytes: Uint8Array) => Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');

// Fake tools: each photo decodes to `size` and encodes to a small JPEG.
function tools(size: { width: number; height: number } = { width: 4000, height: 3000 }, encoded: (index: number) => Blob | null = () => new Blob([jpegBytes()])) {
  const close = vi.fn();
  let count = 0;
  const fake = {
    decode: vi.fn(async () => ({ ...size, source: {} as CanvasImageSource, close })),
    encode: vi.fn(async () => encoded(count++)),
  } satisfies PhotoTools;
  return { fake, close };
}

describe('checkPick', () => {
  it('is null when nothing was picked', () => {
    expect(checkPick([])).toBeNull();
  });

  it('sends one PDF or Word file as it is, the same file', () => {
    const file = pdf();
    expect(checkPick([file])).toEqual({ kind: 'document', file });
    const word = docx();
    expect(checkPick([word])).toEqual({ kind: 'document', file: word });
  });

  it('takes a Word file with no type by its extension, as before', () => {
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'Test.docx', { type: '' });
    expect(checkPick([file])).toEqual({ kind: 'document', file });
  });

  it('keeps the empty and too big checks of a PDF or Word file', () => {
    expect(checkPick([new File([], 'Test.pdf', { type: PDF_TYPE })])).toEqual({ kind: 'problem', problem: 'Fișierul este gol.' });
    const big = pdf();
    Object.defineProperty(big, 'size', { value: MAX_FILE_BYTES + 1 });
    expect(checkPick([big])).toEqual({ kind: 'problem', problem: 'Fișierul are peste 25 MB.' });
  });

  it('refuses a file that is not PDF, Word or a photo, and says photos are fine', () => {
    expect(checkPick([text()])).toEqual({ kind: 'problem', problem: 'Încarcă un fișier PDF sau Word (.docx), ori poze JPG, PNG sau WebP.' });
    expect(checkPick([photo('a.jpg'), text()])).toEqual({ kind: 'problem', problem: 'Încarcă un fișier PDF sau Word (.docx), ori poze JPG, PNG sau WebP.' });
  });

  it('refuses two documents, or a document with photos', () => {
    const one = 'Alege un singur fișier PDF sau Word, ori numai poze.';
    expect(checkPick([pdf(), docx()])).toEqual({ kind: 'problem', problem: one });
    expect(checkPick([pdf(), photo('a.jpg')])).toEqual({ kind: 'problem', problem: one });
  });

  it('takes JPG, PNG and WebP photos, in the order of their names, named after the first', () => {
    const pictures = [photo('IMG_10.jpg'), photo('IMG_2.png', 'image/png'), photo('img_1.webp', 'image/webp')];
    const check = checkPick(pictures);
    expect(check).toEqual({ kind: 'pictures', pictures: [pictures[2], pictures[1], pictures[0]], name: 'img_1.pdf' });
  });

  it('takes a photo with no type by its extension', () => {
    const file = new File([jpegBytes()], 'IMG_1.JPG', { type: '' });
    expect(checkPick([file])).toMatchObject({ kind: 'pictures', pictures: [file] });
  });

  it('refuses more photos than a paper may have, and an empty photo', () => {
    const many = Array.from({ length: MAX_PICTURES + 1 }, (_, index) => photo(`p${index}.jpg`));
    expect(checkPick(many)).toEqual({ kind: 'problem', problem: 'Alege cel mult 20 de poze.' });
    expect(checkPick(many.slice(0, MAX_PICTURES))).toMatchObject({ kind: 'pictures' });
    expect(checkPick([photo('a.jpg'), new File([], 'b.jpg', { type: 'image/jpeg' })])).toEqual({ kind: 'problem', problem: 'Fișierul este gol.' });
  });
});

describe('sortPictures and pdfNameFor', () => {
  it('orders camera names by their numbers, not letter by letter', () => {
    const names = sortPictures([photo('IMG_10.jpg'), photo('IMG_9.jpg'), photo('IMG_100.jpg')]).map((file) => file.name);
    expect(names).toEqual(['IMG_9.jpg', 'IMG_10.jpg', 'IMG_100.jpg']);
  });

  it('names the PDF after a photo', () => {
    expect(pdfNameFor({ name: 'IMG_0001.jpeg' })).toBe('IMG_0001.pdf');
    expect(pdfNameFor({ name: '.png' })).toBe('poze.pdf');
  });
});

describe('the accepted files', () => {
  it('lets the picker show PDF, Word and photos', () => {
    for (const part of ['.pdf', '.docx', '.jpg', '.jpeg', '.png', '.webp', PDF_TYPE, DOCX_TYPE, 'image/jpeg']) expect(TEACHER_PICK_ACCEPT.split(',')).toContain(part);
  });
});

describe('jpegsToPdf', () => {
  const page = (width: number, height: number, size = 32) => ({ jpeg: jpegBytes(size), width, height });

  it('writes a PDF the server takes, with one page per photo', () => {
    const bytes = jpegsToPdf([page(1500, 2000), page(1500, 2000), page(1500, 2000)]);
    expect(looksLike(PDF_TYPE, bytes)).toBe(true);
    const body = latin1(bytes);
    expect(body).toContain('/Count 3');
    expect(body.match(/\/Type \/Page /g)).toHaveLength(3);
    expect(body.match(/\/Filter \/DCTDecode/g)).toHaveLength(3);
    expect(body.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('points every row of its table at the start of its object', () => {
    const bytes = jpegsToPdf([page(1500, 2000), page(2000, 1500)]);
    const body = latin1(bytes);
    const xref = Number(/startxref\n(\d+)\n/.exec(body)![1]);
    expect(body.slice(xref, xref + 4)).toBe('xref');
    const rows = body.slice(xref).split('\n').slice(2, 2 + 9);
    expect(rows).toHaveLength(9);
    expect(rows[0]).toBe('0000000000 65535 f ');
    rows.slice(1).forEach((row, index) => {
      const offset = Number(row.slice(0, 10));
      expect(body.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
    });
    expect(body).toContain('/Size 9');
  });

  it('turns the page the way the photo is, and keeps the photo inside the edge', () => {
    const body = latin1(jpegsToPdf([page(1500, 2000), page(2000, 1000)]));
    expect(body).toContain('/MediaBox [0 0 595.28 841.89]');
    expect(body).toContain('/MediaBox [0 0 841.89 595.28]');
    // The tall photo fills the width inside a 28 pt edge: 539.28 wide.
    expect(body).toContain('q 539.28 0 0 719.04 28 61.43 cm /Im0 Do Q');
    // The wide photo fills the width: 785.89 by 392.95, centred.
    expect(body).toContain('q 785.89 0 0 392.95 28 101.17 cm /Im0 Do Q');
  });

  it('puts each JPEG in as it is, with its size', () => {
    const jpeg = jpegBytes(40);
    jpeg[39] = 0x7a;
    const bytes = jpegsToPdf([{ jpeg, width: 10, height: 20 }]);
    const body = latin1(bytes);
    expect(body).toContain('/Width 10 /Height 20 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length 40 >>');
    expect(body).toContain(`stream\n${latin1(jpeg)}\nendstream`);
  });
});

describe('picturesToPdf', () => {
  it('makes one PDF of the photos, named as asked, each drawn again at most 2000 px', async () => {
    const { fake, close } = tools();
    const result = await picturesToPdf([photo('a.jpg'), photo('b.png', 'image/png')], 'a.pdf', fake);
    if (!('file' in result)) throw new Error(result.problem);
    expect(result.file.name).toBe('a.pdf');
    expect(result.file.type).toBe(PDF_TYPE);
    const body = latin1(new Uint8Array(await result.file.arrayBuffer()));
    expect(body.startsWith('%PDF-')).toBe(true);
    expect(body).toContain('/Count 2');
    expect(body).toContain('/Width 2000 /Height 1500');
    expect(fake.encode).toHaveBeenCalledTimes(2);
    expect(fake.encode).toHaveBeenCalledWith(expect.anything(), { width: 2000, height: 1500 }, 0.85);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('draws a small JPEG again too, so its camera turn is kept', async () => {
    const { fake } = tools({ width: 800, height: 600 });
    await picturesToPdf([photo('a.jpg')], 'a.pdf', fake);
    expect(fake.encode).toHaveBeenCalledWith(expect.anything(), { width: 800, height: 600 }, 0.85);
  });

  it('names a photo the browser cannot read, and makes no PDF', async () => {
    const { fake } = tools();
    fake.decode.mockRejectedValueOnce(new Error('HEIC'));
    expect(await picturesToPdf([photo('IMG_1.jpg')], 'IMG_1.pdf', fake)).toEqual({
      problem: 'Nu am putut citi poza IMG_1.jpg. Alege o poză JPG, PNG sau WebP.',
    });
  });

  it('refuses a photo the canvas could not write as a JPEG, and frees it', async () => {
    const nothing = tools(undefined, () => null);
    expect(await picturesToPdf([photo('a.jpg')], 'a.pdf', nothing.fake)).toEqual({ problem: 'Nu am putut citi poza a.jpg. Alege o poză JPG, PNG sau WebP.' });
    expect(nothing.close).toHaveBeenCalledTimes(1);
    const notJpeg = tools(undefined, () => new Blob([new Uint8Array([0x89, 0x50])]));
    expect(await picturesToPdf([photo('b.jpg')], 'b.pdf', notJpeg.fake)).toEqual({ problem: 'Nu am putut citi poza b.jpg. Alege o poză JPG, PNG sau WebP.' });
  });

  it('refuses photos whose PDF would be over 25 MB', async () => {
    const half = Math.ceil(MAX_FILE_BYTES / 2);
    const { fake } = tools(undefined, () => new Blob([jpegBytes(half)]));
    expect(await picturesToPdf([photo('a.jpg'), photo('b.jpg')], 'a.pdf', fake)).toEqual({ problem: 'Pozele fac un PDF de peste 25 MB. Alege mai puține poze.' });
  });
});
