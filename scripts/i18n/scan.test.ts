import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanFiles, scanSource, sourceFiles } from './scan.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

describe('the text of the pages', () => {
  // The guard of the English version: every text a page shows goes through
  // t() (src/i18n/t.ts), whose keys the English dictionary must have.
  it('goes through t() in every app file', () => {
    expect(scanFiles(ROOT, sourceFiles(ROOT, ['src']))).toEqual([]);
  });

  it('finds JSX text, text attributes and Romanian strings that skip t()', () => {
    const found = scanSource(
      'x.tsx',
      `const a = 'Trimite lucrarea';
       const b = <p title="Deschis">Trimis</p>;
       const c = \`Ai \${n} lucrări\`;
       const d = t('Gata');
       const e = countLabel(2, 'lucrare', 'lucrări');
       const f = t(one ? 'a trimis' : 'au trimis');`,
    );
    expect(found.map((finding) => finding.text)).toEqual(['Trimite lucrarea', 'Deschis', 'Trimis', 'Ai {} lucrări']);
  });

  it('skips lines and files marked i18n-ignore, and the stage names', () => {
    expect(scanSource('x.ts', "const a = 'Trimite lucrarea'; // i18n-ignore")).toEqual([]);
    expect(scanSource('x.ts', "// i18n-ignore-file\nconst a = 'Trimite lucrarea';")).toEqual([]);
    expect(scanSource('x.ts', "const s = 'Pregătire';")).toEqual([]);
  });
});
