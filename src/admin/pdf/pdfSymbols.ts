// The font that pdfmake embeds (Roboto) has no glyph for many math symbols, and
// a missing glyph is dropped from the PDF without a sign. The grading writes
// Unicode math, so every free text that goes into a PDF passes through
// `pdfText`, which writes these symbols as short Romanian or ASCII text.
// Letters and signs the font has (ă â î ș ț ş ţ, ≤, √, ½, ²) stay unchanged.

// Symbols that read as words: they get a space where the text around them
// would stick to the word.
export const PDF_WORD_SYMBOLS: Record<string, string> = {
  '∈': 'aparține',
  '∉': 'nu aparține',
  '∠': 'unghiul',
  '∡': 'unghiul',
  '⊥': 'perpendicular pe',
  '∥': 'paralel cu',
  '∪': 'reunit cu',
  '∩': 'intersectat cu',
  '⊂': 'inclus în',
  '∅': 'mulțimea vidă',
};

// Symbols that read as letters or arrows: replaced in place.
export const PDF_PLAIN_SYMBOLS: Record<string, string> = {
  'ℝ': 'R',
  'ℕ': 'N',
  'ℤ': 'Z',
  'ℚ': 'Q',
  '⇒': '=>',
  '⇔': '<=>',
  '→': '->',
};

export const PDF_SYMBOLS: Record<string, string> = { ...PDF_WORD_SYMBOLS, ...PDF_PLAIN_SYMBOLS };

const PATTERN = new RegExp(`[${Object.keys(PDF_SYMBOLS).join('')}]`, 'gu');

export function pdfText(text: string): string {
  return text.replace(PATTERN, (symbol, offset: number, whole: string) => {
    const plain = PDF_PLAIN_SYMBOLS[symbol];
    if (plain !== undefined) return plain;
    const before = offset > 0 ? whole[offset - 1]! : ' ';
    const after = whole[offset + symbol.length] ?? ' ';
    return `${/\s/u.test(before) ? '' : ' '}${PDF_WORD_SYMBOLS[symbol]}${/\s/u.test(after) ? '' : ' '}`;
  });
}
