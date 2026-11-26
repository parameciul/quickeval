import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
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
    expect(await screen.findByText('Citește întâi baremul robotului')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Baremul făcut de robot' })).toBeInTheDocument();
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

  it('says nothing of the cap on file changes while more than one is left', async () => {
    const { api } = setup({ files: { test: testFile, barem: baremFile }, filesVersion: 4 });
    await startButton();
    expect(screen.queryByText(/Mai poți/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nu mai poți schimba/)).not.toBeInTheDocument();
    const file = new File(['%PDF-1.7'], 'nou.pdf', { type: PDF_TYPE });
    await userEvent.upload(screen.getByLabelText(/Fișierul testului/), file);
    await waitFor(() => expect(api.uploadTestFile).toHaveBeenCalledWith(TRY_CODE, 'test', file));
  });

  it('names the last file change', async () => {
    setup({ files: { test: testFile, barem: baremFile }, filesVersion: 5 });
    expect(await screen.findByText('Mai poți schimba testul sau baremul o singură dată.')).toBeInTheDocument();
    expect(screen.getAllByText('Schimbă')).toHaveLength(2);
  });

  it('takes no new test or barem once the six changes are used', async () => {
    setup({ files: { test: testFile, barem: baremFile }, filesVersion: 6 });
    expect(await screen.findByText('Nu mai poți schimba testul sau baremul în această încercare.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Fișierul testului/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Fișierul baremului/)).not.toBeInTheDocument();
    expect(screen.queryByText('Schimbă')).not.toBeInTheDocument();
    // The files still open.
    expect(screen.getByRole('link', { name: 'test.pdf' })).toBeInTheDocument();
  });

  it('says the try is ready to grade, with its pages counted', async () => {
    setup({ files: { test: testFile, barem: baremFile } }, [page, { ...page, id: 32, position: 2 }]);
    expect(await screen.findByText('Gata de corectare')).toBeInTheDocument();
    expect(screen.getByText('Testul, baremul și 2 pagini au ajuns. Corectarea durează câteva minute.')).toBeInTheDocument();
    expect(await startButton()).toBeEnabled();
  });

  it('waits for the barem while the robot makes it', async () => {
    setup({ files: { test: testFile, barem: null }, barem: { request: 'requested', unchecked: false } });
    expect(await screen.findByText('Se așteaptă baremul')).toBeInTheDocument();
    expect(await screen.findByText('Lipsește: baremul.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fă baremul din test' })).not.toBeInTheDocument();
  });

  it('refuses a test file that is not PDF or Word, and sends nothing', async () => {
    const { api } = setup({}, []);
    await startButton();
    await userEvent.upload(screen.getByLabelText(/Fișierul testului/), new File(['x'], 'test.txt', { type: 'text/plain' }), { applyAccept: false });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(api.uploadTestFile).not.toHaveBeenCalled();
  });

  it('waits for an upload before it can start', async () => {
    const { api } = setup({ files: { test: testFile, barem: baremFile } });
    const start = await startButton();
    await waitFor(() => expect(start).toBeEnabled());
    api.uploadTestFile.mockImplementation(() => new Promise(() => undefined));
    await userEvent.upload(screen.getByLabelText(/Fișierul testului/), new File(['%PDF-1.7'], 'nou.pdf', { type: PDF_TYPE }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pornește corectarea' })).toBeDisabled());
  });

  it('names a file input by the words it shows, and asks for a test without answers', async () => {
    setup({ files: { test: null, barem: baremFile } });
    expect(await screen.findByLabelText('Alege testul: Fișierul testului')).toBeInTheDocument();
    expect(screen.getByLabelText('Schimbă: Fișierul baremului')).toBeInTheDocument();
    expect(screen.getByText('Fără răspunsuri. PDF, Word sau poze.')).toBeInTheDocument();
  });

  it('reads out only the title of the ready line, not each page count', async () => {
    setup({ files: { test: testFile, barem: baremFile } });
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent(/^Gata de corectare$/));
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('takes a test file dropped on its tile', async () => {
    const { api } = setup({}, []);
    await startButton();
    const file = new File(['%PDF-1.7'], 'test.pdf', { type: PDF_TYPE });
    const tile = screen.getByText('Alege testul').closest('label')!;
    fireEvent.drop(tile, { dataTransfer: { files: [file], types: ['Files'] } });
    await waitFor(() => expect(api.uploadTestFile).toHaveBeenCalledWith(TRY_CODE, 'test', file));
  });

  describe('photos of the test', () => {
    const photo = (name: string) => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], name, { type: 'image/jpeg' });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('sends photos dropped on the tile as one PDF', async () => {
      // The browser's photo tools: a decoded photo, and a canvas that writes a JPEG.
      const close = vi.fn();
      vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 800, height: 600, close })));
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: () => undefined, drawImage: () => undefined } as never);
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) => done(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2])], { type: 'image/jpeg' })));
      const { api } = setup({}, []);
      await startButton();
      const tile = screen.getByText('Alege testul').closest('label')!;
      fireEvent.drop(tile, { dataTransfer: { files: [photo('IMG_2.jpg'), photo('IMG_1.jpg')], types: ['Files'] } });
      await waitFor(() => expect(api.uploadTestFile).toHaveBeenCalled());
      const sent = api.uploadTestFile.mock.calls[0]![2] as File;
      expect(sent.name).toBe('IMG_1.pdf');
      expect(sent.type).toBe(PDF_TYPE);
      expect(new TextDecoder().decode((await sent.arrayBuffer()).slice(0, 5))).toBe('%PDF-');
      expect(close).toHaveBeenCalledTimes(2);
    });

    it('says which photo it could not read, and sends nothing', async () => {
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => {
          throw new Error('HEIC');
        }),
      );
      const { api } = setup({}, []);
      await startButton();
      await userEvent.upload(screen.getByLabelText(/Fișierul testului/), [photo('IMG_1.jpg')]);
      expect(await screen.findByRole('alert')).toHaveTextContent('Nu am putut citi poza IMG_1.jpg. Alege o poză JPG, PNG sau WebP.');
      expect(api.uploadTestFile).not.toHaveBeenCalled();
    });
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

  it('shows a test that arrives from the phone while the code is open, and stops reading the test once it has both files', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api } = setup({ files: { test: null, barem: baremFile } }, []);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await phoneButton());
    await api.uploadTestFile('PROBA-26T1', 'test', new File(['%PDF'], 'Testul.pdf', { type: PDF_TYPE }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHONE_REFRESH_MS);
    });
    expect(await screen.findByRole('link', { name: 'Testul.pdf' })).toBeInTheDocument();
    const reads = api.getTest.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHONE_REFRESH_MS * 3);
    });
    expect(api.getTest).toHaveBeenCalledTimes(reads);
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
    // The 15 minutes go in one synchronous step: the async advance waits a
    // real macrotask after each of the 300 reads every 3 s, which takes
    // seconds when the whole suite runs. The reads that pile up meanwhile
    // join the one in flight; usePagesWatch.test.ts checks the timing itself.
    act(() => {
      vi.advanceTimersByTime(PHONE_IDLE_MS);
    });
    await act(async () => {});
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
