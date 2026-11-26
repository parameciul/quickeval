import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionFile } from '../../shared/api.ts';
import { ApiError } from '../ui/ApiError.ts';
import { createFakeApi } from '../test/fakeApi.ts';
import { createFakeTryApi, renderTry, tryTest } from '../test/fakeTryApi.tsx';
import { expectNoGradingWords } from '../test/gradingWords.ts';

vi.mock('../ui/picturesPdf.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ui/picturesPdf.ts')>();
  return {
    ...actual,
    // The photos' names in order, as one fake PDF.
    picturesToPdf: vi.fn(async (pictures: readonly File[], name: string) => ({
      file: new File([pictures.map((picture) => picture.name).join('|')], name, { type: 'application/pdf' }),
    })),
  };
});

const files = { test: { name: 'test.pdf', type: 'application/pdf' }, barem: { name: 'barem.pdf', type: 'application/pdf' } };
const page = (id: number, name: string): SubmissionFile => ({ id, name, contentType: 'application/pdf', size: 900, position: id });
const jpeg = (name: string) => new File([new Uint8Array(10)], name, { type: 'image/jpeg' });

function setup(pages: SubmissionFile[] = [], test = tryTest({ title: 'Fracții 6B', files }), path = '/phone') {
  const api = createFakeApi({ classes: [], students: {}, tests: [test] });
  const tryApi = createFakeTryApi({ pages });
  renderTry(path, api, tryApi);
  return { api, tryApi };
}

const pick = (picked: File[]) => userEvent.upload(screen.getByLabelText('Alege fișiere'), picked);
const snap = (photo: File) => userEvent.upload(screen.getByLabelText('Fă o poză'), photo);

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:preview'), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
});

describe("a try's phone page", () => {
  it("shows the heading, the try's name and the two pick buttons", async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'Lucrarea elevului', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Fracții 6B')).toBeInTheDocument();
    expect(screen.getByLabelText('Fă o poză')).toHaveAttribute('capture', 'environment');
    expect(screen.getByLabelText('Alege fișiere')).toBeInTheDocument();
  });

  it('opens from the old Romanian address too, never the try with its result', async () => {
    setup([], undefined, '/telefon');
    expect(await screen.findByRole('heading', { name: 'Lucrarea elevului', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Deschide încercarea' })).not.toBeInTheDocument();
  });

  it('keeps the flag of the old address', async () => {
    setup([page(1, 'a.pdf')], undefined, '/telefon?here=1');
    await userEvent.click(await screen.findByRole('button', { name: 'Am terminat' }));
    expect(await screen.findByRole('link', { name: 'Deschide încercarea' })).toBeInTheDocument();
  });

  it('lists the pages the try already has', async () => {
    setup([page(1, 'a.pdf'), page(2, 'b.pdf')]);
    expect(await screen.findByRole('heading', { name: 'Paginile (2)' })).toBeInTheDocument();
  });

  it('sends a photo and then shows the last screen after "Am terminat"', async () => {
    const { tryApi } = setup();
    await screen.findByRole('heading', { name: 'Lucrarea elevului', level: 1 });
    await pick([jpeg('pagina-1.jpg')]);
    await waitFor(() => expect(screen.getByText('Încărcat')).toBeInTheDocument());
    expect(tryApi.uploadPage).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Am terminat' }));
    expect(await screen.findByRole('heading', { name: 'Paginile au ajuns' })).toBeInTheDocument();
    expect(screen.getByText('1 pagină este pe calculator.')).toBeInTheDocument();
    expect(screen.getByText('Continuă acolo.')).toBeInTheDocument();
    expectNoGradingWords();
    await userEvent.click(screen.getByRole('button', { name: 'Mai adaugă pagini' }));
    expect(await screen.findByRole('heading', { name: 'Paginile (1)' })).toBeInTheDocument();
  });

  it('counts many pages in the plural on the last screen', async () => {
    setup([page(1, 'a.pdf'), page(2, 'b.pdf'), page(3, 'c.pdf')]);
    await userEvent.click(await screen.findByRole('button', { name: 'Am terminat' }));
    expect(await screen.findByText('3 pagini sunt pe calculator.')).toBeInTheDocument();
  });

  it("has no link to a result or to the try's page", async () => {
    setup([page(1, 'a.pdf')]);
    const main = await screen.findByRole('main');
    await screen.findByRole('heading', { name: 'Lucrarea elevului', level: 1 });
    expect(within(main).queryAllByRole('link')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Am terminat' }));
    await screen.findByRole('heading', { name: 'Paginile au ajuns' });
    expect(within(main).queryAllByRole('link')).toHaveLength(0);
  });

  it('on the phone that made the try, has no link to the try while she takes the photos', async () => {
    setup([page(1, 'a.pdf')], undefined, '/phone?here=1');
    await screen.findByRole('button', { name: 'Am terminat' });
    expect(within(screen.getByRole('main')).queryAllByRole('link')).toHaveLength(0);
  });

  it('on the phone that made the try, the last screen opens the try', async () => {
    setup([page(1, 'a.pdf')], undefined, '/phone?here=1');
    await userEvent.click(await screen.findByRole('button', { name: 'Am terminat' }));
    expect(await screen.findByRole('heading', { name: 'Paginile au ajuns' })).toBeInTheDocument();
    expect(screen.getByText('1 pagină este la încercare.')).toBeInTheDocument();
    expect(screen.queryByText('Continuă acolo.')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Deschide încercarea' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mai adaugă pagini' })).toBeInTheDocument();
    expectNoGradingWords();
  });

  it('on the phone that made the try, a failed try sends her to the try page', async () => {
    setup([page(1, 'a.pdf')], tryTest({ barem: { request: 'failed', unchecked: false } }), '/phone?here=1');
    expect(await screen.findByText('Încercarea nu a mers. Continuă pe pagina încercării.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Deschide încercarea' })).toBeInTheDocument();
    expectNoGradingWords();
  });

  it('a scanned phone page has no link to the try once the paper is sent', async () => {
    setup([page(1, 'a.pdf')], tryTest({ status: 'evaluating' }, { status: 'submitted' }));
    expect(await screen.findByText('Lucrarea a fost trimisă. Nu mai poți schimba paginile.')).toBeInTheDocument();
    expect(within(screen.getByRole('main')).queryAllByRole('link')).toHaveLength(0);
  });

  it('on the phone that made the try, the read-only page opens the try', async () => {
    setup([page(1, 'a.pdf')], tryTest({ status: 'evaluating' }, { status: 'submitted' }), '/phone?here=1');
    expect(await screen.findByRole('link', { name: 'Deschide încercarea' })).toBeInTheDocument();
    expectNoGradingWords();
  });

  it('is read only once the paper is sent', async () => {
    setup([page(1, 'a.pdf')], tryTest({ status: 'evaluating' }, { status: 'submitted' }));
    expect(await screen.findByText('Lucrarea a fost trimisă. Nu mai poți schimba paginile.')).toBeInTheDocument();
    expect(await screen.findByText('a.pdf')).toBeInTheDocument();
    expect(screen.queryByLabelText('Fă o poză')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Șterge/ })).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('says the try did not work, not that the paper was sent, when the robot failed', async () => {
    setup([page(1, 'a.pdf')], tryTest({ barem: { request: 'failed', unchecked: false } }));
    expect(await screen.findByText('Încercarea nu a mers. Continuă pe calculator.')).toBeInTheDocument();
    expect(screen.queryByText(/Lucrarea a fost trimisă/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fă o poză')).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('turns read only when a page is refused because the paper was sent, with the pages sent and the message', async () => {
    const { api, tryApi } = setup();
    await screen.findByRole('heading', { name: 'Lucrarea elevului', level: 1 });
    await pick([jpeg('pagina-1.jpg')]);
    await waitFor(() => expect(screen.getByText('Încărcat')).toBeInTheDocument());
    tryApi.uploadPage.mockRejectedValueOnce(new ApiError(409, 'paper_sent', 'Lucrarea a plecat deja la corectare.'));
    api.getTest.mockResolvedValue(tryTest({ status: 'evaluating' }, { status: 'submitted' }));
    await pick([jpeg('pagina-2.jpg')]);
    expect(await screen.findByText('Lucrarea a fost trimisă. Nu mai poți schimba paginile.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Paginile (1)' })).toBeInTheDocument();
    expect(screen.getByText('pagina-1.jpg')).toBeInTheDocument();
    expect(screen.getByText('Lucrarea a plecat deja la corectare.')).toBeInTheDocument();
    expectNoGradingWords();
  });

  it('turns read only when a delete is refused because the paper was sent', async () => {
    const { api, tryApi } = setup([page(1, 'a.pdf')]);
    await screen.findByRole('heading', { name: 'Paginile (1)' });
    tryApi.deletePage.mockRejectedValueOnce(new ApiError(409, 'paper_sent', 'Lucrarea a plecat deja la corectare.'));
    api.getTest.mockResolvedValue(tryTest({ status: 'evaluating' }, { status: 'submitted' }));
    await userEvent.click(screen.getByRole('button', { name: 'Șterge pagina 1' }));
    expect(await screen.findByText('Lucrarea a fost trimisă. Nu mai poți schimba paginile.')).toBeInTheDocument();
    expect(screen.getByText('a.pdf')).toBeInTheDocument();
    expect(screen.getByText('Lucrarea a plecat deja la corectare.')).toBeInTheDocument();
  });

  it('shows the expired notice for an expired try', async () => {
    const api = createFakeApi({ classes: [], students: {}, tests: [tryTest()] });
    renderTry('/phone', api, createFakeTryApi({ info: { expired: true } }));
    expect(await screen.findByRole('heading', { name: 'Încercarea a expirat' })).toBeInTheDocument();
  });
});


describe('a phone page that takes the test and the barem too', () => {
  const empty = () => tryTest({ title: 'Fracții 6B' });

  it('walks the parts the address names, in order, with the steps on top', async () => {
    setup([], empty(), '/phone?parts=pages,test,marking-scheme');
    expect(await screen.findByRole('heading', { name: 'Testul', level: 1 })).toBeInTheDocument();
    const steps = screen.getByRole('list', { name: 'Pașii' });
    expect(within(steps).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Testul', 'Baremul', 'Lucrarea']);
    expect(within(steps).getByText('Testul').closest('li')).toHaveAttribute('aria-current', 'step');
    expectNoGradingWords();
  });

  it('keeps the photos on the phone in the order taken and sends them once, as one PDF', async () => {
    const { api } = setup([], empty(), '/phone?parts=test,marking-scheme,pages');
    await screen.findByRole('heading', { name: 'Testul', level: 1 });
    expect(screen.getByRole('button', { name: 'Trimite testul și continuă' })).toBeDisabled();
    await snap(jpeg('image.jpg'));
    await snap(jpeg('IMG_9.jpg'));
    await snap(jpeg('IMG_10.jpg'));
    await waitFor(() => expect(screen.getAllByRole('img').map((img) => img.getAttribute('alt'))).toEqual(['Poza 1', 'Poza 2', 'Poza 3']));
    await userEvent.click(screen.getByRole('button', { name: 'Șterge poza 1' }));
    expect(api.uploadTestFile).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Trimite testul și continuă' }));
    expect(await screen.findByRole('heading', { name: 'Baremul', level: 1 })).toBeInTheDocument();
    expect(api.uploadTestFile).toHaveBeenCalledTimes(1);
    const [code, kind, file] = api.uploadTestFile.mock.calls[0]!;
    expect([code, kind, file.name]).toEqual(['PROBA-26T1', 'test', 'Testul.pdf']);
    expect(await file.text()).toBe('IMG_9.jpg|IMG_10.jpg');
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Pașii' })).getByText(/Testul/).closest('li')).toHaveClass('is-done'));
    expect(api.generateBarem).not.toHaveBeenCalled();
    expectNoGradingWords();
  });

  it('sends one PDF or Word file as it is', async () => {
    const { api } = setup([], empty(), '/phone?parts=marking-scheme');
    await screen.findByRole('heading', { name: 'Baremul', level: 1 });
    const pdf = new File(['%PDF'], 'barem cap 3.pdf', { type: 'application/pdf' });
    await pick([pdf]);
    expect(screen.getByText('barem cap 3.pdf')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Trimite baremul' }));
    expect(await screen.findByRole('heading', { name: 'Pozele au ajuns' })).toBeInTheDocument();
    expect(api.uploadTestFile).toHaveBeenCalledWith('PROBA-26T1', 'barem', pdf);
    expect(screen.getByText('Sunt pe calculator.')).toBeInTheDocument();
    expectNoGradingWords();
  });

  it('refuses a PDF picked with photos', async () => {
    setup([], empty(), '/phone?parts=test');
    await screen.findByRole('heading', { name: 'Testul', level: 1 });
    await pick([jpeg('a.jpg'), new File(['%PDF'], 'b.pdf', { type: 'application/pdf' })]);
    expect(screen.getByRole('alert')).toHaveTextContent('Încarcă un fișier PDF sau Word (.docx), ori poze JPG, PNG sau WebP.');
    expect(screen.getByRole('button', { name: 'Trimite testul' })).toBeDisabled();
  });

  it('asks for the barem made from the test when she chose none of her own', async () => {
    const { api } = setup([], empty(), '/phone?parts=test,pages');
    await screen.findByRole('heading', { name: 'Testul', level: 1 });
    await snap(jpeg('a.jpg'));
    await userEvent.click(screen.getByRole('button', { name: 'Trimite testul și continuă' }));
    expect(await screen.findByRole('heading', { name: 'Lucrarea elevului', level: 1 })).toBeInTheDocument();
    expect(api.generateBarem).toHaveBeenCalledWith('PROBA-26T1');
    expectNoGradingWords();
  });

  it('says a part has arrived, goes on, and goes back', async () => {
    setup([], tryTest({ title: 'Fracții 6B', files: { test: files.test, barem: null } }), '/phone?parts=test,marking-scheme');
    expect(await screen.findByText('Testul a ajuns.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continuă cu baremul' }));
    expect(await screen.findByRole('heading', { name: 'Baremul', level: 1 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Înapoi' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Fă din nou pozele' }));
    expect(screen.getByRole('button', { name: 'Trimite testul și continuă' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Renunță' }));
    expect(screen.getByText('Testul a ajuns.')).toBeInTheDocument();
  });

  it('without a list of parts, takes what the try misses, and the pages', async () => {
    setup([], tryTest({ title: 'Fracții 6B', files: { test: files.test, barem: null } }));
    expect(await screen.findByRole('heading', { name: 'Baremul', level: 1 })).toBeInTheDocument();
    const steps = screen.getByRole('list', { name: 'Pașii' });
    expect(within(steps).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Baremul', 'Lucrarea']);
  });

  it('lets her leave a part for later, but not the last one', async () => {
    const { api } = setup([], empty());
    expect(await screen.findByRole('heading', { name: 'Testul', level: 1 })).toBeInTheDocument();
    await snap(jpeg('a.jpg'));
    await userEvent.click(screen.getByRole('button', { name: 'Trimite testul și continuă' }));
    // Without a list the barem is a step, so none is asked for: she may still skip it.
    expect(await screen.findByRole('heading', { name: 'Baremul', level: 1 })).toBeInTheDocument();
    expect(api.generateBarem).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Mai târziu' }));
    expect(await screen.findByRole('heading', { name: 'Lucrarea elevului', level: 1 })).toBeInTheDocument();
    expect(api.uploadTestFile).toHaveBeenCalledTimes(1);
    expectNoGradingWords();
  });

  it('has no "Mai târziu" on the last step', async () => {
    setup([], empty(), '/phone?parts=marking-scheme');
    await screen.findByRole('heading', { name: 'Baremul', level: 1 });
    expect(screen.queryByRole('button', { name: 'Mai târziu' })).not.toBeInTheDocument();
  });

  it('reads the pages again when she comes back to the pages step', async () => {
    const { tryApi } = setup([], tryTest({ title: 'Fracții 6B', files: { test: files.test, barem: null } }), '/phone?parts=test,pages');
    await userEvent.click(await screen.findByRole('button', { name: 'Continuă cu lucrarea elevului' }));
    await screen.findByRole('heading', { name: 'Lucrarea elevului', level: 1 });
    await pick([jpeg('pagina-1.jpg')]);
    await waitFor(() => expect(screen.getByText('Încărcat')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Înapoi' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Continuă cu lucrarea elevului' }));
    expect(await screen.findByRole('heading', { name: 'Paginile (1)' })).toBeInTheDocument();
    expect(tryApi.listPages.mock.calls.length).toBeGreaterThan(1);
  });

  it('keeps "Înapoi" off while a send of the step is on its way', async () => {
    const { api } = setup([], tryTest({ title: 'Fracții 6B', files: { test: files.test, barem: null } }), '/phone?parts=test,marking-scheme');
    await userEvent.click(await screen.findByRole('button', { name: 'Continuă cu baremul' }));
    await screen.findByRole('heading', { name: 'Baremul', level: 1 });
    let finish = () => {};
    api.uploadTestFile.mockImplementationOnce(() => new Promise((done) => (finish = () => done({ file: { name: 'b.pdf', type: 'application/pdf' }, robot: null }))));
    await snap(jpeg('a.jpg'));
    await userEvent.click(screen.getByRole('button', { name: 'Trimite baremul' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Înapoi' })).toBeDisabled());
    finish();
    expect(await screen.findByRole('heading', { name: 'Pozele au ajuns' })).toBeInTheDocument();
  });

  it('asks for the barem again when its first request failed', async () => {
    const { api } = setup([], empty(), '/phone?parts=test,pages');
    api.generateBarem.mockRejectedValueOnce(new ApiError(0, 'network', 'Nu mă pot conecta la server.'));
    await screen.findByRole('heading', { name: 'Testul', level: 1 });
    await snap(jpeg('a.jpg'));
    await userEvent.click(screen.getByRole('button', { name: 'Trimite testul și continuă' }));
    expect(await screen.findByText('Testul a ajuns.')).toBeInTheDocument();
    expect(screen.getByText('Nu mă pot conecta la server.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fă baremul din test' }));
    await waitFor(() => expect(api.generateBarem).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Fă baremul din test' })).not.toBeInTheDocument());
    expectNoGradingWords();
  });

  it("shows the server's refusal and stays on the step", async () => {
    const { api } = setup([], empty(), '/phone?parts=test,pages');
    api.uploadTestFile.mockRejectedValueOnce(new ApiError(409, 'quick_try_files', 'Într-o încercare rapidă poți încărca testul și baremul de cel mult 6 ori în total.'));
    await screen.findByRole('heading', { name: 'Testul', level: 1 });
    await snap(jpeg('a.jpg'));
    await userEvent.click(screen.getByRole('button', { name: 'Trimite testul și continuă' }));
    expect(await screen.findByText(/de cel mult 6 ori/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Testul', level: 1 })).toBeInTheDocument();
  });

  it('on the phone that made the try, the last screen opens the try', async () => {
    setup([], empty(), '/phone?here=1&parts=marking-scheme');
    await screen.findByRole('heading', { name: 'Baremul', level: 1 });
    await snap(jpeg('a.jpg'));
    await userEvent.click(screen.getByRole('button', { name: 'Trimite baremul' }));
    expect(await screen.findByRole('link', { name: 'Deschide încercarea' })).toBeInTheDocument();
    expect(screen.getByText('Sunt la încercare.')).toBeInTheDocument();
  });
});
