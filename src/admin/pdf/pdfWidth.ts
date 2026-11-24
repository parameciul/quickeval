// The width of a text in the font of the PDFs, without loading the font: the
// class PDF sizes its table columns before pdfmake is loaded. The widths are
// the advance widths of Roboto for the printable ASCII characters, in
// thousandths of the font size, each the larger of Roboto-Regular and
// Roboto-Medium (the bold), so that a column made from them never cuts a text.

// Code points 32 (space) to 126 (~).
const ASCII = [
  249, 265, 321, 616, 569, 737, 642, 175, 347, 350, 444, 568, 224, 340, 278, 413, 569, 569, 569, 569, 569, 569, 569, 569, 569, 569, 264, 240, 509, 563,
  523, 487, 898, 664, 632, 653, 657, 569, 553, 682, 714, 284, 556, 632, 541, 875, 714, 689, 639, 689, 630, 606, 610, 655, 646, 888, 632, 611, 604, 272,
  417, 272, 429, 452, 321, 544, 563, 524, 564, 536, 354, 567, 556, 255, 251, 522, 255, 877, 557, 571, 563, 569, 354, 517, 334, 557, 497, 752, 503, 490,
  503, 339, 249, 339, 681,
];

// The Romanian letters with a mark are as wide as their base letter (ă as a,
// ș and ş as s), except î.
const ROMANIAN: Record<string, number> = { î: 262 };
// Another letter with a mark can be wider than its base letter: ǐ is 189
// wider than i, the most of them.
const MARK = 190;
// A character outside ASCII and with no ASCII base letter: 1.2 times the
// font size, wider than any glyph of the font that a name or an exercise id
// would hold (the widest, Ѹ, is 1.18), so the estimate stays on the safe side.
const WIDE = 1200;

const ROMANIAN_MARKED = 'ăâîșțĂÂÎȘȚşţŞŢ'; // i18n-ignore

function charWidth(char: string): number {
  const code = char.codePointAt(0)!;
  if (code >= 32 && code <= 126) return ASCII[code - 32]!;
  const exact = ROMANIAN[char];
  if (exact !== undefined) return exact;
  const base = char.normalize('NFD').codePointAt(0)!;
  if (base !== code && base >= 32 && base <= 126) return ASCII[base - 32]! + (ROMANIAN_MARKED.includes(char) ? 0 : MARK);
  return WIDE;
}

// The width in points of `text` at `fontSize`, on one line.
export function pdfTextWidth(text: string, fontSize: number): number {
  let total = 0;
  for (const char of text) total += charWidth(char);
  return (total * fontSize) / 1000;
}
