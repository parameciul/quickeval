import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
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
    expect(await screen.findByRole('link', { name: 'Descarcă baremul' })).toHaveAttribute('href', `/api/try/${TRY_TOKEN}/tests/${TRY_CODE}/files/barem`);
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
    expect(await screen.findByText(/Pagina 2: p2.pdf/)).toBeInTheDocument();
    expect(tryApi.addPage.mock.calls.map(([file]) => file.name)).toEqual(['p1.jpg', 'p2.pdf']);
    await userEvent.upload(screen.getByLabelText('Adaugă pagini'), new File(['x'], 'nota.txt', { type: 'text/plain' }), { applyAccept: false });
    expect(screen.getByRole('alert')).toHaveTextContent('Trimite poze JPG sau PDF.');
    expect(tryApi.addPage).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('button', { name: 'Șterge pagina 1' }));
    await waitFor(() => expect(screen.queryByText(/p1.jpg/)).not.toBeInTheDocument());
    expect(within(screen.getByRole('list', { name: 'Paginile lucrării' })).getByText(/Pagina 1: p2.pdf/)).toBeInTheDocument();
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

  it('never shows the students\' link or a QR code', async () => {
    setup({ files: { test: testFile, barem: baremFile } });
    await startButton();
    expect(document.body.textContent).not.toContain('abcdefghijkmnop2');
    expect(screen.queryByText(/QR/)).not.toBeInTheDocument();
  });
});
