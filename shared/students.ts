export const MAX_NAME_LENGTH = 80;
export const MAX_NAMES_PER_REQUEST = 60;

// Trims the name, joins inner whitespace into single spaces, and drops a
// leading list number such as "1. ", "2) ", "3 " or "4.Name" (catalog lists are
// numbered). A line that holds only a list number becomes an empty name.
export function cleanStudentName(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\d+(?:[.)]\s*|\s+|$)/, '');
}

// One name per line. Empty lines are skipped.
export function parseStudentNames(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(cleanStudentName)
    .filter((name) => name.length > 0);
}

// Uppercase letters that SQLite's lower() does not fold, with their key form,
// and the cedilla forms that Romanian lists still use for ș and ț. The Romanian
// letters come first; the others are the capitals of names from other
// languages (É, Ö, Ü, Č, Ł, ...), each of which has a one-letter lowercase.
const FOREIGN_CAPITALS = 'ÁÀÄÅÃÇČĆÉÈÊËÍÌÏÓÒÔÖÕŐŠÚÙÛÜŰÝŽŁÑ';
const NAME_KEY_FOLDS: readonly (readonly [string, string])[] = [
  ['Ă', 'ă'], ['Â', 'â'], ['Î', 'î'], ['Ș', 'ș'], ['Ț', 'ț'],
  ['Ş', 'ș'], ['ş', 'ș'], ['Ţ', 'ț'], ['ţ', 'ț'],
  ...Array.from(FOREIGN_CAPITALS, (letter): readonly [string, string] => [letter, letter.toLowerCase()]),
];

// The key two names must not share inside one class: the name with letters
// folded to one case (ASCII and the Romanian letters) and the cedilla letters
// read as comma letters. Diacritics still count. It matches studentNameKeySql
// letter for letter, so do not use toLocaleLowerCase here: it folds letters
// that SQLite cannot.
export function studentNameKey(name: string): string {
  let key = name.replace(/[A-Z]/g, (c) => c.toLowerCase());
  for (const [from, to] of NAME_KEY_FOLDS) key = key.replaceAll(from, to);
  return key;
}

// The same key as an SQL expression over a column (or parameter) that holds a
// cleaned name. The letters come from NAME_KEY_FOLDS, never from user text.
export function studentNameKeySql(column: string): string {
  let sql = `lower(${column})`;
  for (const [from, to] of NAME_KEY_FOLDS) sql = `replace(${sql}, '${from}', '${to}')`;
  return sql;
}

// Romanian alphabetical order: "Ștefan" sorts after "Sandu".
export function compareStudentNames(a: string, b: string): number {
  return a.localeCompare(b, 'ro');
}
