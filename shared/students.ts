export const MAX_NAME_LENGTH = 80;
export const MAX_NAMES_PER_REQUEST = 60;

// Trims the name, joins inner whitespace into single spaces, and drops a
// leading list number such as "1. ", "2) " or "3 " (catalog lists are numbered).
export function cleanStudentName(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\d+[.)]?\s+/, '');
}

// One name per line. Empty lines are skipped.
export function parseStudentNames(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(cleanStudentName)
    .filter((name) => name.length > 0);
}

// Romanian alphabetical order: "Ștefan" sorts after "Sandu".
export function compareStudentNames(a: string, b: string): number {
  return a.localeCompare(b, 'ro');
}
