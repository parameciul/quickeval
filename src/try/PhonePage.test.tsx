import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionFile } from '../../shared/api.ts';
import { ApiError } from '../ui/ApiError.ts';
import { createFakeApi } from '../test/fakeApi.ts';
import { createFakeTryApi, renderTry, tryTest } from '../test/fakeTryApi.tsx';
import { expectNoGradingWords } from '../test/gradingWords.ts';

const page = (id: number, name: string): SubmissionFile => ({ id, name, contentType: 'application/pdf', size: 900, position: id });
const jpeg = (name: string) => new File([new Uint8Array(10)], name, { type: 'image/jpeg' });

function setup(pages: SubmissionFile[] = [], test = tryTest({ title: 'Fracții 6B' }), path = '/phone') {
  const api = createFakeApi({ classes: [], students: {}, tests: [test] });
  const tryApi = createFakeTryApi({ pages });
  renderTry(path, api, tryApi);
  return { api, tryApi };
}

const pick = (files: File[]) => userEvent.upload(screen.getByLabelText('Alege fișiere'), files);

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
    setup([], undefined, '/telefon?here=1');
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

  it('on the phone that made the try, leads to the try before any page is sent', async () => {
    setup([], undefined, '/phone?here=1');
    await screen.findByRole('heading', { name: 'Lucrarea elevului', level: 1 });
    expect(screen.getByRole('button', { name: 'Am terminat' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Deschide încercarea' })).toBeInTheDocument();
    expectNoGradingWords();
  });

  it('on the phone that made the try, hides the link to the try while a page is on its way', async () => {
    const { tryApi } = setup([], undefined, '/phone?here=1');
    let arrive: (file: SubmissionFile) => void = () => {};
    tryApi.uploadPage.mockImplementationOnce(() => new Promise<SubmissionFile>((done) => (arrive = done)));
    await screen.findByRole('heading', { name: 'Lucrarea elevului', level: 1 });
    expect(screen.getByRole('link', { name: 'Deschide încercarea' })).toBeInTheDocument();
    await pick([jpeg('pagina-1.jpg')]);
    await waitFor(() => expect(tryApi.uploadPage).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('link', { name: 'Deschide încercarea' })).not.toBeInTheDocument();
    arrive(page(901, 'pagina-1.jpg'));
    expect(await screen.findByRole('link', { name: 'Deschide încercarea' })).toBeInTheDocument();
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
