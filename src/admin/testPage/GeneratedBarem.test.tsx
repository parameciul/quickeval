import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TestInfo } from '../../../shared/api.ts';
import { DOCX_TYPE, PDF_TYPE } from '../../../shared/files.ts';
import { ApiError } from '../api.ts';
import { createFakeApi, FAKE_TOKEN, fakeTest } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

const TEST_FILE = { name: 'Test.pdf', type: PDF_TYPE };
const BAREM_FILE = { name: 'barem generat.docx', type: DOCX_TYPE };
const REPLACE = 'Înlocuiești baremul existent cu unul generat? Baremul de acum rămâne până vine cel nou.';

function apiWith(overrides: Partial<TestInfo> = {}) {
  return createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
    students: {},
    tests: [fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, files: { test: TEST_FILE, barem: null }, ...overrides })],
  });
}

afterEach(() => vi.restoreAllMocks());

describe('GeneratedBarem', () => {
  it('generates without asking when there is no barem', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const api = apiWith();
    renderAdmin('/tests/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Generează baremul' }));
    expect(api.generateBarem).toHaveBeenCalledWith('6E2-26T1', 'class');
    expect(confirm).not.toHaveBeenCalled();
    expect(await screen.findByText('Se generează baremul… Durează câteva minute.')).toBeInTheDocument();
  });

  it('asks before replacing a barem by generation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const api = apiWith({ files: { test: TEST_FILE, barem: { name: 'Barem.pdf', type: PDF_TYPE } } });
    renderAdmin('/tests/6E2-26T1#prepare', api);
    const button = await screen.findByRole('button', { name: 'Generează baremul' });
    await userEvent.click(button);
    expect(confirm).toHaveBeenLastCalledWith(REPLACE);
    expect(api.generateBarem).not.toHaveBeenCalled();
    await userEvent.click(button);
    expect(api.generateBarem).toHaveBeenCalledWith('6E2-26T1', 'class');
  });

  it('says that a scheduled evaluation is cancelled, with or without a barem', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const at = '2099-01-01T10:00:00.000Z';
    const { unmount } = renderAdmin('/tests/6E2-26T1#prepare', apiWith({ evaluationAt: at }));
    await userEvent.click(await screen.findByRole('button', { name: 'Generează baremul' }));
    expect(confirm).toHaveBeenLastCalledWith('Generezi baremul? Programarea evaluării se anulează.');
    unmount();
    const api = apiWith({ evaluationAt: at, files: { test: TEST_FILE, barem: { name: 'Barem.pdf', type: PDF_TYPE } } });
    renderAdmin('/tests/6E2-26T1#prepare', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Generează baremul' }));
    expect(confirm).toHaveBeenLastCalledWith(`${REPLACE} Programarea evaluării se anulează.`);
    expect(api.generateBarem).not.toHaveBeenCalled();
  });

  it('is disabled without a test file, with the hint', async () => {
    renderAdmin('/tests/6E2-26T1', apiWith({ files: { test: null, barem: null } }));
    expect(await screen.findByRole('button', { name: 'Generează baremul' })).toBeDisabled();
    expect(screen.getByText('Încarcă întâi testul.')).toBeInTheDocument();
  });

  it('is hidden while the robot grades with the barem', async () => {
    renderAdmin('/tests/6E2-26T1#prepare', apiWith({ status: 'evaluating', files: { test: TEST_FILE, barem: BAREM_FILE } }));
    await screen.findByText('Baremul:');
    expect(screen.queryByRole('button', { name: 'Generează baremul' })).not.toBeInTheDocument();
  });

  it('generates again in a done test, and says to grade again after the check', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const api = apiWith({ status: 'done', files: { test: TEST_FILE, barem: BAREM_FILE } });
    renderAdmin('/tests/6E2-26T1#prepare', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Generează baremul' }));
    expect(confirm).toHaveBeenCalledWith(`${REPLACE} După ce îl verifici, corectezi din nou lucrările cu „Recorectează tot”, din „Acțiuni”.`);
    expect(api.generateBarem).toHaveBeenCalledWith('6E2-26T1', 'class');
  });

  it('generates again while the exercise list has a problem, and says the papers wait', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const api = apiWith({
      status: 'evaluating',
      files: { test: TEST_FILE, barem: BAREM_FILE },
      exerciseList: { status: 'problem', message: 'Punctele nu se adună la 100.' },
    });
    renderAdmin('/tests/6E2-26T1#prepare', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Generează baremul' }));
    expect(confirm).toHaveBeenCalledWith(`${REPLACE} Lucrările așteaptă până verifici baremul nou.`);
    expect(api.generateBarem).toHaveBeenCalled();
  });

  it('tells in Corectare that the papers wait for the new barem', async () => {
    const files = { test: TEST_FILE, barem: BAREM_FILE };
    const { unmount } = renderAdmin('/tests/6E2-26T1#grading', apiWith({ status: 'evaluating', files, barem: { request: 'requested', unchecked: false } }));
    expect(await screen.findByText('Lucrările așteaptă baremul nou.')).toBeInTheDocument();
    expect(screen.getByText(/Se generează acum\. După ce îl verifici la Pregătire, corectarea continuă\./)).toBeInTheDocument();
    unmount();
    renderAdmin('/tests/6E2-26T1#grading', apiWith({ status: 'evaluating', files, barem: { request: 'none', unchecked: true } }));
    expect(await screen.findByText(/Verifică-l la Pregătire și confirmă-l\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mergi la Pregătire/ })).toBeInTheDocument();
  });

  // The robot waits for a barem made during the evaluation: the row must stay
  // open, or the papers would wait for ever.
  it('lets her check, replace or make again a barem that arrived during the evaluation', async () => {
    renderAdmin(
      '/tests/6E2-26T1#prepare',
      apiWith({ status: 'evaluating', files: { test: TEST_FILE, barem: BAREM_FILE }, barem: { request: 'none', unchecked: true } }),
    );
    expect(await screen.findByRole('button', { name: 'Am verificat baremul' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Generează baremul' })).toBeEnabled();
    expect(screen.getByLabelText('Înlocuiește baremul')).toBeEnabled();
    expect(screen.queryByText('Testul se corectează acum. Poți schimba fișierele după ce se termină corectarea.')).not.toBeInTheDocument();
  });

  it('tells in Corectare and Pregătire how a new barem made after the grading stands', async () => {
    const files = { test: TEST_FILE, barem: BAREM_FILE };
    const { unmount } = renderAdmin('/tests/6E2-26T1#grading', apiWith({ status: 'evaluating', files, barem: { request: 'failed', unchecked: true } }));
    expect(await screen.findByText(/Nu s-a putut genera\. La Pregătire îl generezi din nou sau încarci baremul tău\./)).toBeInTheDocument();
    unmount();
    // A new barem over a checked one: Pregătire says it is being made.
    renderAdmin('/tests/6E2-26T1#prepare', apiWith({ status: 'done', files, barem: { request: 'requested', unchecked: false } }));
    expect(await screen.findByText('Se generează baremul')).toBeInTheDocument();
  });

  it('says nothing in Corectare for a checked barem', async () => {
    renderAdmin('/tests/6E2-26T1#grading', apiWith({ status: 'evaluating', files: { test: TEST_FILE, barem: BAREM_FILE } }));
    await screen.findByRole('heading', { name: 'Corectare' });
    expect(screen.queryByText('Lucrările așteaptă baremul nou.')).not.toBeInTheDocument();
  });

  it('shows the waiting line while generating', async () => {
    renderAdmin('/tests/6E2-26T1', apiWith({ barem: { request: 'requested', unchecked: false } }));
    expect(await screen.findByText('Se generează baremul… Durează câteva minute.')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: 'Generează baremul' })).toBeDisabled();
  });

  it('shows the failure and retries', async () => {
    const api = apiWith({ barem: { request: 'failed', unchecked: false } });
    renderAdmin('/tests/6E2-26T1', api);
    expect(await screen.findByText('Nu am putut genera baremul.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(api.generateBarem).toHaveBeenCalledWith('6E2-26T1', 'class');
    expect(await screen.findByText('Se generează baremul… Durează câteva minute.')).toBeInTheDocument();
  });

  it('asks before a retry replaces an existing barem, and Renunță sends nothing', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const api = apiWith({ files: { test: TEST_FILE, barem: BAREM_FILE }, barem: { request: 'failed', unchecked: true } });
    renderAdmin('/tests/6E2-26T1', api);
    const button = await screen.findByRole('button', { name: 'Încearcă din nou' });
    await userEvent.click(button);
    expect(confirm).toHaveBeenLastCalledWith(REPLACE);
    expect(api.generateBarem).not.toHaveBeenCalled();
    await userEvent.click(button);
    expect(api.generateBarem).toHaveBeenCalledWith('6E2-26T1', 'class');
  });

  it('offers no confirm after a failed regeneration of an unchecked barem', async () => {
    renderAdmin('/tests/6E2-26T1', apiWith({ files: { test: TEST_FILE, barem: BAREM_FILE }, barem: { request: 'failed', unchecked: true } }));
    expect(await screen.findByText('Nu am putut genera baremul.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Am verificat baremul' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Barem generat automat/)).not.toBeInTheDocument();
  });

  it('offers no confirm while a new barem is generated over an unchecked one', async () => {
    renderAdmin('/tests/6E2-26T1', apiWith({ files: { test: TEST_FILE, barem: BAREM_FILE }, barem: { request: 'requested', unchecked: true } }));
    expect(await screen.findByText('Se generează baremul… Durează câteva minute.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Am verificat baremul' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Barem generat automat/)).not.toBeInTheDocument();
  });

  it('confirms an unchecked barem with the shown version', async () => {
    const api = apiWith({
      files: { test: TEST_FILE, barem: BAREM_FILE },
      barem: { request: 'none', unchecked: true },
      filesVersion: 7,
    });
    renderAdmin('/tests/6E2-26T1', api);
    const notice = await screen.findByText('Barem generat automat. Verifică-l și corectează-l în Word dacă e nevoie.');
    // A thing to look at, not an error: drawn as a marker, not in red.
    expect(notice).toHaveClass('warning');
    expect(notice).not.toHaveClass('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Am verificat baremul' }));
    expect(api.confirmBarem).toHaveBeenCalledWith('6E2-26T1', 7, 'class');
    expect(await screen.findByRole('button', { name: 'Generează baremul' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Am verificat baremul' })).not.toBeInTheDocument();
  });

  it('reloads and shows the error when the confirm is stale', async () => {
    const api = apiWith({ files: { test: TEST_FILE, barem: BAREM_FILE }, barem: { request: 'none', unchecked: true }, filesVersion: 7 });
    renderAdmin('/tests/6E2-26T1', api);
    await screen.findByRole('button', { name: 'Am verificat baremul' });
    api.getTest.mockClear();
    api.confirmBarem.mockRejectedValueOnce(new ApiError(409, 'stale', 'Baremul s-a schimbat. Reîncarcă pagina.'));
    await userEvent.click(screen.getByRole('button', { name: 'Am verificat baremul' }));
    expect(await screen.findByText('Baremul s-a schimbat. Reîncarcă pagina.')).toBeInTheDocument();
    await waitFor(() => expect(api.getTest).toHaveBeenCalled());
  });

  it('disables the start of the grading while the barem is unchecked', async () => {
    renderAdmin('/tests/6E2-26T1#grading', apiWith({ files: { test: TEST_FILE, barem: BAREM_FILE }, barem: { request: 'none', unchecked: true } }));
    expect(await screen.findByRole('button', { name: 'Închide încărcarea și pornește corectarea' })).toBeDisabled();
    expect(screen.getByText(/Verifică baremul generat înainte de evaluare\./)).toBeInTheDocument();
  });

  it('disables the start of the grading while the barem is generating', async () => {
    renderAdmin('/tests/6E2-26T1#grading', apiWith({ files: { test: TEST_FILE, barem: BAREM_FILE }, barem: { request: 'requested', unchecked: false } }));
    expect(await screen.findByRole('button', { name: 'Închide încărcarea și pornește corectarea' })).toBeDisabled();
    expect(screen.getByText(/Baremul se generează încă\./)).toBeInTheDocument();
  });

  it('does not ask to upload the barem during a first generation', async () => {
    renderAdmin('/tests/6E2-26T1#grading', apiWith({ barem: { request: 'requested', unchecked: false } }));
    expect(await screen.findByText(/Baremul se generează încă\./)).toBeInTheDocument();
    expect(screen.queryByText(/Încarcă baremul\./)).not.toBeInTheDocument();
  });
});
