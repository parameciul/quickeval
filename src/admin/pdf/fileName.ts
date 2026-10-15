// The name of a downloaded file: letters and digits of the parts, joined by
// "-". Diacritics are dropped (ș becomes s), so the name opens anywhere.
export function pdfFileName(...parts: string[]): string {
  const clean = parts
    .map((part) =>
      part
        .normalize('NFD')
        .replace(/\p{M}+/gu, '')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter((part) => part !== '');
  return `${clean.join('-') || 'raport'}.pdf`;
}
