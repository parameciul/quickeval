// Search (redesign spec §11.10) folds text the same way on the server and in
// the browser: one case, no diacritics ("stef" finds "Ștefan", "Ştefan" with a
// cedilla and a decomposed "Ș"), and single spaces.

export const MIN_SEARCH_LENGTH = 2;
export const MAX_SEARCH_LENGTH = 80;

// Letters that keep no diacritic to strip: their plain form.
const PLAIN_LETTERS: Readonly<Record<string, string>> = { ł: 'l', ß: 'ss', đ: 'd', ø: 'o', æ: 'ae', œ: 'oe' };
const PLAIN = /[łßđøæœ]/gu;

interface Folded {
  text: string;
  // For each UTF-16 unit of `text`, where its letter starts in the original.
  starts: number[];
}

// Folds one letter at a time, so a match in the folded text can be mapped
// back onto the original (for the bold part of a result). It gives the same
// text as foldForSearch, which is faster and used for matching.
function foldWithMap(text: string): Folded {
  let out = '';
  const starts: number[] = [];
  let index = 0;
  for (const letter of text) {
    let folded = letter.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    folded = PLAIN_LETTERS[folded] ?? folded;
    if (/^\s+$/u.test(folded)) folded = out === '' || out.endsWith(' ') ? '' : ' ';
    out += folded;
    for (let unit = 0; unit < folded.length; unit++) starts.push(index);
    index += letter.length;
  }
  return { text: out, starts };
}

export function foldForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(PLAIN, (letter) => PLAIN_LETTERS[letter]!)
    .replace(/\s+/gu, ' ')
    .trim();
}

// Whether a search is long enough to run: at least two letters once folded.
export function isSearchable(query: string): boolean {
  return foldForSearch(query).length >= MIN_SEARCH_LENGTH;
}

// A test for each text: does it hold the search, folded?
export function searchMatcher(query: string): (text: string) => boolean {
  const folded = foldForSearch(query);
  return (text) => folded.length > 0 && foldForSearch(text).includes(folded);
}

// Where the search sits in the original text (the end is after any accent of
// the last letter), or null when it is not there.
export function matchRange(text: string, query: string): { start: number; end: number } | null {
  const folded = foldForSearch(query);
  if (folded.length === 0) return null;
  const map = foldWithMap(text);
  const at = map.text.indexOf(folded);
  if (at < 0) return null;
  const after = at + folded.length;
  return { start: map.starts[at]!, end: after < map.starts.length ? map.starts[after]! : text.length };
}
