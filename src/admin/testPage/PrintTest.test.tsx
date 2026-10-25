import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { TestInfo } from '../../../shared/api.ts';
import { PDF_TYPE } from '../../../shared/files.ts';
import { createFakeApi, FAKE_TOKEN, fakeTest } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

const TEST_FILE = { name: 'Test.pdf', type: PDF_TYPE };

function openApi(overrides: Partial<TestInfo> = {}) {
  return createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
    students: {},
    tests: [fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, files: { test: TEST_FILE, barem: null }, ...overrides })],
  });
}

describe('PrintTest', () => {
  it('asks for the test file first', async () => {
    renderAdmin('/teste/6E2-26T1', openApi({ files: { test: null, barem: null } }));
    expect(await screen.findByRole('heading', { name: 'Testul pentru tipărit' })).toBeInTheDocument();
    expect(screen.getByText('Încarcă testul ca să primești varianta cu cod QR.')).toBeInTheDocument();
  });

  it('says the PDF is being made', async () => {
    renderAdmin('/teste/6E2-26T1', openApi());
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toHaveAttribute('role', 'status');
  });

  it('offers the download when ready', async () => {
    renderAdmin('/teste/6E2-26T1', openApi({ print: { status: 'ready', fromWord: false } }));
    const link = await screen.findByRole('link', { name: 'Descarcă testul cu cod QR' });
    expect(link).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/print');
    expect(link).toHaveAttribute('download');
    expect(screen.getByText('Codul QR apare în colțul fiecărei pagini.')).toBeInTheDocument();
  });

  it('warns about a PDF made from Word', async () => {
    const word = /PDF-ul a fost făcut din fișierul Word/;
    const { unmount } = renderAdmin('/teste/6E2-26T1', openApi({ print: { status: 'ready', fromWord: true } }));
    expect(await screen.findByText(word)).toHaveTextContent('Pentru o copie exactă, încarcă testul ca PDF.');
    unmount();
    renderAdmin('/teste/6E2-26T1', openApi({ print: { status: 'ready', fromWord: false } }));
    await screen.findByRole('link', { name: 'Descarcă testul cu cod QR' });
    expect(screen.queryByText(word)).not.toBeInTheDocument();
  });

  it('retries a failed print', async () => {
    const api = openApi({ print: { status: 'failed', fromWord: false } });
    renderAdmin('/teste/6E2-26T1', api);
    expect(await screen.findByText('Nu am putut pregăti testul cu cod QR.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(api.retryPrint).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Încearcă din nou' })).not.toBeInTheDocument());
  });

  it('shows the block also while the upload links are hidden', async () => {
    renderAdmin('/teste/6E2-26T1', openApi());
    await userEvent.click(await screen.findByRole('button', { name: 'Ascunde linkurile' }));
    expect(screen.getByRole('heading', { name: 'Testul pentru tipărit' })).toBeInTheDocument();
  });
});
