import { useEffect, useRef, useState } from 'react';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { tryName } from '../../../shared/quickTry.ts';
import { ApiError } from '../../ui/ApiError.ts';
import { makeZip } from '../../ui/zip.ts';
import { useApi } from '../ApiContext.tsx';
import { saveFile, shareFile } from '../pdf/share.ts';
import { t } from '../../i18n/t.ts';

type PaperFile = SubmissionDetail['files'][number];

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

// A name a file system takes: no slash, colon or other sign Windows refuses,
// and no space or dot at its ends.
function fileSafe(text: string): string {
  return text
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '');
}

function extensionOf(file: Pick<PaperFile, 'name' | 'contentType'>): string {
  const known = EXTENSIONS[file.contentType.toLowerCase()];
  if (known) return known;
  const own = /\.([a-z0-9]{1,5})$/i.exec(file.name)?.[1];
  return own ? own.toLowerCase() : 'bin';
}

// "pagina 2.jpg": a page's name inside the archive.
export function pageEntryName(index: number, file: Pick<PaperFile, 'name' | 'contentType'>): string {
  return `${t('pagina {n}', { n: index + 1 })}.${extensionOf(file)}`;
}

// "POPESCU ANA - 9R2-26T3 - pagina 2.jpg": one page, saved by itself, so it
// says whose paper it is wherever it lands.
export function pageFileName(submission: Pick<SubmissionDetail, 'studentName' | 'testCode'>, index: number, file: Pick<PaperFile, 'name' | 'contentType'>): string {
  return `${paperName(submission)} - ${pageEntryName(index, file)}`;
}

// "POPESCU ANA - 9R2-26T3.zip": every page of the paper.
export function zipFileName(submission: Pick<SubmissionDetail, 'studentName' | 'testCode'>): string {
  return `${paperName(submission)}.zip`;
}

function paperName(submission: Pick<SubmissionDetail, 'studentName' | 'testCode'>): string {
  return fileSafe(`${tryName(submission.studentName)} - ${submission.testCode}`) || 'lucrare'; // i18n-ignore
}

export function isPhoto(file: Pick<PaperFile, 'contentType'>): boolean {
  return file.contentType.startsWith('image/');
}

// Whether the browser can put a picture on the clipboard (an image editor
// then pastes it). Firefox before 127 and pages not on https cannot.
export function canCopyImages(): boolean {
  return typeof ClipboardItem === 'function' && typeof navigator.clipboard?.write === 'function';
}

// The clipboard takes pictures as PNG only: the photo is drawn on a canvas
// (turned as the phone took it) and written again. The canvas is freed after,
// because phones limit canvas memory.
async function asPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  try {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas');
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((png) => (png ? resolve(png) : reject(new Error('No PNG'))), 'image/png'));
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}

// What the last choice did, said in a line beside its button.
export type FilesNote = { kind: 'busy' | 'done' | 'failed'; text: string };

// How long a line of what was done stays, and one of what failed.
const NOTE_MS = 4000;
const FAILED_MS = 8000;

// The pages of one paper, to save or copy: each read once from the API and
// kept while the part that asked stays on the page (`prefetch` reads one ahead,
// so the phone's share sheet opens right inside the tap, as Safari asks).
export function usePaperFiles(submission: SubmissionDetail) {
  const api = useApi();
  const [note, setNote] = useState<FilesNote | null>(null);
  const read = useRef(new Map<number, Promise<Blob>>());
  const ready = useRef(new Map<number, Blob>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const say = (next: FilesNote | null) => {
    clearTimeout(timer.current);
    setNote(next);
    if (next && next.kind !== 'busy') timer.current = setTimeout(() => setNote(null), next.kind === 'failed' ? FAILED_MS : NOTE_MS);
  };
  const failed = (err: unknown, fallback: string) => say({ kind: 'failed', text: err instanceof ApiError ? err.message : fallback });

  const blobOf = (file: PaperFile): Promise<Blob> => {
    let pending = read.current.get(file.id);
    if (!pending) {
      pending = api.submissionFile(submission.id, file.id).then((blob) => {
        ready.current.set(file.id, blob);
        return blob;
      });
      // A failed read is read again on the next choice.
      pending.catch(() => read.current.delete(file.id));
      read.current.set(file.id, pending);
    }
    return pending;
  };

  const files = submission.files;
  return {
    note,
    // Another page on show: what was said of the last one goes.
    forget: () => say(null),
    prefetch: (index: number) => {
      const file = files[index];
      if (file) void blobOf(file).catch(() => {});
    },
    // The clipboard is handed a promise inside the click, as Safari asks.
    copyPage: async (index: number) => {
      const file = files[index];
      if (!file) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobOf(file).then(asPng) })]);
        say({ kind: 'done', text: t('Pagina {n} a fost copiată.', { n: index + 1 }) });
      } catch (err) {
        failed(err, t('Nu am putut copia pagina. Descarc-o și deschide-o în programul tău.'));
      }
    },
    // The page as the student sent it: a download, or on a phone the share
    // sheet (to the photos, a chat, an email).
    savePage: async (index: number, share: boolean) => {
      const file = files[index];
      if (!file) return;
      const name = pageFileName(submission, index, file);
      const kept = ready.current.get(file.id);
      try {
        const blob = kept ?? (await blobOf(file));
        if (share) await shareFile(blob, name, name);
        else saveFile(blob, name);
        say(null);
      } catch (err) {
        failed(err, t('Nu am putut descărca pagina.'));
      }
    },
    // Every page in one ZIP; a paper of one page gives that file.
    saveAll: async () => {
      if (files.length === 0) return;
      if (files.length === 1) {
        const only = files[0]!;
        try {
          saveFile(await blobOf(only), pageFileName(submission, 0, only));
          say(null);
        } catch (err) {
          failed(err, t('Nu am putut descărca pagina.'));
        }
        return;
      }
      say({ kind: 'busy', text: t('Se pregătesc paginile…') });
      try {
        const blobs = await Promise.all(files.map(blobOf));
        const entries = await Promise.all(
          blobs.map(async (blob, index) => ({ name: pageEntryName(index, files[index]!), data: new Uint8Array(await blob.arrayBuffer()) })),
        );
        saveFile(makeZip(entries), zipFileName(submission));
        say(null);
      } catch (err) {
        failed(err, t('Nu am putut descărca paginile.'));
      }
    },
  };
}

export function totalSize(submission: SubmissionDetail): number {
  return submission.files.reduce((sum, file) => sum + file.size, 0);
}
