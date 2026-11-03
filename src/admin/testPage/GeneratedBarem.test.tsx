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
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Generează baremul' }));
    expect(api.generateBarem).toHaveBeenCalledWith('6E2-26T1');
    expect(confirm).not.toHaveBeenCalled();
    expect(await screen.findByText('Se generează baremul… Durează câteva minute.')).toBeInTheDocument();
  });

  it('asks before replacing a barem by generation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const api = apiWith({ files: { test: TEST_FILE, barem: { name: 'Barem.pdf', type: PDF_TYPE } } });
    renderAdmin('/teste/6E2-26T1', api);
    const button = await screen.findByRole('button', { name: 'Generează baremul' });
    await userEvent.click(button);
    expect(confirm).toHaveBeenLastCalledWith(REPLACE);
    expect(api.generateBarem).not.toHaveBeenCalled();
    await userEvent.click(button);
    expect(api.generateBarem).toHaveBeenCalledWith('6E2-26T1');
  });

  it('is disabled without a test file, with the hint', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ files: { test: null, barem: null } }));
    expect(await screen.findByRole('button', { name: 'Generează baremul' })).toBeDisabled();
    expect(screen.getByText('Încarcă întâi testul.')).toBeInTheDocument();
  });

  it('is hidden in evaluation and done', async () => {
    const { unmount } = renderAdmin('/teste/6E2-26T1', apiWith({ status: 'evaluating' }));
    await screen.findByText('Baremul:');
    expect(screen.queryByRole('button', { name: 'Generează baremul' })).not.toBeInTheDocument();
    unmount();
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'done' }));
    await screen.findByText('Baremul:');
    expect(screen.queryByRole('button', { name: 'Generează baremul' })).not.toBeInTheDocument();
  });

  it('shows the waiting line while generating', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ barem: { request: 'requested', unchecked: false } }));
    expect(await screen.findByText('Se generează baremul… Durează câteva minute.')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: 'Generează baremul' })).toBeDisabled();
  });

  it('shows the failure and retries', async () => {
    const api = apiWith({ barem: { request: 'failed', unchecked: false } });
    renderAdmin('/teste/6E2-26T1', api);
    expect(await screen.findByText('Nu am putut genera baremul.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(api.generateBarem).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByText('Se generează baremul… Durează câteva minute.')).toBeInTheDocument();
  });

  it('confirms an unchecked barem with the shown version', async () => {
    const api = apiWith({
      files: { test: TEST_FILE, barem: BAREM_FILE },
      barem: { request: 'none', unchecked: true },
      filesVersion: 7,
    });
    renderAdmin('/teste/6E2-26T1', api);
    expect(await screen.findByText('Barem generat automat. Verifică-l și corectează-l în Word dacă e nevoie.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Am verificat baremul' }));
    expect(api.confirmBarem).toHaveBeenCalledWith('6E2-26T1', 7);
    expect(await screen.findByRole('button', { name: 'Generează baremul' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Am verificat baremul' })).not.toBeInTheDocument();
  });

  it('reloads and shows the error when the confirm is stale', async () => {
    const api = apiWith({ files: { test: TEST_FILE, barem: BAREM_FILE }, barem: { request: 'none', unchecked: true }, filesVersion: 7 });
    renderAdmin('/teste/6E2-26T1', api);
    await screen.findByRole('button', { name: 'Am verificat baremul' });
    api.getTest.mockClear();
    api.confirmBarem.mockRejectedValueOnce(new ApiError(409, 'stale', 'Baremul s-a schimbat. Reîncarcă pagina.'));
    await userEvent.click(screen.getByRole('button', { name: 'Am verificat baremul' }));
    expect(await screen.findByText('Baremul s-a schimbat. Reîncarcă pagina.')).toBeInTheDocument();
    await waitFor(() => expect(api.getTest).toHaveBeenCalled());
  });

  it('disables the evaluation buttons while the barem is unchecked', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ files: { test: TEST_FILE, barem: BAREM_FILE }, barem: { request: 'none', unchecked: true } }));
    expect(await screen.findByRole('button', { name: 'Pornește evaluarea acum' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Programează' })).toBeDisabled();
    expect(screen.getByText(/Verifică baremul generat înainte de evaluare\./)).toBeInTheDocument();
  });

  it('disables the evaluation buttons while the barem is generating', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ files: { test: TEST_FILE, barem: BAREM_FILE }, barem: { request: 'requested', unchecked: false } }));
    expect(await screen.findByRole('button', { name: 'Pornește evaluarea acum' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Programează' })).toBeDisabled();
    expect(screen.getByText(/Baremul se generează încă\./)).toBeInTheDocument();
  });
});
