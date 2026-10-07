import { describe, expect, it, vi } from 'vitest';
import { fitWithin, jpegName, shrinkPhoto, type PhotoTools } from './shrink.ts';

// Fake tools: a photo of the given size that encodes to `encodedBytes` bytes.
function tools(width: number, height: number, encodedBytes: number | null) {
  const close = vi.fn();
  const fake = {
    decode: vi.fn(async () => ({ width, height, source: {} as CanvasImageSource, close })),
    encode: vi.fn(async () => (encodedBytes === null ? null : new Blob([new Uint8Array(encodedBytes)], { type: 'image/jpeg' }))),
  } satisfies PhotoTools;
  return { fake, close };
}

const photo = (type: string, bytes: number, name = 'IMG_0001.jpg') => new File([new Uint8Array(bytes)], name, { type });

describe('fitWithin', () => {
  it('keeps the long side at most 2000 px and the shape the same', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 6000)).toEqual({ width: 1000, height: 2000 });
    expect(fitWithin(1600, 1200)).toEqual({ width: 1600, height: 1200 });
  });
});

describe('jpegName', () => {
  it('gives the name a .jpg extension', () => {
    expect(jpegName('IMG_0001.PNG')).toBe('IMG_0001.jpg');
    expect(jpegName('scan.page.webp')).toBe('scan.page.jpg');
    expect(jpegName('.png')).toBe('poza.jpg');
  });
});

describe('shrinkPhoto', () => {
  it('makes a big photo a smaller JPEG of at most 2000 px', async () => {
    const { fake, close } = tools(4000, 3000, 500);
    const result = await shrinkPhoto(photo('image/jpeg', 3000), fake);
    expect(result.size).toBe(500);
    expect(result.type).toBe('image/jpeg');
    expect(fake.encode).toHaveBeenCalledWith(expect.anything(), { width: 2000, height: 1500 }, 0.85);
    expect(close).toHaveBeenCalled();
  });

  it('keeps a JPEG that would not get smaller', async () => {
    const { fake } = tools(1200, 900, 4000);
    const original = photo('image/jpeg', 3000);
    expect(await shrinkPhoto(original, fake)).toBe(original);
  });

  it('turns a PNG or WebP photo into a JPEG even when it grows', async () => {
    const { fake } = tools(1200, 900, 4000);
    const result = await shrinkPhoto(photo('image/png', 3000, 'scan.png'), fake);
    expect(result.type).toBe('image/jpeg');
    expect(result.size).toBe(4000);
  });

  it('sends PDFs, unreadable photos, and failed encodings as they are', async () => {
    const pdf = photo('application/pdf', 100, 'scan.pdf');
    const { fake } = tools(100, 100, 50);
    expect(await shrinkPhoto(pdf, fake)).toBe(pdf);
    expect(fake.decode).not.toHaveBeenCalled();

    const unreadable = photo('image/jpeg', 100);
    const broken = { decode: vi.fn(async () => Promise.reject(new Error('bad image'))), encode: vi.fn() } as unknown as PhotoTools;
    expect(await shrinkPhoto(unreadable, broken)).toBe(unreadable);

    const noCanvas = tools(4000, 3000, null);
    const original = photo('image/jpeg', 3000);
    expect(await shrinkPhoto(original, noCanvas.fake)).toBe(original);
    expect(noCanvas.close).toHaveBeenCalled();
  });
});
