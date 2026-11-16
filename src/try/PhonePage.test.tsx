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

function setup(pages: SubmissionFile[] = [], test = tryTest({ title: 'Fracții 6B' })) {
  const api = createFakeApi({ classes: [], students: {}, tests: [test] });
  const tryApi = createFakeTryApi({ pages });
  renderTry('/telefon', api, tryApi);
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

  it('is read only once the paper is sent', async () => {
    setup([page(1, 'a.pdf')], tryTest({ status: 'evaluating' }, { status: 'submitted' }));
    expect(await screen.findByText('Lucrarea a fost trimisă. Nu mai poți schimba paginile.')).toBeInTheDocument();
    expect(await screen.findByText('a.pdf')).toBeInTheDocument();
    expect(screen.queryByLabelText('Fă o poză')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Șterge/ })).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('turns read only when a page is refused because the paper was sent', async () => {
    const { api, tryApi } = setup();
    await screen.findByRole('heading', { name: 'Lucrarea elevului', level: 1 });
    tryApi.uploadPage.mockRejectedValueOnce(new ApiError(409, 'paper_sent', 'Lucrarea a plecat deja la corectare.'));
    api.getTest.mockResolvedValue(tryTest({ status: 'evaluating' }, { status: 'submitted' }));
    await pick([jpeg('pagina-1.jpg')]);
    expect(await screen.findByText('Lucrarea a fost trimisă. Nu mai poți schimba paginile.')).toBeInTheDocument();
    expectNoGradingWords();
  });

  it('shows the expired notice for an expired try', async () => {
    const api = createFakeApi({ classes: [], students: {}, tests: [tryTest()] });
    renderTry('/telefon', api, createFakeTryApi({ info: { expired: true } }));
    expect(await screen.findByRole('heading', { name: 'Încercarea a expirat' })).toBeInTheDocument();
  });
});
