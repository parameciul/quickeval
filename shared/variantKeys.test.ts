import { describe, expect, it } from 'vitest';
import { DOCX_TYPE, generatedBaremKey, PDF_TYPE, printFileKey, testFileKey } from './files.ts';

describe('the R2 keys of the CES variant', () => {
  it('puts every CES file under ces/ in the test folder, and leaves the class keys as they were', () => {
    expect(testFileKey(1, 2026, '9R2-26T1', 'test', 'Test adaptat.docx', DOCX_TYPE, 'ces')).toBe('t/1/2026/9R2-26T1/ces/test/test-adaptat.docx');
    expect(testFileKey(1, 2026, '9R2-26T1', 'barem', 'barem.pdf', PDF_TYPE)).toBe('t/1/2026/9R2-26T1/barem/barem.pdf');
    expect(testFileKey(1, 2026, '9R2-26T1', 'barem', 'barem.pdf', PDF_TYPE, 'ces')).toBe('t/1/2026/9R2-26T1/ces/barem/barem.pdf');
    expect(printFileKey(1, 2026, '9R2-26T1', 'Test adaptat.docx', 3, 'ces')).toBe('t/1/2026/9R2-26T1/ces/print/test-adaptat-v3-qr.pdf');
    expect(printFileKey(1, 2026, '9R2-26T1', 'Test.docx', 3)).toBe('t/1/2026/9R2-26T1/print/test-v3-qr.pdf');
    expect(generatedBaremKey(1, 2026, '9R2-26T1', 4, 'ces')).toBe('t/1/2026/9R2-26T1/ces/barem/generat_v4.docx');
  });
});
