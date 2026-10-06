const CLASS_NAME = /^[A-Z0-9]{1,8}$/;

// "6e2", " 6 E2 " and "6E2" all become "6E2". Returns null when the result is
// not 1-8 Latin letters and digits: the name becomes part of test codes and URLs.
export function normalizeClassName(raw: string): string | null {
  const name = raw.replace(/\s+/g, '').toUpperCase();
  return CLASS_NAME.test(name) ? name : null;
}

export function displayClassName(name: string): string {
  return `Clasa ${name}`;
}

// Sorts "6E2" before "11R1": numbers inside names compare as numbers.
export function compareClassNames(a: string, b: string): number {
  return a.localeCompare(b, 'ro', { numeric: true });
}
