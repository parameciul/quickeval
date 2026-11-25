import { EMPTY_FILE, fileProblem, JPEG_TYPE, MAX_FILE_BYTES, PDF_TYPE, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE, uploadTypeOf } from '../../shared/files.ts';
import { translateMessage } from '../../shared/i18n/messages.ts';
import { t, tc } from '../i18n/t.ts';
import { jpegsToPdf, type PdfPage } from './jpegPdf.ts';
import { browserPhotoTools, fitWithin, JPEG_QUALITY, MAX_SIDE, type PhotoTools } from '../upload/shrink.ts';

// The test or the barem can be pictures too: a teacher picks one PDF or Word
// file, as before, or one or more photos of the pages. The photos become one
// PDF here, in the browser, before anything is sent. The API, R2 and the robot
// then only ever see a PDF or a Word file, as they always have.

export const PICTURE_TYPES: readonly string[] = [JPEG_TYPE, 'image/png', 'image/webp'];
// As many pages as a student may send.
export const MAX_PICTURES = 20;

// What a file picker of the test or the barem takes.
export const TEACHER_PICK_ACCEPT = ['.pdf', '.docx', '.jpg', '.jpeg', '.png', '.webp', ...TEACHER_FILE_TYPES, ...PICTURE_TYPES].join(',');

export type PickCheck =
  | { kind: 'document'; file: File }
  | { kind: 'pictures'; pictures: File[]; name: string }
  | { kind: 'problem'; problem: string };

export type PicturesResult = { file: File } | { problem: string };

const isPicture = (file: File) => PICTURE_TYPES.includes(uploadTypeOf(file));

// Camera names in the order they were taken: IMG_2 before IMG_10.
export function sortPictures(pictures: readonly File[]): File[] {
  return [...pictures].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

// "IMG_0001.jpg" gives "IMG_0001.pdf".
export function pdfNameFor(picture: { name: string }): string {
  return `${picture.name.replace(/\.[^.]*$/, '') || 'poze'}.pdf`; // i18n-ignore: a file name
}

// What the picked files are, at once, before any photo is read: one PDF or Word
// file (sent as it is), photos (to make into a PDF), or why they cannot be
// sent. Null when nothing was picked.
export function checkPick(files: readonly File[]): PickCheck | null {
  if (files.length === 0) return null;
  const pictures = files.filter(isPicture);
  if (pictures.length === 0) {
    if (files.length > 1) return { kind: 'problem', problem: t('Alege un singur fișier PDF sau Word, ori numai poze.') };
    const [file] = files as [File];
    if (!TEACHER_FILE_TYPES.includes(uploadTypeOf(file))) return { kind: 'problem', problem: t('Încarcă un fișier PDF sau Word (.docx), ori poze JPG, PNG sau WebP.') };
    const problem = fileProblem(file, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE);
    return problem ? { kind: 'problem', problem } : { kind: 'document', file };
  }
  if (pictures.length < files.length) {
    const documents = files.some((file) => TEACHER_FILE_TYPES.includes(uploadTypeOf(file)));
    return {
      kind: 'problem',
      problem: documents ? t('Alege un singur fișier PDF sau Word, ori numai poze.') : t('Încarcă un fișier PDF sau Word (.docx), ori poze JPG, PNG sau WebP.'),
    };
  }
  if (pictures.length > MAX_PICTURES) return { kind: 'problem', problem: t('Alege cel mult {pictures}.', { pictures: tc(MAX_PICTURES, 'poză', 'poze') }) };
  if (pictures.some((picture) => picture.size === 0)) return { kind: 'problem', problem: translateMessage(EMPTY_FILE) };
  const sorted = sortPictures(pictures);
  return { kind: 'pictures', pictures: sorted, name: pdfNameFor(sorted[0]!) };
}

const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

// The photos, in the order given, as one PDF named `name`. Each photo is drawn
// again on a canvas, even a small JPEG: that turns it the way the camera held
// it (the PDF would ignore the photo's EXIF turn), makes a PNG or WebP a JPEG,
// and keeps it at most MAX_SIDE px. One photo at a time, for a phone's memory.
export async function picturesToPdf(pictures: readonly File[], name: string, tools: PhotoTools = browserPhotoTools): Promise<PicturesResult> {
  const pages: PdfPage[] = [];
  for (const picture of pictures) {
    const unreadable = { problem: t('Nu am putut citi poza {name}. Alege o poză JPG, PNG sau WebP.', { name: picture.name }) };
    let decoded;
    try {
      decoded = await tools.decode(picture);
    } catch {
      return unreadable;
    }
    try {
      const size = fitWithin(decoded.width, decoded.height, MAX_SIDE);
      const blob = await tools.encode(decoded.source, size, JPEG_QUALITY);
      if (!blob) return unreadable;
      const jpeg = new Uint8Array(await blob.arrayBuffer());
      if (!isJpeg(jpeg)) return unreadable;
      pages.push({ jpeg, width: size.width, height: size.height });
    } catch {
      return unreadable;
    } finally {
      decoded.close();
    }
  }
  const pdf = jpegsToPdf(pages);
  if (pdf.length > MAX_FILE_BYTES) return { problem: t('Pozele fac un PDF de peste 25 MB. Alege mai puține poze.') };
  return { file: new File([pdf as Uint8Array<ArrayBuffer>], name, { type: PDF_TYPE }) };
}

export type MakePdf = (pictures: readonly File[], name: string) => Promise<PicturesResult>;
