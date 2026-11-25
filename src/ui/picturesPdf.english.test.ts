import '../test/english.ts';
import { describe, expect, it } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { chosenName } from '../admin/newTest/FileDrop.tsx';
import { checkPick, MAX_PICTURES, picturesToPdf } from './picturesPdf.ts';

const photo = (name: string, size = 4) => new File([new Uint8Array(size)], name, { type: 'image/jpeg' });

describe('photos of the test or the barem, in English', () => {
  it('says why a pick cannot be sent', () => {
    expect(checkPick([new File(['x'], 'a.txt', { type: 'text/plain' })])).toEqual({
      kind: 'problem',
      problem: 'Upload a PDF or Word (.docx) file, or JPG, PNG or WebP photos.',
    });
    expect(checkPick([new File(['%PDF'], 'a.pdf', { type: PDF_TYPE }), photo('b.jpg')])).toEqual({ kind: 'problem', problem: 'Choose one PDF or Word file, or only photos.' });
    const many = Array.from({ length: MAX_PICTURES + 1 }, (_, index) => photo(`p${index}.jpg`));
    expect(checkPick(many)).toEqual({ kind: 'problem', problem: 'Choose at most 20 photos.' });
    expect(checkPick([photo('a.jpg', 0)])).toEqual({ kind: 'problem', problem: 'The file is empty.' });
  });

  it('names a photo it cannot read', async () => {
    const tools = {
      decode: async () => {
        throw new Error('HEIC');
      },
      encode: async () => null,
    };
    expect(await picturesToPdf([photo('IMG_1.jpg')], 'IMG_1.pdf', tools)).toEqual({ problem: 'I could not read the photo IMG_1.jpg. Choose a JPG, PNG or WebP photo.' });
  });

  it('says how many photos made the file', () => {
    const file = new File(['%PDF'], 'IMG_1.pdf', { type: PDF_TYPE });
    expect(chosenName(file, 3)).toBe('IMG_1.pdf, from 3 photos');
    expect(chosenName(file, 1)).toBe('IMG_1.pdf, from 1 photo');
    expect(chosenName(file, 0)).toBe('IMG_1.pdf');
  });
});
