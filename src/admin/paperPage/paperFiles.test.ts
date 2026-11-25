import { describe, expect, it } from 'vitest';
import { pageEntryName, pageFileName, zipFileName } from './paperFiles.ts';

const paper = { studentName: 'Bursașiu Teodor', testCode: '9R2-26T3' };

describe('the names of a paper\'s files', () => {
  it('name the student, the test and the page', () => {
    expect(pageFileName(paper, 2, { name: 'x.jpg', contentType: 'image/jpeg' })).toBe('Bursașiu Teodor - 9R2-26T3 - pagina 3.jpg');
    expect(zipFileName(paper)).toBe('Bursașiu Teodor - 9R2-26T3.zip');
  });

  it('take the extension from the type, then from the sent name', () => {
    expect(pageEntryName(0, { name: 'scan', contentType: 'application/pdf' })).toBe('pagina 1.pdf');
    expect(pageEntryName(0, { name: 'IMG.HEIC', contentType: 'image/x-odd' })).toBe('pagina 1.heic');
    expect(pageEntryName(0, { name: 'fără', contentType: 'application/octet-stream' })).toBe('pagina 1.bin');
  });

  it('leave out the signs a file system refuses', () => {
    expect(zipFileName({ studentName: 'A/B: "C"?', testCode: '9R2-26T3' })).toBe('A B C - 9R2-26T3.zip');
  });
});
