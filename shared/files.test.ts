import { describe, expect, it } from 'vitest';
import {
  DOCX_TYPE,
  extensionFor,
  fileProblem,
  isTestFileKind,
  looksLike,
  MAX_FILE_BYTES,
  PDF_TYPE,
  slugify,
  STUDENT_FILE_TYPES,
  STUDENT_WRONG_TYPE,
  studentFileKey,
  TEACHER_FILE_TYPES,
  TEACHER_WRONG_TYPE,
  testFileKey,
  testFolder,
  typeFromFileName,
  uploadTypeOf,
} from './files.ts';

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

describe('slugify', () => {
  it('removes Romanian diacritics, comma-below and cedilla forms alike', () => {
    expect(slugify('Ștefănescu Țața Îonuț Âna')).toBe('stefanescu-tata-ionut-ana');
    expect(slugify('Şerban Ţuţu')).toBe('serban-tutu');
  });

  it('turns everything else into single dashes and trims them', () => {
    expect(slugify('  Test (final) #2!  ')).toBe('test-final-2');
  });

  it('cuts long names and never ends with a dash', () => {
    expect(slugify('a'.repeat(59) + ' b', 60)).toBe('a'.repeat(59));
  });

  it('falls back to "fisier" when nothing is left', () => {
    expect(slugify('!!!')).toBe('fisier');
    expect(slugify('')).toBe('fisier');
  });
});

describe('keys', () => {
  it('builds the test folder and the keys of the test and barem files', () => {
    expect(testFolder(1, 2026, '6E2-26T1')).toBe('t/1/2026/6E2-26T1/');
    expect(testFileKey(1, 2026, '6E2-26T1', 'barem', 'Barem final.PDF', PDF_TYPE)).toBe('t/1/2026/6E2-26T1/barem/barem-final.pdf');
    expect(testFileKey(1, 2026, '6E2-26T1', 'test', 'Test.docx', DOCX_TYPE)).toBe('t/1/2026/6E2-26T1/test/test.docx');
  });

  it('builds a student file key from the type, not from the original name', () => {
    expect(studentFileKey(1, 2026, '6E2-26T1', 14, 'Popescu Ana', 1, 'k3f9q2xa', 'image/jpeg')).toBe(
      't/1/2026/6E2-26T1/students/14-popescu-ana/01-k3f9q2xa.jpg',
    );
    expect(studentFileKey(1, 2026, '6E2-26T1', 14, 'Popescu Ana', 12, 'abcdefgh', PDF_TYPE)).toBe(
      't/1/2026/6E2-26T1/students/14-popescu-ana/12-abcdefgh.pdf',
    );
  });
});

describe('types', () => {
  it('knows the two kinds of test files', () => {
    expect(isTestFileKind('test')).toBe(true);
    expect(isTestFileKind('barem')).toBe(true);
    expect(isTestFileKind('other')).toBe(false);
  });

  it('maps types to extensions and extensions to types', () => {
    expect(extensionFor('image/png')).toBe('png');
    expect(extensionFor('text/html')).toBe('bin');
    expect(typeFromFileName('Lucrare.DOCX')).toBe(DOCX_TYPE);
    expect(typeFromFileName('poza.jpeg')).toBe('image/jpeg');
    expect(typeFromFileName('poza.heic')).toBeNull();
    expect(typeFromFileName('fara-extensie')).toBeNull();
  });
});

describe('fileProblem', () => {
  const pick = (name: string, type: string, size = 1000) => ({ name, type, size });

  it('accepts an allowed file and names the type from the extension when the browser gives none', () => {
    expect(fileProblem(pick('test.pdf', PDF_TYPE), TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE)).toBeNull();
    expect(fileProblem(pick('Barem.docx', ''), TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE)).toBeNull();
    expect(uploadTypeOf(pick('Barem.docx', ''))).toBe(DOCX_TYPE);
  });

  it('names the problem of a file that cannot be sent', () => {
    expect(fileProblem(pick('poza.heic', 'image/heic'), STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE)).toBe('Trimite poze JPG sau PDF.');
    expect(fileProblem(pick('notes.txt', ''), TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE)).toBe('Încarcă un fișier PDF sau Word (.docx).');
    expect(fileProblem(pick('gol.pdf', PDF_TYPE, 0), TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE)).toBe('Fișierul este gol.');
    expect(fileProblem(pick('mare.pdf', PDF_TYPE, MAX_FILE_BYTES + 1), TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE)).toBe(
      'Fișierul are peste 25 MB.',
    );
  });
});

describe('looksLike', () => {
  it('recognizes each accepted type by its first bytes', () => {
    expect(looksLike(PDF_TYPE, text('%PDF-1.7'))).toBe(true);
    expect(looksLike(DOCX_TYPE, bytes(0x50, 0x4b, 0x03, 0x04, 0x14))).toBe(true);
    expect(looksLike('image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(looksLike('image/png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(looksLike('image/webp', text('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe(true);
  });

  it('refuses a file whose bytes belong to another type', () => {
    expect(looksLike('image/jpeg', text('%PDF-1.7'))).toBe(false);
    expect(looksLike(PDF_TYPE, bytes(0xff, 0xd8, 0xff))).toBe(false);
    expect(looksLike('image/webp', text('RIFF\u0000\u0000\u0000\u0000WAVE'))).toBe(false);
    expect(looksLike('text/html', text('<html>'))).toBe(false);
    expect(looksLike(PDF_TYPE, bytes())).toBe(false);
  });
});
