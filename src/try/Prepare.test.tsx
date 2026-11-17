import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PHONE_IDLE_MS, PHONE_IDLE_TEXT, PHONE_REFRESH_MS } from '../../shared/quickTry.ts';
import { PDF_TYPE } from '../../shared/files.ts';
import { ApiError } from '../ui/ApiError.ts';
import { createFakeApi } from '../test/fakeApi.ts';
import { createFakeTryApi, renderTry, TRY_CODE, TRY_TOKEN, tryTest } from '../test/fakeTryApi.tsx';

const testFile = { name: 'test.pdf', type: PDF_TYPE };
const baremFile = { name: 'barem.pdf', type: PDF_TYPE };
const page = { id: 31, name: 'p1.jpg', contentType: 'image/jpeg', size: 2048, position: 1 };

function setup(overrides: Parameters<typeof tryTest>[0] = {}, pages = [page]) {
  const api = createFakeApi({ classes: [], students: {}, tests: [tryTest(overrides)] });
  const tryApi = createFakeTryApi({ pages: structuredClone(pages) });
  renderTry('/', api, tryApi);
  return { api, tryApi };
}

const startButton = () => screen.findByRole('button', { name: 'Pornește corectarea' });
const pageList = () => screen.findByRole('list', { name: 'Paginile lucrării' });

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:preview'), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
});

describe("a try's files before the grading", () => {
  it('sends a missing test file and says what is still missing', async () => {
    const { api } = setup({}, []);
    expect(await startButton()).toBeDisabled();
    expect(screen.getByText('Lipsește: testul, baremul, paginile lucrării.')).toBeInTheDocument();
    const file = new File(['%PDF-1.7'], 'test.pdf', { type: PDF_TYPE });
    await userEvent.upload(screen.getByLabelText(/Fișierul testului/), file);
    await waitFor(() => expect(api.uploadTestFile).toHaveBeenCalledWith(TRY_CODE, 'test', file));
    expect(await screen.findByRole('link', { name: 'test.pdf' })).toHaveAttribute('href', `/api/try/${TRY_TOKEN}/tests/${TRY_CODE}/files/test`);
    expect(screen.getByText('Lipsește: baremul, paginile lucrării.')).toBeInTheDocument();
  });

  it('asks the robot for the barem only once the test is there, then waits for it', async () => {
    const { api } = setup({ files: { test: testFile, barem: null } });
    const generate = await screen.findByRole('button', { name: 'Fă baremul din test' });
    await userEvent.click(generate);
    expect(api.generateBarem).toHaveBeenCalledWith(TRY_CODE);
    expect(await screen.findByText(/Robotul face baremul din test/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pornește corectarea' })).toBeDisabled();
  });

  it('cannot ask for a barem without the test', async () => {
    setup();
    expect(await screen.findByRole('button', { name: 'Fă baremul din test' })).toBeDisabled();
  });

  it("starts with the robot's barem the page showed, after she downloads it", async () => {
    const { tryApi } = setup({ files: { test: testFile, barem: baremFile }, barem: { request: 'none', unchecked: true }, filesVersion: 2 });
    expect(await screen.findByRole('link', { name: 'Descarcă baremul' })).toHaveAttribute('href', `/api/try/${TRY_TOKEN}/tests/${TRY_CODE}/files/marking-scheme`);
    expect(screen.getByText(/Corectarea pornește doar când apeși/)).toBeInTheDocument();
    await userEvent.click(await startButton());
    expect(tryApi.start).toHaveBeenCalledWith(2);
  });

  it('starts with her own barem without naming a version', async () => {
    const { tryApi } = setup({ files: { test: testFile, barem: baremFile } });
    await userEvent.click(await startButton());
    expect(tryApi.start).toHaveBeenCalledWith(undefined);
  });

  it('shows why the start was refused', async () => {
    const { tryApi } = setup({ files: { test: testFile, barem: baremFile } });
    tryApi.start.mockRejectedValue(new ApiError(409, 'missing_pages', 'Lucrarea nu are nicio pagină.'));
    await userEvent.click(await startButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Lucrarea nu are nicio pagină.');
  });

  it('sends the pages in order, refuses a wrong type, and takes one out', async () => {
    const { tryApi } = setup({}, []);
    await startButton();
    const first = new File(['a'], 'p1.jpg', { type: 'image/jpeg' });
    const second = new File(['b'], 'p2.pdf', { type: PDF_TYPE });
    await userEvent.upload(screen.getByLabelText('Adaugă pagini'), [first, second]);
    await waitFor(async () => expect(within(await pageList()).getAllByRole('listitem')).toHaveLength(2));
    expect(tryApi.addPage.mock.calls.map(([file]) => file.name)).toEqual(['p1.jpg', 'p2.pdf']);
    await userEvent.upload(screen.getByLabelText('Adaugă pagini'), new File(['x'], 'nota.txt', { type: 'text/plain' }), { applyAccept: false });
    expect(screen.getByRole('alert')).toHaveTextContent('Trimite poze JPG sau PDF.');
    expect(tryApi.addPage).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('button', { name: 'Șterge pagina 1' }));
    await waitFor(async () => expect(within(await pageList()).getAllByRole('listitem')).toHaveLength(1));
    // The PDF is left, as page 1.
    expect(within(await pageList()).getByText('PDF')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Pagina 1' })).not.toBeInTheDocument();
  });

  it('shows each page as a preview with its number and size, not its file name', async () => {
    const pdfPage = { id: 32, name: 'scan-cu-un-nume-foarte-lung-2026.pdf', contentType: PDF_TYPE, size: 4096, position: 2 };
    const { tryApi } = setup({}, [page, pdfPage]);
    const list = await pageList();
    expect(await within(list).findByRole('img', { name: 'Pagina 1' })).toHaveAttribute('src', 'blob:preview');
    expect(within(list).getByText('Pagina 2')).toBeInTheDocument();
    expect(within(list).getByText('PDF')).toBeInTheDocument();
    expect(within(list).getByText('2 KB')).toBeInTheDocument();
    expect(list).not.toHaveTextContent('p1.jpg');
    expect(list).not.toHaveTextContent(pdfPage.name);
    // Only a photo is read for its preview.
    expect(tryApi.pageBlob.mock.calls.map(([id]) => id)).toEqual([31]);
  });

  it('opens a page large from its preview', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Vezi pagina 1' }));
    expect(screen.getByRole('dialog', { name: 'Pagina 1' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Închide' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });


  it('links to a photo whose preview could not be read', async () => {
    const api = createFakeApi({ classes: [], students: {}, tests: [tryTest({})] });
    const tryApi = createFakeTryApi({ pages: [structuredClone(page)] });
    tryApi.pageBlob.mockRejectedValue(new ApiError(404, 'not_found', 'Nu am găsit fișierul.'));
    renderTry('/', api, tryApi);
    expect(await screen.findByRole('link', { name: 'Deschide pagina 1' })).toHaveAttribute('href', `/api/try/${TRY_TOKEN}/paper/${page.id}`);
  });

  it('counts the file changes left, and stops them at the limit', async () => {
    setup({ files: { test: testFile, barem: baremFile }, filesVersion: 4 });
    expect(await screen.findByText(/Mai poți încărca testul și baremul de 2 ori în total/)).toBeInTheDocument();
  });

  it('takes no new test or barem once the six changes are used', async () => {
    setup({ files: { test: testFile, barem: baremFile }, filesVersion: 6 });
    expect(await screen.findByText('Nu mai poți schimba testul sau baremul în această încercare.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Fișierul testului/)).toBeDisabled();
    expect(screen.getByLabelText(/Fișierul baremului/)).toBeDisabled();
  });

  it("never shows the students' link, nor a QR code until the phone's is asked for", async () => {
    setup({ files: { test: testFile, barem: baremFile } });
    await startButton();
    expect(document.body.textContent).not.toContain('abcdefghijkmnop2');
    expect(screen.queryByText(/QR/)).not.toBeInTheDocument();
  });
});

describe("the phone's code on a try's page", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const phoneButton = () => screen.findByRole('button', { name: 'Fă poze cu telefonul' });

  it("on a phone, leads to the phone page with its camera, not to a code", async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('pointer: coarse'), media: query }));
    try {
      setup();
      const link = await screen.findByRole('link', { name: 'Fă poze' });
      expect(link).toHaveAttribute('href', '/phone?here=1');
      expect(screen.queryByRole('button', { name: 'Fă poze cu telefonul' })).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('opens and closes the phone code', async () => {
    setup();
    const button = await phoneButton();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTitle('Cod QR pentru telefon')).toBeInTheDocument();
    expect(screen.getByText('Scanează codul cu camera telefonului')).toBeInTheDocument();
    expect(screen.getByText(/Paginile apar în lista de mai sus imediat ce le trimiți/)).toBeInTheDocument();
    expect(screen.getByText(/Pornește corectarea după ce au ajuns toate paginile/)).toBeInTheDocument();
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Scanează codul cu camera telefonului')).not.toBeInTheDocument();
  });

  it('shows a page that arrives while the code is open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { tryApi } = setup({}, []);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await phoneButton());
    tryApi.addPage(new File(['%PDF'], 'p2.pdf', { type: PDF_TYPE }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHONE_REFRESH_MS);
    });
    expect(await screen.findByText('Pagina 1')).toBeInTheDocument();
  });

  it('closes the large page when the phone deletes that page', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { tryApi } = setup();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await phoneButton());
    await user.click(await screen.findByRole('button', { name: 'Vezi pagina 1' }));
    expect(screen.getByRole('dialog', { name: 'Pagina 1' })).toBeInTheDocument();
    await tryApi.deletePage(page.id);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHONE_REFRESH_MS);
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it("reads each photo once for its preview, not again on the phone's watch", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { tryApi } = setup();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await phoneButton());
    await screen.findByRole('img', { name: 'Pagina 1' });
    const lists = tryApi.listPages.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHONE_REFRESH_MS * 3);
    });
    expect(tryApi.listPages.mock.calls.length).toBeGreaterThan(lists);
    expect(tryApi.pageBlob).toHaveBeenCalledTimes(1);
  });

  it('shows "Verifică din nou" once idle and reads again on it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { tryApi } = setup();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await phoneButton());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHONE_IDLE_MS);
    });
    const again = await screen.findByRole('button', { name: 'Verifică din nou' });
    expect(again.parentElement).toHaveTextContent(PHONE_IDLE_TEXT);
    expect(again.parentElement!.parentElement).toHaveAttribute('aria-live', 'polite');
    const calls = tryApi.listPages.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHONE_REFRESH_MS * 3);
    });
    expect(tryApi.listPages).toHaveBeenCalledTimes(calls);
    await user.click(again);
    await waitFor(() => expect(tryApi.listPages.mock.calls.length).toBeGreaterThan(calls));
    expect(screen.queryByRole('button', { name: 'Verifică din nou' })).not.toBeInTheDocument();
  });

  it('reads nothing on a timer while the code is closed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { tryApi } = setup();
    await phoneButton();
    const calls = tryApi.listPages.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(tryApi.listPages).toHaveBeenCalledTimes(calls);
  });
});
