import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { pdfTextWidth } from './pdfWidth.ts';

// The real advance widths, from the fonts that pdfmake embeds: Roboto-Regular
// for the text, Roboto-Medium for the bold.
type Font = { unitsPerEm: number; layout: (text: string) => { advanceWidth: number } };
function fonts(): Font[] {
  const require = createRequire(import.meta.url);
  const fontkit = require('fontkit') as { create: (buffer: Buffer) => Font };
  const vfs = require('pdfmake/build/vfs_fonts.js') as Record<string, string>;
  return ['Roboto-Regular.ttf', 'Roboto-Medium.ttf'].map((name) => fontkit.create(Buffer.from(vfs[name]!, 'base64')));
}
const realWidth = (font: Font, text: string, size: number) => (font.layout(text).advanceWidth / font.unitsPerEm) * size;

describe('pdfTextWidth', () => {
  const both = fonts();

  it('is never narrower than the text in either font, for every ASCII character and every Latin letter with a mark', () => {
    const marked = Array.from({ length: 0x250 - 0xc0 }, (_, index) => String.fromCodePoint(0xc0 + index));
    const chars = [...Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index)), ...marked, ...'ăâîșțĂÂÎȘȚşţŞŢ'];
    for (const char of chars) {
      for (const font of both) expect(pdfTextWidth(char, 1000), char).toBeGreaterThanOrEqual(realWidth(font, char, 1000) - 0.5);
    }
  });

  it('measures names and points within 3% of the font', () => {
    for (const text of ['GHEORGHIȚĂ RAIS-BOGDAN-JAHJAH', 'Ștefănescu Țicu-Ioana', '42,5 / 100', 'III.4.b']) {
      const widest = Math.max(...both.map((font) => realWidth(font, text, 9)));
      expect(pdfTextWidth(text, 9)).toBeGreaterThanOrEqual(widest - 0.01);
      expect(pdfTextWidth(text, 9)).toBeLessThanOrEqual(widest * 1.03);
    }
  });

  it('takes a wide width for a character it does not know', () => {
    expect(pdfTextWidth('中', 10)).toBe(12);
    expect(pdfTextWidth('', 10)).toBe(0);
  });
});
