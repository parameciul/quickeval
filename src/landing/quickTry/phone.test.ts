import { waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import page from '../../../index.html?raw';
import type { SubmissionFile } from '../../../shared/api.ts';
import { PDF_TYPE } from '../../../shared/files.ts';
import { ApiError } from '../../ui/ApiError.ts';
import type { LandingApi } from './api.ts';
import { openPhoneStep } from './phone.ts';

const TOKEN = 'abcdefghijkmnopqrstuvwxyz2345672';
const stored = { token: TOKEN, code: 'PROBA-26T1', madeAt: '2026-11-16T08:00:00.000Z' };
const file = (id: number, size = 1258291): SubmissionFile => ({ id, name: `p${id}.jpg`, contentType: 'image/jpeg', size, position: id });

let step: { close(): void } | null = null;

afterEach(() => {
  step?.close();
  step = null;
  document.body.innerHTML = '';
});

function fakeApi(pages: SubmissionFile[] = []) {
  return {
    availability: vi.fn(),
    create: vi.fn(),
    uploadTestFile: vi.fn(),
    generateBarem: vi.fn(),
    addPage: vi.fn(async (_token: string, picked: File) => {
      pages.push({ id: pages.length + 1, name: picked.name, contentType: picked.type, size: picked.size, position: pages.length + 1 });
    }),
    listPages: vi.fn(async (_token: string) => structuredClone(pages)),
    start: vi.fn(async (_token: string) => {}),
    getTest: vi.fn(),
  } satisfies LandingApi;
}

interface OpenOptions {
  pages?: SubmissionFile[];
  robotBarem?: boolean;
  drawQr?: (svg: SVGSVGElement, text: string) => Promise<void>;
  idleMs?: number;
}

function open(options: OpenOptions = {}) {
  document.body.innerHTML = new DOMParser().parseFromString(page, 'text/html').body.innerHTML;
  const dialog = document.querySelector<HTMLDialogElement>('[data-try-dialog]')!;
  // The form's send leaves the dialog open.
  dialog.setAttribute('open', '');
  const api = fakeApi(options.pages ?? []);
  const drawQr = vi.fn(options.drawQr ?? (async () => {}));
  const onStarted = vi.fn();
  const onClosed = vi.fn();
  step = openPhoneStep(
    dialog,
    { api, origin: 'https://mqgrader.ro', drawQr, refreshMs: 5, idleMs: options.idleMs },
    stored,
    { robotBarem: options.robotBarem ?? false, onStarted, onClosed },
  );
  const block = dialog.querySelector<HTMLElement>('[data-try-phone]')!;
  return { api, drawQr, onStarted, onClosed, dialog, block, view: within(block) };
}

function pickOnLaptop(block: HTMLElement, ...picked: File[]) {
  const input = block.querySelector<HTMLInputElement>('[data-try-phone-files]')!;
  Object.defineProperty(input, 'files', { value: picked, configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('the QR window after a send with the phone', () => {
  it("shows the code for the try's phone address", () => {
    const { drawQr, dialog, block, view } = open();
    expect(block).toBeVisible();
    expect(dialog.querySelector('[data-try-form]')).not.toBeVisible();
    expect(dialog).toHaveAttribute('aria-labelledby', 'try-phone-title');
    expect(view.getByRole('heading', { name: 'Fă pozele cu telefonul' })).toHaveFocus();
    expect(drawQr).toHaveBeenCalledWith(block.querySelector('[data-try-qr]'), `https://mqgrader.ro/try/${TOKEN}/telefon`);
    expect(view.getByText('Codul merge doar pentru această încercare.')).toBeVisible();
  });

  it('shows "Se așteaptă pozele de pe telefon…" and keeps the start button off with no page', async () => {
    const { api, view } = open();
    await waitFor(() => expect(api.listPages).toHaveBeenCalledWith(TOKEN));
    expect(view.getByText('Se așteaptă pozele de pe telefon…')).toBeVisible();
    expect(view.getByRole('button', { name: 'Pornește corectarea' })).toBeDisabled();
  });

  it('lists the pages with their sizes and count as they arrive, and turns the start button on', async () => {
    const pages: SubmissionFile[] = [];
    const { view } = open({ pages });
    await waitFor(() => expect(view.getByText('Se așteaptă pozele de pe telefon…')).toBeVisible());
    pages.push(file(1), file(2, 1468006));
    await waitFor(() => expect(view.getByText('Pagina 2')).toBeVisible());
    expect(view.getByText('Pagina 1')).toBeVisible();
    expect(view.getByText('1,2 MB')).toBeVisible();
    expect(view.getByText('1,4 MB')).toBeVisible();
    expect(view.getByRole('heading', { name: /Pagini primite/ })).toHaveTextContent('2');
    expect(view.getByText('Se așteaptă pozele de pe telefon…')).not.toBeVisible();
    expect(view.getByRole('button', { name: 'Pornește corectarea' })).toBeEnabled();
  });

  it('starts the grading, then calls onStarted', async () => {
    const { api, onStarted, view } = open({ pages: [file(1)] });
    const start = view.getByRole('button', { name: 'Pornește corectarea' });
    await waitFor(() => expect(start).toBeEnabled());
    start.click();
    await waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
    expect(api.start).toHaveBeenCalledTimes(1);
    expect(api.start).toHaveBeenCalledWith(TOKEN);
  });

  it('shows a refused start with the link to the try', async () => {
    const { api, onStarted, view } = open({ pages: [file(1)] });
    api.start.mockRejectedValueOnce(new ApiError(409, 'not_ready', 'Lipsește baremul.'));
    const start = view.getByRole('button', { name: 'Pornește corectarea' });
    await waitFor(() => expect(start).toBeEnabled());
    start.click();
    expect(await view.findByRole('alert')).toHaveTextContent('Lipsește baremul.');
    const link = view.getByRole('link', { name: 'Deschide încercarea' });
    expect(link).toHaveAttribute('href', `/try/${TOKEN}`);
    expect(link).toBeVisible();
    expect(onStarted).not.toHaveBeenCalled();
  });

  it('with the robot\'s barem: no start button, the line about the barem, and "Deschide încercarea" as the main button', () => {
    const { view } = open({ pages: [file(1)], robotBarem: true });
    expect(view.queryByRole('button', { name: 'Pornește corectarea' })).toBeNull();
    expect(view.getByText('Baremul se face acum din test. Îl citești pe pagina încercării, apoi pornești corectarea de acolo.')).toBeVisible();
    const link = view.getByRole('link', { name: 'Deschide încercarea' });
    expect(link).toBeVisible();
    expect(link).toHaveClass('btn-primary');
  });

  it('sends files picked on the laptop into the list', async () => {
    const { api, block, view } = open();
    pickOnLaptop(block, new File(['jpg'], 'a.jpg', { type: 'image/jpeg' }), new File(['%PDF'], 'b.pdf', { type: PDF_TYPE }));
    await waitFor(() => expect(view.getByText('Pagina 2')).toBeVisible());
    expect(api.addPage.mock.calls.map(([, picked]) => picked.name)).toEqual(['a.jpg', 'b.pdf']);
  });

  it('refuses a wrong file type with its message, sending nothing', async () => {
    const { api, block, view } = open();
    pickOnLaptop(block, new File(['x'], 'p.heic', { type: 'image/heic' }));
    expect(await view.findByRole('alert')).toHaveTextContent('p.heic: Trimite poze JPG sau PDF.');
    expect(api.addPage).not.toHaveBeenCalled();
  });

  it('shows the address as text when the code cannot be drawn', async () => {
    const { block } = open({ drawQr: async () => Promise.reject(new Error('offline')) });
    const link = block.querySelector<HTMLElement>('[data-try-qr-link]')!;
    await waitFor(() => expect(link).toBeVisible());
    expect(link).toHaveTextContent(`https://mqgrader.ro/try/${TOKEN}/telefon`);
    expect(block.querySelector('[data-try-qr]')).not.toBeVisible();
  });

  it('stops reading when it closes', async () => {
    const { api, onClosed, dialog, view } = open();
    await waitFor(() => expect(api.listPages).toHaveBeenCalled());
    view.getByRole('button', { name: 'Închide' }).click();
    expect(onClosed).toHaveBeenCalledTimes(1);
    const reads = api.listPages.mock.calls.length;
    await new Promise((done) => setTimeout(done, 30));
    expect(api.listPages).toHaveBeenCalledTimes(reads);
    expect(dialog.querySelector('[data-try-form]')).toBeVisible();
    expect(dialog).toHaveAttribute('aria-labelledby', 'try-title');
  });

  it('shows "Verifică din nou" once idle and reads again on it', async () => {
    const { api, view } = open({ idleMs: 20 });
    const again = await view.findByRole('button', { name: 'Verifică din nou' });
    const reads = api.listPages.mock.calls.length;
    await new Promise((done) => setTimeout(done, 30));
    expect(api.listPages).toHaveBeenCalledTimes(reads);
    again.click();
    await waitFor(() => expect(api.listPages.mock.calls.length).toBeGreaterThan(reads));
    expect(view.queryByRole('button', { name: 'Verifică din nou' })).toBeNull();
  });
});
