import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { createFakeApi, fakeEvaluation, fakeItem, fakeTest, fakeUpload, reviewPointsOf } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import * as share from '../pdf/share.ts';
import { screenOf } from './paperCheckTestKit.tsx';

// The pages of a student's paper, to download or copy, in every state of the
// paper: the button in the paper's head (and over the whole screen), "Descarcă
// paginile" of "Alte acțiuni", and "Descarcă toate" over a paper's pages.

vi.mock('../pdf/share.ts', () => ({ saveFile: vi.fn(), shareFile: vi.fn(), canShareFiles: vi.fn(() => false) }));

const saveFile = vi.mocked(share.saveFile);
const shareFile = vi.mocked(share.shareFile);
const canShareFiles = vi.mocked(share.canShareFiles);

const files: SubmissionDetail['files'] = [
  { id: 21, name: 'IMG_0001.png', contentType: 'image/png', size: 300 * 1024, position: 1 },
  { id: 22, name: '1795624750577.jpg', contentType: 'image/jpeg', size: 200 * 1024, position: 2 },
];

const graded: SubmissionDetail = {
  id: 5,
  testCode: '6E2-26T1',
  testTitle: 'Fracții',
  testStatus: 'done',
  studentId: 10,
  studentName: 'Popescu Ștefan',
  status: 'graded',
  autoSubmitted: false,
  startedAt: '2026-10-06T07:20:00.000Z',
  submittedAt: '2026-10-06T07:40:00.000Z',
  lastError: null,
  files,
  evaluation: fakeEvaluation([fakeItem({ id: 31, exerciseId: 'I.1', label: 'Subiectul I, ex. 1', points: 4.5 })]),
  resultToken: 'abcdefghijkmnop2abcdefcd',
  resultsOpen: false,
};

const sent: SubmissionDetail = { ...graded, status: 'submitted', evaluation: null, resultToken: null, testStatus: 'evaluating' };
const sending: SubmissionDetail = { ...graded, status: 'uploading', evaluation: null, resultToken: null, submittedAt: null, testStatus: 'open', files: [] };

const apiWith = (detail: SubmissionDetail) =>
  createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 1 }],
    students: {},
    tests: [
      fakeTest({ status: detail.testStatus }, [
        fakeUpload({
          studentId: 10,
          studentName: detail.studentName,
          submissionId: 5,
          status: detail.status,
          fileCount: detail.files.length,
          flagCount: reviewPointsOf(detail.evaluation).length,
          reviewPoints: reviewPointsOf(detail.evaluation),
        }),
      ]),
    ],
    submissions: [structuredClone(detail)],
  });

const page = '/tests/6E2-26T1/papers/5';

// The clipboard of a browser that takes pictures: what it was given.
// user-event puts its own clipboard on the page: the copy goes to its write.
function pictureClipboard(write: (items: ClipboardItem[]) => Promise<void> = async () => {}) {
  class FakeItem {
    readonly items: Record<string, Promise<Blob>>;
    constructor(items: Record<string, Promise<Blob>>) {
      this.items = items;
    }
  }
  vi.stubGlobal('ClipboardItem', FakeItem);
  userEvent.setup();
  return vi.spyOn(navigator.clipboard, 'write').mockImplementation(write);
}

// A graded paper with nothing to check opens with the paper hidden: show it.
async function openDownload() {
  await screen.findByRole('heading', { level: 1, name: /Popescu/i });
  const toggle = screen.queryByRole('button', { name: 'Lucrarea', pressed: false });
  if (toggle) await userEvent.click(toggle);
  await userEvent.click(await screen.findByRole('button', { name: 'Descarcă sau copiază' }));
  return screen.getByRole('menu', { name: /^Pagina \d+ din \d+$/ });
}

// The names in a stored ZIP, read from its central directory.
async function zipNames(blob: Blob): Promise<string[]> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const end = bytes.length - 22;
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const length = view.getUint16(at + 28, true);
    names.push(new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + length)));
    at += 46 + length;
  }
  return names;
}

beforeEach(() => {
  vi.clearAllMocks();
  canShareFiles.mockReturnValue(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the download button of the paper', () => {
  it('offers the page on show, to copy and to download, and all the pages', async () => {
    pictureClipboard();
    renderAdmin(page, apiWith(graded));
    const menu = await openDownload();
    expect(within(menu).getAllByRole('menuitem').map((item) => item.getAttribute('aria-label'))).toEqual([
      'Copiază pagina 1',
      'Descarcă pagina 1',
      'Descarcă toate paginile (2)',
    ]);
    // One short word each: the page buttons beside say which page.
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Copiază', 'Descarcă', 'Descarcă toate']);
  });

  it('downloads the page on show under the student, the test and its number', async () => {
    const api = apiWith(graded);
    renderAdmin(page, api);
    const menu = await openDownload();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Descarcă pagina 1' }));
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    expect(api.submissionFile).toHaveBeenCalledWith(5, 21);
    expect(saveFile.mock.calls[0]![1]).toBe('Popescu Ștefan - 6E2-26T1 - pagina 1.png');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descarcă sau copiază' })).toHaveFocus();
  });

  it('downloads every page in one ZIP, each named by its number', async () => {
    renderAdmin(page, apiWith(graded));
    const menu = await openDownload();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Descarcă toate paginile (2)' }));
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    const [zip, name] = saveFile.mock.calls[0]!;
    expect(name).toBe('Popescu Ștefan - 6E2-26T1.zip');
    expect(await zipNames(zip)).toEqual(['pagina 1.png', 'pagina 2.jpg']);
  });

  it('copies the page as a picture and says so', async () => {
    const write = pictureClipboard();
    const api = apiWith(graded);
    renderAdmin(page, api);
    const menu = await openDownload();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Copiază pagina 1' }));
    // Read out through the live region that is always in the page.
    expect(await screen.findByText('Pagina 1 a fost copiată.', { selector: '[aria-live="polite"]' })).toBeInTheDocument();
    expect(write).toHaveBeenCalledTimes(1);
    const item = write.mock.calls[0]![0][0] as unknown as { items: Record<string, Promise<Blob>> };
    expect(Object.keys(item.items)).toEqual(['image/png']);
    expect((await item.items['image/png']!).type).toBe('image/png');
    expect(api.submissionFile).toHaveBeenCalledWith(5, 21);
  });

  it('copies a photo of another type drawn again as PNG, freeing the canvas', async () => {
    const write = pictureClipboard();
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 40, height: 30, close })));
    const drawImage = vi.fn();
    const canvases: HTMLCanvasElement[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      canvases.push(this);
      return { drawImage } as unknown as CanvasRenderingContext2D;
    } as unknown as HTMLCanvasElement['getContext']);
    const sizes: [number, number][] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, done: BlobCallback) {
      sizes.push([this.width, this.height]);
      done(new Blob(['png'], { type: 'image/png' }));
    });
    const jpeg: SubmissionDetail = { ...graded, files: [files[1]!, files[0]!] };
    renderAdmin(page, apiWith(jpeg));
    const menu = await openDownload();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Copiază pagina 1' }));
    expect(await screen.findByText('Pagina 1 a fost copiată.', { selector: '[aria-live="polite"]' })).toBeInTheDocument();
    const item = write.mock.calls[0]![0][0] as unknown as { items: Record<string, Promise<Blob>> };
    expect((await item.items['image/png']!).type).toBe('image/png');
    expect(sizes).toEqual([[40, 30]]);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    // The canvas gives its memory back.
    expect(canvases.map((canvas) => [canvas.width, canvas.height])).toEqual([[0, 0]]);
  });

  it('takes away what failed once another page shows', async () => {
    pictureClipboard(async () => Promise.reject(new DOMException('Refuzat', 'NotAllowedError')));
    renderAdmin(page, apiWith(graded));
    const menu = await openDownload();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Copiază pagina 1' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pagina 2' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('over the whole screen, Esc closes the menu first, also with the focus left on the page', async () => {
    renderAdmin(page, apiWith(graded));
    await openDownload();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getAllByRole('button', { name: 'Pe tot ecranul' })[0]!);
    expect(document.querySelector('.review-photo.is-full')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Descarcă sau copiază' }));
    // As Safari leaves it after a click on a button.
    (document.activeElement as HTMLElement).blur();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(document.querySelector('.review-photo.is-full')).not.toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(document.querySelector('.review-photo.is-full')).toBeNull();
  });

  it('says when the browser refuses the copy', async () => {
    pictureClipboard(async () => Promise.reject(new DOMException('Refuzat', 'NotAllowedError')));
    renderAdmin(page, apiWith(graded));
    const menu = await openDownload();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Copiază pagina 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am putut copia pagina. Descarc-o și deschide-o în programul tău.');
  });

  it('has no copy where the browser cannot copy pictures', async () => {
    renderAdmin(page, apiWith(graded));
    expect(within(await openDownload()).queryByRole('menuitem', { name: /^Copiază/ })).not.toBeInTheDocument();
  });

  it('has no copy for a PDF page, and nothing to archive for one page', async () => {
    pictureClipboard();
    const pdf: SubmissionDetail = { ...graded, files: [{ id: 23, name: 'lucrare.pdf', contentType: 'application/pdf', size: 1024, position: 1 }] };
    renderAdmin(page, apiWith(pdf));
    const menu = await openDownload();
    expect(within(menu).getAllByRole('menuitem').map((item) => item.getAttribute('aria-label'))).toEqual(['Descarcă pagina 1']);
  });

  it('says what went wrong when a page cannot be read', async () => {
    const api = apiWith(graded);
    const { ApiError } = await import('../api.ts');
    api.submissionFile.mockImplementation(async (_submission, fileId) => {
      if (fileId === 22) throw new ApiError(404, 'not_found', 'Nu am găsit ce cauți.');
      return new Blob(['page'], { type: 'image/png' });
    });
    renderAdmin(page, api);
    const menu = await openDownload();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Descarcă toate paginile (2)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am găsit ce cauți.');
    expect(saveFile).not.toHaveBeenCalled();
  });
});

describe('Alte acțiuni', () => {
  it('starts with the pages of the paper, apart from the actions that undo work', async () => {
    renderAdmin(page, apiWith(graded));
    await userEvent.click(await screen.findByRole('button', { name: 'Alte acțiuni' }));
    const menu = screen.getByRole('menu', { name: 'Alte acțiuni' });
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual(['Descarcă paginile (2)', 'Recorectează', 'Resetează']);
    expect(within(menu).getByRole('separator')).toBeInTheDocument();
    expect(items[0]).toHaveAccessibleDescription('Toate paginile, într-o arhivă ZIP · 500 KB');
    await userEvent.click(items[0]!);
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalledWith(expect.any(Blob), 'Popescu Ștefan - 6E2-26T1.zip'));
  });

  it('is off, with the reason, before the student sends a page', async () => {
    renderAdmin(page, apiWith(sending));
    await userEvent.click(await screen.findByRole('button', { name: 'Alte acțiuni' }));
    const item = within(screen.getByRole('menu', { name: 'Alte acțiuni' })).getByRole('menuitem', { name: 'Descarcă paginile' });
    expect(item).toBeDisabled();
    expect(item).toHaveAccessibleDescription('Elevul nu a trimis nicio pagină încă.');
  });

  it('takes the pages sent so far while the student still sends', async () => {
    renderAdmin(page, apiWith({ ...sending, files }));
    await userEvent.click(await screen.findByRole('button', { name: 'Alte acțiuni' }));
    const item = within(screen.getByRole('menu', { name: 'Alte acțiuni' })).getByRole('menuitem', { name: 'Descarcă paginile (2)' });
    expect(item).toHaveAccessibleDescription('Paginile trimise până acum, într-o arhivă ZIP · 500 KB');
  });
});

describe('a paper not graded yet', () => {
  it('downloads all its pages from over the pages', async () => {
    renderAdmin(page, apiWith(sent));
    const pages = await screen.findByRole('region', { name: 'Paginile lucrării' });
    await userEvent.click(within(pages).getByRole('button', { name: 'Descarcă toate' }));
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalledWith(expect.any(Blob), 'Popescu Ștefan - 6E2-26T1.zip'));
  });

  it('on a phone, saves the page on show through the share sheet', async () => {
    screenOf(390);
    canShareFiles.mockReturnValue(true);
    shareFile.mockResolvedValue('shared');
    const api = apiWith(sent);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Pagina 1, pe tot ecranul' }));
    const menu = await openDownload();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Salvează sau trimite pagina 1' }));
    await vi.waitFor(() => expect(shareFile).toHaveBeenCalledTimes(1));
    expect(shareFile.mock.calls[0]![1]).toBe('Popescu Ștefan - 6E2-26T1 - pagina 1.png');
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('on a phone, a tap on the dimmed page closes the sheet and reaches nothing under it', async () => {
    screenOf(390);
    renderAdmin(page, apiWith(sent));
    await userEvent.click(await screen.findByRole('button', { name: 'Pagina 1, pe tot ecranul' }));
    await openDownload();
    const backdrop = document.querySelector<HTMLElement>('.page-download-backdrop');
    expect(backdrop).not.toBeNull();
    await userEvent.click(backdrop!);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(saveFile).not.toHaveBeenCalled();
  });
});
