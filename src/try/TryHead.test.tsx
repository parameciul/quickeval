import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { QUICK_TRY_TITLE } from '../../shared/quickTry.ts';
import { createFakeApi } from '../test/fakeApi.ts';
import { ApiError } from '../ui/ApiError.ts';
import { createFakeTryApi, renderTry, TRY_CODE, TRY_TOKEN, tryTest } from '../test/fakeTryApi.tsx';

const files = { test: { name: 'test.pdf', type: PDF_TYPE }, barem: { name: 'barem.pdf', type: PDF_TYPE } };

// A try in grading, sent at 09:30 Bucharest time; its link works until 17 November.
function setup(title = 'Test funcții 9B') {
  const test = tryTest(
    { status: 'evaluating', files, title },
    { status: 'submitted', startedAt: '2026-11-10T07:20:00.000Z', submittedAt: '2026-11-10T07:30:00.000Z' },
  );
  const api = createFakeApi({ classes: [], students: {}, tests: [test] });
  renderTry('/', api, createFakeTryApi());
  return api;
}

describe("the try's header", () => {
  it("names the try, and says when it was sent and until when its link works", async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'Test funcții 9B', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Încercare rapidă')).toBeInTheDocument();
    expect(screen.getByText('Trimisă la corectare 10 nov. 2026, 09:30 · Linkul merge până pe 17 noiembrie 2026')).toBeInTheDocument();
  });

  it('says only once that it is a quick try when the try has the default name', async () => {
    setup(QUICK_TRY_TITLE);
    expect(await screen.findByRole('heading', { name: QUICK_TRY_TITLE, level: 1 })).toBeInTheDocument();
    expect(screen.getAllByText(QUICK_TRY_TITLE)).toHaveLength(1);
  });

  it('lets her download the test and the barem the try used', async () => {
    setup();
    expect(await screen.findByRole('link', { name: 'Descarcă testul' })).toHaveAttribute('href', `/api/try/${TRY_TOKEN}/tests/${TRY_CODE}/files/test`);
    expect(screen.getByRole('link', { name: 'Descarcă baremul' })).toHaveAttribute('href', `/api/try/${TRY_TOKEN}/tests/${TRY_CODE}/files/barem`);
  });

  it('renames the try', async () => {
    const api = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Schimbă numele' }));
    const name = screen.getByRole('textbox', { name: 'Numele testului' });
    expect(name).toHaveValue('Test funcții 9B');
    await userEvent.clear(name);
    await userEvent.type(name, 'Teză semestrul I');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(await screen.findByRole('heading', { name: 'Teză semestrul I', level: 1 })).toBeInTheDocument();
    expect(api.renameTest).toHaveBeenCalledWith(TRY_CODE, 'Teză semestrul I');
    expect(screen.getByRole('button', { name: 'Schimbă numele' })).toHaveFocus();
  });

  it('keeps the name when she gives up the rename', async () => {
    const api = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Schimbă numele' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Numele testului' }), ' nou');
    await userEvent.click(screen.getByRole('button', { name: 'Renunță' }));
    expect(screen.getByRole('heading', { name: 'Test funcții 9B', level: 1 })).toBeInTheDocument();
    expect(api.renameTest).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Schimbă numele' })).toHaveFocus();
  });

  it("shows the server's refusal of a name and keeps the form open", async () => {
    const api = setup();
    api.renameTest.mockRejectedValueOnce(new ApiError(400, 'invalid_body', 'Scrie titlul testului.'));
    await userEvent.click(await screen.findByRole('button', { name: 'Schimbă numele' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(await screen.findByText('Scrie titlul testului.')).toBeInTheDocument();
    expect(within(screen.getByRole('form', { name: 'Schimbă numele' })).getByRole('textbox')).toHaveValue('Test funcții 9B');
  });
});
