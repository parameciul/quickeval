// Up to two letters for the account button: the first letters of the first
// and the last word of the name ("Laura Miron" gives "LM").
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = Array.from(words[0]!)[0]!;
  const last = words.length > 1 ? Array.from(words[words.length - 1]!)[0]! : '';
  return (first + last).toLocaleUpperCase('ro-RO');
}
