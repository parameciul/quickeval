// File rules shared by the API, the teacher app, and the student app: types,
// limits, and the R2 keys of a test's "cloud folder" (spec §7.2).

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_STUDENT_FILES = 20;

export const PDF_TYPE = 'application/pdf';
export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const JPEG_TYPE = 'image/jpeg';

// The test and the barem: PDF or Word.
export const TEACHER_FILE_TYPES: readonly string[] = [PDF_TYPE, DOCX_TYPE];
// A student's pages: photos or PDF scans.
export const STUDENT_FILE_TYPES: readonly string[] = [JPEG_TYPE, 'image/png', 'image/webp', PDF_TYPE];

// The same Romanian messages in the API and in the apps, which check a file
// before they send it.
export const TEACHER_WRONG_TYPE = 'Încarcă un fișier PDF sau Word (.docx).';
export const STUDENT_WRONG_TYPE = 'Trimite poze JPG sau PDF.';
export const EMPTY_FILE = 'Fișierul este gol.';
export const FILE_TOO_BIG = 'Fișierul are peste 25 MB.';

export type TestFileKind = 'test' | 'barem';

export function isTestFileKind(raw: string): raw is TestFileKind {
  return raw === 'test' || raw === 'barem';
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  [PDF_TYPE]: 'pdf',
  [DOCX_TYPE]: 'docx',
  [JPEG_TYPE]: 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: PDF_TYPE,
  docx: DOCX_TYPE,
  jpg: JPEG_TYPE,
  jpeg: JPEG_TYPE,
  png: 'image/png',
  webp: 'image/webp',
};

export function extensionFor(contentType: string): string {
  return EXTENSION_BY_TYPE[contentType] ?? 'bin';
}

// Browsers sometimes give a file an empty type (for example a .docx on a PC
// without Word). The extension then tells the type. Null for unknown ones.
export function typeFromFileName(name: string): string | null {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  return TYPE_BY_EXTENSION[extension] ?? null;
}

// The type a picked file is sent with: its own type, or the one its extension names.
export function uploadTypeOf(file: { name: string; type: string }): string {
  return file.type || typeFromFileName(file.name) || '';
}

// Why a picked file cannot be sent, as a Romanian message; null when it can.
export function fileProblem(
  file: { name: string; type: string; size: number },
  allowedTypes: readonly string[],
  wrongTypeMessage: string,
): string | null {
  if (!allowedTypes.includes(uploadTypeOf(file))) return wrongTypeMessage;
  if (file.size === 0) return EMPTY_FILE;
  if (file.size > MAX_FILE_BYTES) return FILE_TOO_BIG;
  return null;
}

// The first bytes of each accepted type, so a renamed file of another kind
// (a HEIC photo called .jpg, a .doc called .docx) is refused.
export function looksLike(contentType: string, head: Uint8Array): boolean {
  const starts = (...bytes: number[]) => bytes.every((byte, index) => head[index] === byte);
  const ascii = (text: string, offset = 0) => [...text].every((char, index) => head[offset + index] === char.charCodeAt(0));
  switch (contentType) {
    case PDF_TYPE:
      return ascii('%PDF-');
    case DOCX_TYPE:
      return starts(0x50, 0x4b, 0x03, 0x04);
    case JPEG_TYPE:
      return starts(0xff, 0xd8, 0xff);
    case 'image/png':
      return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'image/webp':
      return ascii('RIFF') && ascii('WEBP', 8);
    default:
      return false;
  }
}

// Lowercase ASCII for keys: diacritics removed (ș→s, ț→t, ă→a, â→a, î→i),
// every other character a dash, no dashes at the ends. "fisier" when nothing is left.
export function slugify(text: string, maxLength = 60): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, maxLength)
    .replace(/^-+|-+$/g, '');
  return slug || 'fisier';
}

function withoutExtension(name: string): string {
  return name.replace(/\.[^.]*$/, '');
}

// Every file of a test lives under this prefix.
export function testFolder(teacherId: number, schoolYear: number, code: string): string {
  return `t/${teacherId}/${schoolYear}/${code}/`;
}

// t/1/2026/6E2-26T1/barem/barem-final.pdf
export function testFileKey(
  teacherId: number,
  schoolYear: number,
  code: string,
  kind: TestFileKind,
  originalName: string,
  contentType: string,
): string {
  return `${testFolder(teacherId, schoolYear, code)}${kind}/${slugify(withoutExtension(originalName))}.${extensionFor(contentType)}`;
}

// t/1/2026/6E2-26T1/students/14-popescu-ana/01-k3f9q2xa.jpg. The random part
// keeps keys unique when a student deletes a page and uploads another one.
export function studentFileKey(
  teacherId: number,
  schoolYear: number,
  code: string,
  studentId: number,
  studentName: string,
  position: number,
  random: string,
  contentType: string,
): string {
  const folder = `${studentId}-${slugify(studentName, 40)}`;
  return `${testFolder(teacherId, schoolYear, code)}students/${folder}/${String(position).padStart(2, '0')}-${random}.${extensionFor(contentType)}`;
}
